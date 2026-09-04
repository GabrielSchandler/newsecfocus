// ============================================================================
//  Confere se os números do painel batem com a realidade.
//
//  POR QUE ISTO EXISTE
//
//  Em 04/09/2026 o Gabriel reparou que o gráfico mostrava 1h25 de atividade
//  dentro de uma janela de 1 hora. Era um join de classificação que casava o
//  mesmo minuto com duas regras (uma por processo, outra por domínio) e o
//  contava duas vezes. Estavam inflados 38% de TUDO: tempo total, aderência à
//  jornada, horas extras — e o índice de produtividade estava corrompido,
//  porque um minuto podia entrar como produtivo e neutro ao mesmo tempo.
//
//  O bug passou despercebido porque nada comparava o agregado com o dado cru.
//  Build passava, testes passavam, telas abriam. Só um olho humano num gráfico
//  pegou.
//
//  Este script testa INVARIANTES — afirmações que precisam ser verdade sempre,
//  independentemente dos dados. Rodar depois de mexer em consolidação,
//  classificação ou em qualquer RPC do painel.
//
//  USO
//    SENHA_BANCO=<senha> node supabase/verificar-numeros.mjs
//    SENHA_BANCO=<senha> EMAIL=<conta> node supabase/verificar-numeros.mjs
//
//  Sai com código 1 se algo divergir, então serve em automação.
// ============================================================================

import pg from "pg";

const REF = "auwotdrgxjrrhhhmmekc";
const EMAIL = process.env.EMAIL ?? "gmarquessch@gmail.com";
const SENHA = process.env.SENHA_BANCO;

if (!SENHA) {
  console.error("Defina SENHA_BANCO com a senha do banco Supabase.");
  process.exit(2);
}

const c = new pg.Client({
  connectionString: `postgresql://postgres.${REF}:${SENHA}@aws-0-sa-east-1.pooler.supabase.com:5432/postgres`,
  ssl: { rejectUnauthorized: false },
});
await c.connect();

let falhas = 0;
const conferir = (ok, nome, detalhe = "") => {
  if (!ok) falhas++;
  console.log(`  ${ok ? "ok    " : "FALHOU"} ${nome}${detalhe ? "  → " + detalhe : ""}`);
};

async function invariante(nome, sql, params = []) {
  const { rows } = await c.query(sql, params);
  if (rows.length === 0) {
    console.log(`  ok     ${nome}`);
  } else {
    falhas++;
    console.log(`  FALHOU ${nome}  (${rows.length} violação(ões))`);
    console.table(rows.slice(0, 5));
  }
}

// ---------------------------------------------------------------------------
//  Camada 1 — os agregados contra o dado cru
// ---------------------------------------------------------------------------
console.log("\n=== AGREGADO x DADO CRU ===");

// A consolidação roda de 10 em 10 minutos (pg_cron), então o que chegou agora
// ainda não está no agregado. Sem essa folga, a verificação acusaria erro o
// tempo todo — e verificação que sempre grita é verificação que ninguém lê.
const FOLGA = "20 minutes";

await invariante(
  "resumo_horario soma exatamente os minutos já consolidados",
  // Os dois lados são cortados na MESMA virada de hora. Sem isso, o dado cru
  // traria minutos da hora em curso que o agregado (que fecha por hora) ainda
  // não tem, e seria preciso tolerar até 60 minutos de diferença — folga
  // grande o bastante para esconder um bug de verdade.
  `with corte as (select date_trunc('hour', now() - interval '${FOLGA}') as ate)
   select o.id as org, a.total as cru, coalesce(r.total,0) as agregado
     from organizations o
     cross join corte
     left join lateral (select count(*) as total from activity_logs l
                         where l.org_id=o.id and l.employee_id is not null
                           and l."timestamp" < corte.ate) a on true
     left join lateral (select sum(minutos_registrados) as total from resumo_horario h
                         where h.org_id=o.id and h.hora < corte.ate) r on true
    where a.total <> coalesce(r.total,0)`);

