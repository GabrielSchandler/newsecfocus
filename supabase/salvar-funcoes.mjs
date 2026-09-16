// Fotografa as funções do banco antes de uma migration que troca várias delas.
// Uso: SENHA_BANCO=... node salvar-funcoes.mjs
//
// Gera supabase/backup-producao/funcoes-AAAA-MM-DD-HHMM.sql. Rodar esse arquivo
// no banco devolve cada função à definição e às permissões de agora — é o
// caminho de volta junto com o código anterior do GitHub. Funções que a
// migration criar do zero continuam lá, mas nada no código antigo as chama.
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

// Só as funções que uma migration consegue trocar: do schema public, do dono
// da conexão e fora de extensões (pg_cron, pgcrypto...). Permissão nula vira
// o padrão explícito, para a volta desfazer também um revoke da migration.
export const CONSULTA_FUNCOES = `
  select format('public.%I(%s)', p.proname, oidvectortypes(p.proargtypes)) as assinatura,
         pg_get_functiondef(p.oid) as definicao,
         (select coalesce(json_agg(json_build_object(
                    'papel', case when a.grantee = 0 then 'public' else quote_ident(r.rolname) end,
                    'privilegio', a.privilege_type)), '[]')
            from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
            left join pg_roles r on r.oid = a.grantee) as permissoes
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.prokind = 'f'
     and p.proowner = (select oid from pg_roles where rolname = current_user)
     and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
   order by 1`;

export function montarBackup(funcoes, agora = new Date()) {
  const partes = [
    `-- Funções do schema public em ${agora.toISOString()} (${funcoes.length} funções).`,
    `-- Para voltar: aplicar este arquivo inteiro no banco.`,
    `begin;`,
  ];

  for (const f of funcoes) {
    const definicao = f.definicao.trim();
    if (definicao.includes("$bkp$") || definicao.includes("$def$")) {
      throw new Error(`delimitador em uso em ${f.assinatura}`);
    }
    const literal = f.assinatura.replace(/'/g, "''");
    const permissoes = typeof f.permissoes === "string" ? JSON.parse(f.permissoes) : f.permissoes;

    // "create or replace" primeiro: drop incondicional falharia nas funções de
    // gatilho e de política, que têm dependentes. Só quando o banco recusa a
    // troca (tipo de retorno ou padrão de parâmetro mudou, 42P13) a função é
    // apagada e recriada — e essas não têm dependentes.
    // Depois, as permissões: tira tudo o que houver hoje e devolve as da foto.
    partes.push(
      [
        ``,
        `-- ${f.assinatura}`,
        `do $bkp$`,
        `declare r record;`,
        `begin`,
        `  begin`,
        `    execute $def$${definicao}$def$;`,
        `  exception when invalid_function_definition then`,
        `    execute 'drop function if exists ${literal}';`,
        `    execute $def$${definicao}$def$;`,
        `  end;`,
        `  for r in select distinct case when a.grantee = 0 then 'public' else quote_ident(g.rolname) end as papel`,
        `             from pg_proc p`,
        `             cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a`,
        `             left join pg_roles g on g.oid = a.grantee`,
        `            where p.oid = '${literal}'::regprocedure loop`,
        `    execute format('revoke all on function %s from %s', '${literal}', r.papel);`,
        `  end loop;`,
        ...permissoes.map((p) => `  execute 'grant ${p.privilegio} on function ${literal} to ${p.papel}';`),
        `end $bkp$;`,
      ].join("\n"),
    );
  }
  partes.push(`\ncommit;\n`);
  return partes.join("\n");
}

async function principal() {
  const REF = "auwotdrgxjrrhhhmmekc";
  if (!process.env.SENHA_BANCO) {
    console.error("Defina SENHA_BANCO antes de rodar.");
    process.exit(1);
  }

  const c = new pg.Client({
    connectionString: `postgresql://postgres.${REF}:${process.env.SENHA_BANCO}@aws-0-sa-east-1.pooler.supabase.com:5432/postgres`,
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  const { rows } = await c.query(CONSULTA_FUNCOES);
  await c.end();

  const agora = new Date();
  const carimbo = agora.toISOString().slice(0, 16).replace("T", "-").replace(":", "");
  const pasta = new URL("./backup-producao/", import.meta.url);
  mkdirSync(pasta, { recursive: true });
  writeFileSync(new URL(`funcoes-${carimbo}.sql`, pasta), montarBackup(rows, agora));
  console.log(`Backup salvo: supabase/backup-producao/funcoes-${carimbo}.sql (${rows.length} funções)`);
}

// Roda só quando chamado direto (o teste importa as funções acima).
if (process.argv[1] && resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase()) {
  await principal();
}
