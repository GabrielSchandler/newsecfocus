// ============================================================================
//  Banco local para testes: as migrations reais rodando num Postgres em memória.
//
//  Usa PGlite (Postgres compilado para WebAssembly), então não precisa de
//  Docker, de Supabase CLI nem de senha do banco de produção. O que é exclusivo
//  do Supabase ganha um substituto mínimo:
//
//    • auth.uid() lê o "sub" de request.jwt.claims — o mesmo mecanismo do
//      PostgREST, então as políticas de RLS são exercitadas de verdade;
//    • cron.schedule não agenda nada (a consolidação é chamada à mão);
//    • now() pode ser congelado com definirAgora(): uma função public.now()
//      que as funções SQL sem search_path fixo passam a enxergar primeiro.
// ============================================================================

import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const PASTA_MIGRATIONS = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");

const SUBSTITUTOS_SUPABASE = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (
      id uuid primary key, email text,
      raw_user_meta_data jsonb default '{}'::jsonb,
      created_at timestamptz default now()
  );
  create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claims', true)::jsonb->>'sub', '')::uuid $$;
  create function auth.role() returns text language sql stable as
      $$ select coalesce(current_setting('request.jwt.claims', true)::jsonb->>'role', 'anon') $$;
  create function auth.jwt() returns jsonb language sql stable as
      $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
  create schema cron;
  create function cron.schedule(a text, b text, c text) returns bigint language sql as $$ select 1::bigint $$;
  create function cron.unschedule(a text) returns boolean language sql as $$ select true $$;
  grant usage on schema auth to authenticated, anon;