await invariante(
  "resumo_diario bate com resumo_horario dia a dia",
  `with h as (
     select r.org_id, (r.hora at time zone o.fuso)::date as dia, sum(r.minutos_registrados) as m
       from resumo_horario r join organizations o on o.id=r.org_id group by 1,2),
   d as (select org_id, dia, sum(minutos_registrados) as m from resumo_diario group by 1,2)
   select coalesce(h.org_id,d.org_id) as org, coalesce(h.dia,d.dia) as dia,
          h.m as por_hora, d.m as por_dia
     from h full join d on d.org_id=h.org_id and d.dia=h.dia
    where coalesce(h.m,-1) <> coalesce(d.m,-1)`);

// ---------------------------------------------------------------------------
//  Camada 2 — coerência dentro de cada linha do agregado
//
//  As categorias cobrem só o tempo ATIVO (a consolidação filtra por estado),
//  então elas somam minutos_ativos, não minutos_registrados. Ocioso e
//  bloqueado ficam fora de categoria de propósito.
// ---------------------------------------------------------------------------
console.log("\n=== COERÊNCIA DE CADA LINHA ===");

for (const tabela of ["resumo_horario", "resumo_diario"]) {
  await invariante(
    `ativo + ocioso + bloqueado = registrado (${tabela})`,
    `select * from ${tabela}
      where minutos_ativos + minutos_ociosos + minutos_bloqueado <> minutos_registrados`);

  await invariante(
    `categorias somam o tempo ativo (${tabela})`,
    `select * from ${tabela}
      where minutos_produtivos + minutos_neutros + minutos_improdutivos + minutos_sem_classificar
            <> minutos_ativos`);

  await invariante(
    `nenhum minuto negativo (${tabela})`,
    `select * from ${tabela}
      where least(minutos_registrados, minutos_ativos, minutos_ociosos, minutos_bloqueado,
                  minutos_produtivos, minutos_neutros, minutos_improdutivos,
                  minutos_sem_classificar) < 0`);
}

// ---------------------------------------------------------------------------
//  Camada 3 — limites físicos: o relógio não estica
// ---------------------------------------------------------------------------
console.log("\n=== LIMITES FÍSICOS ===");

await invariante(
  "ninguém passa de 60 minutos numa hora",
  `select employee_id, device_id, hora, minutos_registrados
     from resumo_horario where minutos_registrados > 60`);

await invariante(
  "ninguém passa de 1440 minutos num dia",
  `select employee_id, device_id, dia, minutos_registrados
     from resumo_diario where minutos_registrados > 1440`);

await invariante(
  "tempo por aplicativo não excede o registrado no dia",
  `with app as (select org_id, employee_id, dia, sum(minutos) as m from resumo_app_diario group by 1,2,3),
        tot as (select org_id, employee_id, dia, sum(minutos_registrados) as m from resumo_diario group by 1,2,3)
   select app.* from app join tot using (org_id, employee_id, dia) where app.m > tot.m`);

// ---------------------------------------------------------------------------
//  Camada 4 — a classificação não pode multiplicar linhas
//
//  Este é o invariante que teria pego o bug de 04/09/2026 no primeiro dia.
// ---------------------------------------------------------------------------
console.log("\n=== CLASSIFICAÇÃO: UM MINUTO, UMA LINHA ===");

await invariante(
  "classificar_atividade devolve uma linha por minuto",
  `select a.n as minutos, c.n as linhas
     from (select count(*) as n from activity_logs
            where employee_id is not null and "timestamp" >= now() - interval '30 days') a,
          (select count(*) as n from classificar_atividade(now() - interval '30 days', now())) c
    where a.n <> c.n`);

// ---------------------------------------------------------------------------
//  Camada 5 — as consultas do painel contra a conta feita à mão
// ---------------------------------------------------------------------------
console.log("\n=== CONSULTAS DO PAINEL ===");

