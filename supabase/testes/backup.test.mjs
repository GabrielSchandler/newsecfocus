// O backup de funções (salvar-funcoes.mjs) tem de ser um caminho de volta de
// verdade: tirado antes da 0035, aplicado depois da 0037, deixa cada função
// que existia com a mesma definição e as mesmas permissões.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { criarBanco } from "./banco-local.mjs";
import { CONSULTA_FUNCOES, montarBackup } from "../salvar-funcoes.mjs";

const PASTA_MIGRATIONS = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");

const FOTO = `
  select format('public.%I(%s)', p.proname, oidvectortypes(p.proargtypes)) as assinatura,
         pg_get_functiondef(p.oid) as definicao,
         (select string_agg(x, ',' order by x) from (
             select distinct coalesce(r.rolname, 'public') || ':' || a.privilege_type as x
               from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
               left join pg_roles r on r.oid = a.grantee) s) as permissoes
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind = 'f'`;

async function fotografar(db) {
  const { rows } = await db.query(FOTO);
  return new Map(rows.map((r) => [r.assinatura, r]));
}

test("backup de funções devolve o banco ao estado anterior às migrations 0035–0037", async () => {
  const db = await criarBanco({ ate: "0034_z" });

  const antes = await fotografar(db);
  const backup = montarBackup((await db.query(CONSULTA_FUNCOES)).rows);

  const novas = readdirSync(PASTA_MIGRATIONS).filter((f) => f > "0034_z" && f.endsWith(".sql")).sort();
  assert.deepEqual(novas.slice(0, 3), [
    "0035_serie_produtividade.sql",
    "0036_metricas_coerentes.sql",
    "0037_consultas_das_telas.sql",
  ]);
  for (const arquivo of novas) {
    const sql = readFileSync(join(PASTA_MIGRATIONS, arquivo), "utf8").replace(/create extension if not exists pg_cron[^;]*;/gi, "");
    await db.exec(sql);
  }

  // As migrations mudaram de fato alguma coisa (senão o teste não prova nada).
  const meio = await fotografar(db);
  const mudadas = [...antes.keys()].filter((k) => meio.get(k)?.definicao !== antes.get(k).definicao || meio.get(k)?.permissoes !== antes.get(k).permissoes);
  assert.ok(mudadas.length >= 5, `esperava várias funções alteradas, vieram ${mudadas.length}`);
  assert.ok(mudadas.some((k) => k.startsWith("public.painel_produtividade(")), "painel_produtividade deveria ter mudado");

  await db.exec(backup);

  const depois = await fotografar(db);
  const diferentes = [];
  for (const [assinatura, original] of antes) {
    const atual = depois.get(assinatura);
    if (!atual) diferentes.push(`${assinatura}: sumiu`);
    else if (atual.definicao !== original.definicao) diferentes.push(`${assinatura}: definição`);
    else if (atual.permissoes !== original.permissoes) diferentes.push(`${assinatura}: permissões ${atual.permissoes} ≠ ${original.permissoes}`);
  }
  assert.deepEqual(diferentes, []);
  await db.close();
});