`;

/**
 * Sobe um banco com as migrations aplicadas.
 * @param {{ ate?: string }} opcoes  ate: aplica só até esta migration (inclusive)
 */
export async function criarBanco({ ate } = {}) {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(SUBSTITUTOS_SUPABASE);

  const arquivos = readdirSync(PASTA_MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .filter((f) => !ate || f <= ate);

  for (const arquivo of arquivos) {
    let sql = readFileSync(join(PASTA_MIGRATIONS, arquivo), "utf8");
    // pg_cron não existe fora do Supabase; o agendamento é substituído acima.
    sql = sql.replace(/create extension if not exists pg_cron[^;]*;/gi, "");
    try {
      await db.exec(sql);
    } catch (e) {
      throw new Error(`Migration ${arquivo} falhou no banco local: ${e.message}`);
    }
  }

  // O Supabase concede isto por privilégio padrão; aqui é explícito.
  await db.exec(`
    grant usage on schema public to authenticated, anon;
    grant select, insert, update, delete on all tables in schema public to authenticated;
    create or replace function public.now() returns timestamptz language sql stable as
      $$ select coalesce(nullif(current_setting('teste.agora', true), '')::timestamptz,
                         pg_catalog.transaction_timestamp()) $$;
    set search_path to public, pg_catalog;
  `);

  return db;
}

/** Congela o relógio das funções do painel. */
export async function definirAgora(db, instante) {
  await db.query(`select set_config('teste.agora', $1, false)`, [
    instante instanceof Date ? instante.toISOString() : instante,
  ]);
}

/**
 * Executa `fn` como um usuário logado (role authenticated + claims do JWT),
 * exatamente como uma chamada do painel chega ao banco.
 */
export async function comoUsuario(db, usuarioId, fn) {
  await db.exec("begin");
  try {
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub: usuarioId, role: "authenticated" }),
    ]);
    await db.exec("set local role authenticated");
    return await fn();
  } finally {
    await db.exec("rollback");
  }
}

// ----------------------------------------------------------------------------
//  Fábrica de dados
// ----------------------------------------------------------------------------

export async function criarEmpresa(db, { nome = "Empresa teste", fuso = "America/Sao_Paulo", intervalo = null } = {}) {
  const { rows } = await db.query(
    `insert into organizations (name, slug, fuso, sync_interval_minutes) values ($1, $2, $3, $4) returning id`,
    [nome, `empresa-${Math.random().toString(36).slice(2)}`, fuso, intervalo],
  );
  return rows[0].id;
}

export async function criarEquipe(db, orgId, nome) {
  const { rows } = await db.query(
    `insert into teams (org_id, nome) values ($1, $2) returning id`,
    [orgId, nome],
  );
  return rows[0].id;
}

export async function criarPessoa(db, orgId, { nome, equipeId = null, completo = true }) {
  const { rows } = await db.query(
    `insert into employees (org_id, team_id, os_user, nome, perfil_completo)
     values ($1, $2, $3, $4, $5) returning id`,
    [orgId, equipeId, nome.toLowerCase().replace(/\s+/g, "."), nome, completo],
  );
  return rows[0].id;
}

export async function criarEstacao(db, orgId, maquina, { ultimoEnvio = null } = {}) {
  const { rows } = await db.query(
    `insert into devices (org_id, machine_name, hardware_id, last_sync_at)
     values ($1, $2, $3, $4) returning id`,
    [orgId, maquina, `hw-${maquina}-${Math.random()}`, ultimoEnvio],
  );
  return rows[0].id;
}

export async function criarUsuario(db, orgId, { papel = "OWNER", equipeId = null } = {}) {
  const { rows } = await db.query(`select gen_random_uuid() as id`);
  const id = rows[0].id;
  await db.query(`insert into auth.users (id, email) values ($1, $2)`, [id, `${id}@teste.local`]);
  await db.query(
    `insert into profiles (id, org_id, role, team_id) values ($1, $2, $3, $4)`,
    [id, orgId, papel, equipeId],
  );
  return id;
}

/** Escala da pessoa num dia da semana (isodow: 1 = segunda). */
export async function definirEscala(db, orgId, pessoaId, diaSemana, { trabalha = true, inicio = "08:00", fim = "18:00", intervalo = null } = {}) {
  await db.query(
    `insert into escalas_expediente
        (org_id, escopo, colaborador_id, dia_semana, trabalha, inicio, fim, intervalo_inicio, intervalo_fim)
     values ($1, 'PESSOA', $2, $3, $4, $5, $6, $7, $8)`,
    [orgId, pessoaId, diaSemana, trabalha, inicio, fim, intervalo?.[0] ?? null, intervalo?.[1] ?? null],
  );
}

const CATEGORIAS_SINTETICAS = {
  PRODUCTIVE: ["Trabalho", "#1f9fb2"],
  NEUTRAL: ["Comunicação e apoio", "#3d5f8f"],
  UNPRODUCTIVE: ["Lazer e redes sociais", "#e0676b"],
};

export async function classificar(db, orgId, { processo = null, dominio = null, tipo }) {
  const [nome, cor] = CATEGORIAS_SINTETICAS[tipo];
  const { rows } = await db.query(
    `insert into productivity_categories (org_id, name, type, color) values ($1, $2, $3, $4)
     on conflict (org_id, name) do update set type = excluded.type returning id`,
    [orgId, nome, tipo, cor],
  );
  await db.query(
    `insert into app_mappings (org_id, process_name, domain, category_id) values ($1, $2, $3, $4)`,
    [orgId, processo, dominio, rows[0].id],
  );
}

/**
 * Grava `quantidade` minutos consecutivos de atividade a partir de `inicio`.
 * `recebidoEm` simula quando o lote chegou (created_at), para testar a
 * consolidação incremental.
 */
export async function gravarMinutos(db, { orgId, pessoaId, estacaoId, inicio, quantidade, processo = "excel.exe", dominio = null, ocioso = false, bloqueado = false, recebidoEm = null }) {
  const base = new Date(inicio).getTime();
  const valores = [];
  const params = [];
  for (let i = 0; i < quantidade; i++) {
    const p = params.length;
    valores.push(`($${p + 1}, $${p + 2}, $${p + 3}, $${p + 4}, $${p + 5}, $${p + 6}, $${p + 7}, $${p + 8}, $${p + 9}, $${p + 10})`);
    params.push(
      estacaoId, orgId, pessoaId, new Date(base + i * 60_000).toISOString(), processo, dominio,
      ocioso, bloqueado, ocioso || bloqueado ? 0 : 50, recebidoEm ?? new Date().toISOString(),
    );
  }
  await db.query(
    `insert into activity_logs
        (device_id, org_id, employee_id, "timestamp", process_name, domain, is_idle, is_locked, active_seconds, created_at)
     values ${valores.join(", ")}`,
    params,
  );
}

export async function consolidar(db, desde = "2000-01-01T00:00:00Z") {
  await db.query(`select * from consolidar_resumos($1)`, [desde]);
}

/** Instante de uma hora de parede em São Paulo (UTC−3, sem horário de verão). */
export function sp(dia, hora) {
  return new Date(`${dia}T${hora}:00-03:00`);
}