const { rows: [usuario] } = await c.query(
  `select id from auth.users where email = $1`, [EMAIL]);

if (!usuario) {
  console.log(`  (pulado: conta ${EMAIL} não existe neste banco)`);
} else {
  await c.query("begin");
  await c.query("set local role authenticated");
  // As RPCs resolvem a empresa por auth.uid(); como dono do banco ele é nulo e
  // tudo voltaria vazio, dando falso "ok".
  await c.query(
    `select set_config('request.jwt.claims',
        json_build_object('sub',$1::text,'role','authenticated')::text, true)`, [usuario.id]);

  const INI = "2000-01-01T00:00:00Z";
  const FIM = "2100-01-01T00:00:00Z";

  const { rows: [k] } = await c.query(`select * from painel_kpis($1,$2)`, [INI, FIM]);
  const { rows: [m] } = await c.query(`
    select coalesce(sum(minutos_registrados),0) r, coalesce(sum(minutos_ativos),0) a,
           coalesce(sum(minutos_produtivos),0) p, coalesce(sum(minutos_neutros),0) n,
           coalesce(sum(minutos_improdutivos),0) i, coalesce(sum(teclas),0) t
      from resumo_diario where org_id = org_em_foco(null)`);

  conferir(Number(k.minutos_registrados) === Number(m.r), "KPI: minutos registrados",
    `rpc=${k.minutos_registrados} agregado=${m.r}`);
  conferir(Number(k.minutos_ativos) === Number(m.a), "KPI: minutos ativos",
    `rpc=${k.minutos_ativos} agregado=${m.a}`);
  conferir(Number(k.teclas) === Number(m.t), "KPI: teclas",
    `rpc=${k.teclas} agregado=${m.t}`);

  const classificado = Number(m.p) + Number(m.n) + Number(m.i);
  const indiceEsperado = classificado > 0
    ? Number((Number(m.p) * 100 / classificado).toFixed(1)) : null;
  conferir(Number(k.indice) === indiceEsperado || (k.indice === null && indiceEsperado === null),
    "índice = produtivo / classificado", `rpc=${k.indice} esperado=${indiceEsperado}`);

  const { rows: serie } = await c.query(`select * from painel_serie($1,$2,'day')`, [INI, FIM]);
  conferir(serie.reduce((s, p) => s + Number(p.minutos_ativos), 0) === Number(k.minutos_ativos),
    "série do gráfico soma o mesmo que o KPI");

  const { rows: rank } = await c.query(
    `select * from painel_ranking_colaboradores($1,$2,null,5000)`, [INI, FIM]);
  conferir(rank.reduce((s, r) => s + Number(r.minutos_ativos), 0) === Number(k.minutos_ativos),
    "ranking de pessoas soma o mesmo que o KPI");

  const { rows: eq } = await c.query(`select * from painel_ranking_equipes($1,$2)`, [INI, FIM]);
  conferir(eq.reduce((s, r) => s + Number(r.minutos_ativos), 0) === Number(k.minutos_ativos),
    "ranking de equipes soma o mesmo que o KPI");

  const { rows: he } = await c.query(`select * from painel_horas_extras($1,$2)`, [INI, FIM]);
  conferir(he.every((l) => Number(l.minutos_extras) <= Number(l.minutos_ativos_totais)),
    "horas extras não excedem o tempo ativo");
  conferir(he.every((l) => l.percentual_extra === null ||
    (Number(l.percentual_extra) >= 0 && Number(l.percentual_extra) <= 100)),
    "percentual de hora extra entre 0 e 100");

  await c.query("rollback");
}

await c.end();

console.log(falhas === 0
  ? "\nOs números conferem.\n"
  : `\n${falhas} divergência(s) — o painel está mostrando número errado.\n`);
process.exit(falhas === 0 ? 0 : 1);
