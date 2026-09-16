// ============================================================================
//  Consultas das telas (0037) contra casos montados à mão.
// ============================================================================

import { test, before } from "node:test";
import assert from "node:assert/strict";
import {
  classificar, comoUsuario, consolidar, criarBanco, criarEmpresa, criarEquipe,
  criarEstacao, criarPessoa, criarUsuario, definirAgora, definirEscala, gravarMinutos, sp,
} from "./banco-local.mjs";

function quartaRecente() {
  const d = new Date(Date.now() - 7 * 86_400_000);
  while (d.getUTCDay() !== 3) d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
const QUARTA = quartaRecente();
const QUINTA = new Date(new Date(`${QUARTA}T12:00:00Z`).getTime() + 86_400_000).toISOString().slice(0, 10);

let db, c;
before(async () => {
  db = await criarBanco();
  const orgId = await criarEmpresa(db);
  const comercial = await criarEquipe(db, orgId, "Comercial");
  const ana = await criarPessoa(db, orgId, { nome: "Ana Souza", equipeId: comercial });
  const bruno = await criarPessoa(db, orgId, { nome: "Bruno Lima", equipeId: comercial });
  const marina = await criarPessoa(db, orgId, { nome: "Marina Costa", completo: false });
  const pc = await criarEstacao(db, orgId, "COM-01");
  const pc2 = await criarEstacao(db, orgId, "COM-02");
  const dono = await criarUsuario(db, orgId);
  await classificar(db, orgId, { processo: "excel.exe", tipo: "PRODUCTIVE" });
  for (const p of [ana, bruno]) await definirEscala(db, orgId, p, 3, { inicio: "08:00", fim: "12:00" });
  await gravarMinutos(db, { orgId, pessoaId: ana, estacaoId: pc, inicio: sp(QUARTA, "08:07"), quantidade: 60 });
  await gravarMinutos(db, { orgId, pessoaId: ana, estacaoId: pc, inicio: sp(QUARTA, "09:07"), quantidade: 20, processo: "notepad.exe" });
  await gravarMinutos(db, { orgId, pessoaId: ana, estacaoId: pc, inicio: sp(QUARTA, "09:27"), quantidade: 10, processo: "chrome.exe", dominio: "portal.exemplo.com" });
  await gravarMinutos(db, { orgId, pessoaId: bruno, estacaoId: pc2, inicio: sp(QUARTA, "08:00"), quantidade: 30 });
  await consolidar(db);
  await definirAgora(db, sp(QUINTA, "09:00"));
  c = { orgId, comercial, ana, bruno, marina, dono };
});

const como = (sql, params) => comoUsuario(db, c.dono, async () => (await db.query(sql, params)).rows);

test("lista de pessoas: busca, situação, ordem e total no banco", async () => {
  const todas = await como(`select * from painel_pessoas_lista($1, $2, p_ordem => 'indice', p_decrescente => true)`, [sp(QUARTA, "00:00"), sp(QUINTA, "00:00")]);
  assert.equal(todas.length, 3);
  assert.equal(Number(todas[0].total), 3);
  assert.equal(todas[0].nome, "Ana Souza", "maior índice primeiro");
  assert.ok(todas[0].ultimo_registro, "último registro vem do dado cru");

  const pendentes = await como(`select * from painel_pessoas_lista($1, $2, p_situacao => 'pendente')`, [sp(QUARTA, "00:00"), sp(QUINTA, "00:00")]);
  assert.deepEqual(pendentes.map((p) => p.nome), ["Marina Costa"]);

  const busca = await como(`select * from painel_pessoas_lista($1, $2, p_busca => 'brun', p_limite => 1)`, [sp(QUARTA, "00:00"), sp(QUINTA, "00:00")]);
  assert.equal(busca.length, 1);
  assert.equal(busca[0].nome, "Bruno Lima");

  const [cont] = await como(`select * from painel_pessoas_contagem($1, $2)`, [sp(QUARTA, "00:00"), sp(QUINTA, "00:00")]);
  assert.equal(Number(cont.cadastradas), 3);
  assert.equal(Number(cont.com_registro), 2);
  assert.equal(Number(cont.pendentes), 1);
});

test("aplicativos: sem classificação separado e filtro de sites", async () => {
  const [resumo] = await como(`select * from painel_aplicativos_resumo($1, $2)`, [sp(QUARTA, "00:00"), sp(QUINTA, "00:00")]);
  assert.equal(Number(resumo.identificados), 3);
  assert.equal(Number(resumo.sem_classificacao), 2);
  assert.equal(Number(resumo.minutos_total), 120);

  const sites = await como(`select * from painel_aplicativos_lista($1, $2, p_filtro => 'sites')`, [sp(QUARTA, "00:00"), sp(QUINTA, "00:00")]);
  assert.deepEqual(sites.map((s) => s.alvo), ["portal.exemplo.com"]);

  const sem = await como(`select * from painel_aplicativos_lista($1, $2, p_filtro => 'sem')`, [sp(QUARTA, "00:00"), sp(QUINTA, "00:00")]);
  assert.equal(sem.length, 2);
  assert.ok(sem.every((s) => s.tipo === null));
});

test("jornada: primeiro registro com o minuto exato e escala descrita", async () => {
  const linhas = await como(`select * from painel_jornada_pessoas($1, $2)`, [sp(QUARTA, "00:00"), sp(QUINTA, "00:00")]);
  const ana = linhas.find((l) => l.colaborador === "Ana Souza");
  assert.equal(Number(ana.primeiro_registro_medio), 8 * 60 + 7, "08:07, não 08:00");
  assert.equal(ana.escala, "08:00–12:00");
  assert.equal(ana.horarios_por_bloco, false);

  const dia = await como(`select * from painel_jornada_dia($1)`, [QUARTA]);
  const anaDia = dia.find((l) => l.colaborador === "Ana Souza");
  assert.ok(anaDia.blocos.length > 0);
  assert.equal(Number(anaDia.minutos_registrados), 90);
});

test("sessões agrupam minutos seguidos do mesmo aplicativo", async () => {
  const sessoes = await como(`select * from painel_sessoes($1, $2, $3)`, [c.ana, sp(QUARTA, "00:00"), sp(QUINTA, "00:00")]);
  assert.deepEqual(sessoes.map((s) => [s.alvo, s.minutos]), [
    ["excel.exe", 60], ["notepad.exe", 20], ["portal.exemplo.com", 10],
  ]);
});
