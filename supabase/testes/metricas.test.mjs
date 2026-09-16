// ============================================================================
//  Métricas do painel contra casos feitos à mão.
//
//  Cada teste monta minutos de atividade de verdade (activity_logs), roda a
//  consolidação e confere o que as funções do painel devolvem. Os números
//  esperados são contados na mão — se um teste falhar, a conta do banco é que
//  mudou, não o teste.
//
//  Rodar:  cd supabase && npm install && npm test
// ============================================================================

import { test, before } from "node:test";
import assert from "node:assert/strict";
import {
  classificar,
  comoUsuario,
  consolidar,
  criarBanco,
  criarEmpresa,
  criarEquipe,
  criarEstacao,
  criarPessoa,
  criarUsuario,
  definirAgora,
  definirEscala,
  gravarMinutos,
  sp,
} from "./banco-local.mjs";

// Datas relativas a hoje: a consolidação respeita a retenção de 90 dias pelo
// relógio real, então caso de teste com data fixa envelheceria e quebraria.
function diaDaSemanaRecente(isodow, recuoMinimo = 7) {
  const d = new Date(Date.now() - recuoMinimo * 86_400_000);
  while (((d.getUTCDay() + 6) % 7) + 1 !== isodow) d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
const QUARTA = diaDaSemanaRecente(3);
const SABADO = diaDaSemanaRecente(6);
const QUINTA = new Date(new Date(`${QUARTA}T12:00:00Z`).getTime() + 86_400_000).toISOString().slice(0, 10);

let db;
before(async () => {
  db = await criarBanco();
});

/** Empresa isolada por teste: um caso nunca enxerga o dado do outro. */
async function cenario() {
  const orgId = await criarEmpresa(db);
  const equipeId = await criarEquipe(db, orgId, "Comercial");
  const pessoaId = await criarPessoa(db, orgId, { nome: `Pessoa ${Math.random()}`, equipeId });
  const estacaoId = await criarEstacao(db, orgId, `PC-${Math.random()}`);
  const donoId = await criarUsuario(db, orgId, { papel: "OWNER" });
  await classificar(db, orgId, { processo: "excel.exe", tipo: "PRODUCTIVE" });
  await classificar(db, orgId, { processo: "spotify.exe", tipo: "UNPRODUCTIVE" });
  return { orgId, equipeId, pessoaId, estacaoId, donoId };
}

async function produtividade(c, inicio, fim, extra = {}) {
  return comoUsuario(db, c.donoId, async () => {
    const { rows } = await db.query(
      `select * from painel_produtividade($1, $2, null, $3, $4)`,
      [inicio, fim, extra.equipeId ?? null, extra.pessoaId ?? null],
    );
    return rows;
  });
}

const n = (v) => (v === null ? null : Number(v));

test("30 minutos produtivos em 30 minutos de expediente = 100%", async () => {
  const c = await cenario();
  await definirEscala(db, c.orgId, c.pessoaId, 3, { inicio: "10:00", fim: "18:00" });
  await gravarMinutos(db, { ...c, inicio: sp(QUARTA, "10:00"), quantidade: 30 });
  await consolidar(db);
  await definirAgora(db, sp(QUARTA, "10:30"));

  const [linha] = await produtividade(c, sp(QUARTA, "00:00"), sp(QUINTA, "00:00"));
  assert.equal(n(linha.minutos_expediente), 30);
  assert.equal(n(linha.minutos_produtivos), 30);
  assert.equal(n(linha.indice), 100);
  assert.equal(linha.aproximado, false);
});

test("o mesmo caso dava 50% antes da 0036 (bug reproduzido)", async () => {
  const antigo = await criarBanco({ ate: "0035_serie_produtividade.sql" });
  const orgId = await criarEmpresa(antigo);
  const pessoaId = await criarPessoa(antigo, orgId, { nome: "Antes" });
  const estacaoId = await criarEstacao(antigo, orgId, "PC-ANTES");
  const donoId = await criarUsuario(antigo, orgId);
  await classificar(antigo, orgId, { processo: "excel.exe", tipo: "PRODUCTIVE" });
  await definirEscala(antigo, orgId, pessoaId, 3, { inicio: "10:00", fim: "18:00" });
  await gravarMinutos(antigo, { orgId, pessoaId, estacaoId, inicio: sp(QUARTA, "10:00"), quantidade: 30 });
  await consolidar(antigo);
  await definirAgora(antigo, sp(QUARTA, "10:30"));

  const linha = await comoUsuario(antigo, donoId, async () => {
    const { rows } = await antigo.query(`select * from painel_produtividade($1, $2)`, [
      sp(QUARTA, "00:00"), sp(QUINTA, "00:00"),
    ]);
    return rows[0];
  });
  assert.equal(Number(linha.indice), 50);
});

test("jornada quebrada 08:30–17:45 com intervalo 12:15–13:15 é exata", async () => {
  const c = await cenario();
  await definirEscala(db, c.orgId, c.pessoaId, 3, {
    inicio: "08:30", fim: "17:45", intervalo: ["12:15", "13:15"],
  });
  // Das 08:00 às 18:00 sem parar: 600 minutos produtivos.
  await gravarMinutos(db, { ...c, inicio: sp(QUARTA, "08:00"), quantidade: 600 });
  await consolidar(db);
  await definirAgora(db, sp(QUINTA, "09:00"));

  const [linha] = await produtividade(c, sp(QUARTA, "00:00"), sp(QUINTA, "00:00"));
  // 08:30–12:15 = 225 min; 13:15–17:45 = 270 min.
  assert.equal(n(linha.minutos_expediente), 495);
  assert.equal(n(linha.minutos_produtivos), 495);
  assert.equal(n(linha.minutos_ativos_fora), 105);
  assert.equal(n(linha.indice), 100);
  assert.equal(linha.aproximado, false, "fronteiras em quarto de hora não são estimativa");
});

test("escala fora do quarto de hora (08:20) sai marcada como aproximada", async () => {
  const c = await cenario();
  await definirEscala(db, c.orgId, c.pessoaId, 3, { inicio: "08:20", fim: "12:00" });
  await gravarMinutos(db, { ...c, inicio: sp(QUARTA, "08:00"), quantidade: 240 });
  await consolidar(db);
  await definirAgora(db, sp(QUINTA, "09:00"));

  const [linha] = await produtividade(c, sp(QUARTA, "00:00"), sp(QUINTA, "00:00"));
  assert.equal(n(linha.minutos_expediente), 220);
  assert.equal(linha.aproximado, true);
});

test("dia sem expediente: índice indisponível e todo o tempo ativo fora da escala", async () => {
  const c = await cenario();
  await definirEscala(db, c.orgId, c.pessoaId, 6, { trabalha: false });
  await gravarMinutos(db, { ...c, inicio: sp(SABADO, "10:00"), quantidade: 60 });
  await consolidar(db);
  const domingo = new Date(new Date(`${SABADO}T12:00:00Z`).getTime() + 86_400_000).toISOString().slice(0, 10);
  await definirAgora(db, sp(domingo, "12:00"));

  const [linha] = await produtividade(c, sp(SABADO, "00:00"), sp(domingo, "00:00"));
  assert.equal(n(linha.minutos_expediente), 0);
  assert.equal(linha.indice, null, "denominador zero não vira 0% nem 100%");
  assert.equal(n(linha.minutos_ativos_fora), 60);

  const extras = await comoUsuario(db, c.donoId, async () =>
    (await db.query(`select * from painel_horas_extras($1, $2)`, [sp(SABADO, "00:00"), sp(domingo, "00:00")])).rows,
  );
  assert.equal(Number(extras[0].minutos_extras), 60);
});

test("ausência de registros vira sem dados, não improdutivo", async () => {
  const c = await cenario();
  await definirEscala(db, c.orgId, c.pessoaId, 3, { inicio: "08:00", fim: "17:00", intervalo: ["12:00", "13:00"] });
  await gravarMinutos(db, { ...c, inicio: sp(QUARTA, "08:00"), quantidade: 120 });
  await consolidar(db);
  await definirAgora(db, sp(QUINTA, "09:00"));

  const [linha] = await produtividade(c, sp(QUARTA, "00:00"), sp(QUINTA, "00:00"));
  assert.equal(n(linha.minutos_expediente), 480);
  assert.equal(n(linha.minutos_registrados), 120);
  assert.equal(n(linha.minutos_sem_dados), 360);
  assert.equal(n(linha.minutos_improdutivos), 0);
  assert.equal(n(linha.aderencia), 25);
  assert.equal(n(linha.indice), 25);
});

test("componentes do expediente se reconciliam", async () => {
  const c = await cenario();
  await definirEscala(db, c.orgId, c.pessoaId, 3, { inicio: "08:00", fim: "12:00" });
  await gravarMinutos(db, { ...c, inicio: sp(QUARTA, "08:00"), quantidade: 60 });
  await gravarMinutos(db, { ...c, inicio: sp(QUARTA, "09:00"), quantidade: 30, processo: "spotify.exe" });
  await gravarMinutos(db, { ...c, inicio: sp(QUARTA, "09:30"), quantidade: 30, processo: "desconhecido.exe" });
  await gravarMinutos(db, { ...c, inicio: sp(QUARTA, "10:00"), quantidade: 20, ocioso: true });
  await gravarMinutos(db, { ...c, inicio: sp(QUARTA, "10:20"), quantidade: 10, bloqueado: true });
  await consolidar(db);
  await definirAgora(db, sp(QUINTA, "09:00"));

  const [l] = (await produtividade(c, sp(QUARTA, "00:00"), sp(QUINTA, "00:00"))).map((r) =>
    Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === "string" && /^[\d.]+$/.test(v) ? Number(v) : v])),
  );
  assert.equal(l.minutos_produtivos, 60);
  assert.equal(l.minutos_improdutivos, 30);
  assert.equal(l.minutos_sem_classificar, 30);
  assert.equal(l.minutos_ativos, l.minutos_produtivos + l.minutos_neutros + l.minutos_improdutivos + l.minutos_sem_classificar);
  assert.equal(l.minutos_registrados, l.minutos_ativos + l.minutos_ociosos + l.minutos_bloqueado);
  assert.equal(l.minutos_expediente, l.minutos_registrados + l.minutos_sem_dados);
  assert.equal(l.minutos_sem_dados, 90);
});

test("duas estações da mesma pessoa no mesmo minuto não contam em dobro", async () => {
  const c = await cenario();
  const notebook = await criarEstacao(db, c.orgId, `NB-${Math.random()}`);
  await definirEscala(db, c.orgId, c.pessoaId, 3, { inicio: "09:00", fim: "11:00" });
  await gravarMinutos(db, { ...c, inicio: sp(QUARTA, "09:00"), quantidade: 60 });
  await gravarMinutos(db, { ...c, estacaoId: notebook, inicio: sp(QUARTA, "09:00"), quantidade: 60, ocioso: true });
  await gravarMinutos(db, { ...c, estacaoId: notebook, inicio: sp(QUARTA, "10:00"), quantidade: 30 });
  await consolidar(db);
  await definirAgora(db, sp(QUINTA, "09:00"));

  const [linha] = await produtividade(c, sp(QUARTA, "00:00"), sp(QUINTA, "00:00"));
  assert.equal(n(linha.minutos_registrados), 90, "150 minutos de registro, 90 minutos de pessoa");
  assert.equal(n(linha.minutos_produtivos), 90, "o ocioso do notebook não apaga o trabalho no desktop");
  assert.equal(n(linha.minutos_ociosos), 0);
  assert.equal(n(linha.minutos_sobrepostos), 60);
  assert.ok(n(linha.aderencia) <= 100);
});

test("consolidação incremental não apaga o uso de aplicativos da manhã", async () => {
  const c = await cenario();
  const manha = new Date(Date.now() - 6 * 3_600_000).toISOString();
  const tarde = new Date(Date.now() - 60_000).toISOString();
  await gravarMinutos(db, { ...c, inicio: sp(QUARTA, "08:00"), quantidade: 120, recebidoEm: manha });
  await consolidar(db);
  await gravarMinutos(db, { ...c, inicio: sp(QUARTA, "14:00"), quantidade: 30, recebidoEm: tarde });
  await consolidar(db, new Date(Date.now() - 3_600_000).toISOString());

  const { rows } = await db.query(
    `select sum(minutos)::int as minutos from resumo_app_diario where employee_id = $1 and alvo = 'excel.exe'`,
    [c.pessoaId],
  );
  assert.equal(rows[0].minutos, 150);
});

test("aplicativo sem classificação aparece separado das categorias", async () => {
  const c = await cenario();
  await gravarMinutos(db, { ...c, inicio: sp(QUARTA, "08:00"), quantidade: 45, processo: "novo-app.exe" });
  await consolidar(db);

  const linhas = await comoUsuario(db, c.donoId, async () =>
    (await db.query(`select * from painel_distribuicao($1, $2)`, [sp(QUARTA, "00:00"), sp(QUINTA, "00:00")])).rows,
  );
  const app = linhas.find((l) => l.alvo === "novo-app.exe");
  assert.ok(app, "o aplicativo aparece na distribuição");
  assert.equal(app.tipo, null);
  assert.equal(Number(app.minutos), 45);
});

test("domínio classificado vence a regra do processo do navegador", async () => {
  const c = await cenario();
  await classificar(db, c.orgId, { processo: "chrome.exe", tipo: "NEUTRAL" });
  await classificar(db, c.orgId, { dominio: "crm.exemplo.com", tipo: "PRODUCTIVE" });
  await definirEscala(db, c.orgId, c.pessoaId, 3, { inicio: "08:00", fim: "09:00" });
  await gravarMinutos(db, { ...c, inicio: sp(QUARTA, "08:00"), quantidade: 60, processo: "chrome.exe", dominio: "crm.exemplo.com" });
  await consolidar(db);
  await definirAgora(db, sp(QUINTA, "09:00"));

  const [linha] = await produtividade(c, sp(QUARTA, "00:00"), sp(QUINTA, "00:00"));
  assert.equal(n(linha.minutos_produtivos), 60);
  assert.equal(n(linha.minutos_neutros), 0);
});

test("série do índice usa a mesma régua do número do topo", async () => {
  const c = await cenario();
  await definirEscala(db, c.orgId, c.pessoaId, 3, { inicio: "08:00", fim: "10:00" });
  await gravarMinutos(db, { ...c, inicio: sp(QUARTA, "08:00"), quantidade: 90 });
  await consolidar(db);
  await definirAgora(db, sp(QUINTA, "09:00"));

  const serie = await comoUsuario(db, c.donoId, async () =>
    (await db.query(`select * from painel_produtividade_serie($1, $2, 'day')`, [sp(QUARTA, "00:00"), sp(QUINTA, "00:00")])).rows,
  );
  const [linha] = await produtividade(c, sp(QUARTA, "00:00"), sp(QUINTA, "00:00"));
  assert.equal(serie.length, 1);
  assert.equal(Number(serie[0].indice_medio), Number(linha.indice));
  assert.equal(Number(linha.indice), 75);
});

test("comparação no meio do dia corta o dia anterior no mesmo horário", async () => {
  const c = await cenario();
  await definirEscala(db, c.orgId, c.pessoaId, 3, { inicio: "08:00", fim: "18:00" });
  await gravarMinutos(db, { ...c, inicio: sp(QUARTA, "08:00"), quantidade: 600 });
  await consolidar(db);
  await definirAgora(db, sp(QUINTA, "12:00"));

  // Janela de comparação: quarta das 00:00 até 10:00 (mesmo tempo decorrido).
  const [linha] = await produtividade(c, sp(QUARTA, "00:00"), sp(QUARTA, "10:00"));
  assert.equal(n(linha.minutos_expediente), 120);
  assert.equal(n(linha.minutos_produtivos), 120);
});

test("estação atrasada pelo limiar da empresa e só dentro do expediente", async () => {
  const orgId = await criarEmpresa(db, { intervalo: 5 });
  const pessoaId = await criarPessoa(db, orgId, { nome: `Atraso ${Math.random()}` });
  const donoId = await criarUsuario(db, orgId);
  await definirEscala(db, orgId, pessoaId, 3, { inicio: "08:00", fim: "18:00" });
  const agora = sp(QUARTA, "10:00");
  const estacaoId = await criarEstacao(db, orgId, "PC-ATRASO", { ultimoEnvio: new Date(agora.getTime() - 20 * 60_000) });
  await gravarMinutos(db, { orgId, pessoaId, estacaoId, inicio: sp(QUARTA, "09:00"), quantidade: 40 });
  await consolidar(db);

  await definirAgora(db, agora);
  const estacoes = await comoUsuario(db, donoId, async () => (await db.query(`select * from painel_estacoes()`)).rows);
  assert.equal(estacoes[0].limiar_minutos, 13, "2,5 × 5 min, arredondado para cima");
  assert.equal(estacoes[0].situacao, "ATRASADA");
  assert.equal(estacoes[0].em_expediente_agora, true);
  const [pend] = await comoUsuario(db, donoId, async () => (await db.query(`select * from contar_pendencias()`)).rows);
  assert.equal(Number(pend.estacoes_paradas), 1);

  // De noite a mesma estação continua sem enviar, mas não é aviso.
  await definirAgora(db, sp(QUARTA, "22:00"));
  const [noite] = await comoUsuario(db, donoId, async () => (await db.query(`select * from contar_pendencias()`)).rows);
  assert.equal(Number(noite.estacoes_paradas), 0);
});

test("empresa não enxerga dado de outra e líder só vê a própria equipe", async () => {
  const a = await cenario();
  await definirEscala(db, a.orgId, a.pessoaId, 3, { inicio: "08:00", fim: "09:00" });
  await gravarMinutos(db, { ...a, inicio: sp(QUARTA, "08:00"), quantidade: 60 });
  const outraEquipe = await criarEquipe(db, a.orgId, "Jurídico");
  const outraPessoa = await criarPessoa(db, a.orgId, { nome: `Jurídico ${Math.random()}`, equipeId: outraEquipe });
  const outraEstacao = await criarEstacao(db, a.orgId, `JUR-${Math.random()}`);
  await gravarMinutos(db, { ...a, pessoaId: outraPessoa, estacaoId: outraEstacao, inicio: sp(QUARTA, "08:00"), quantidade: 60 });
  await consolidar(db);
  await definirAgora(db, sp(QUINTA, "09:00"));

  const b = await cenario();
  const deOutraEmpresa = await comoUsuario(db, b.donoId, async () =>
    (await db.query(`select * from painel_produtividade($1, $2, $3)`, [sp(QUARTA, "00:00"), sp(QUINTA, "00:00"), a.orgId])).rows,
  );
  assert.equal(deOutraEmpresa.length, 0, "p_org de outra empresa volta vazio");

  const blocosAlheios = await comoUsuario(db, b.donoId, async () =>
    (await db.query(`select count(*)::int as n from resumo_pessoa_15min where org_id = $1`, [a.orgId])).rows[0].n,
  );
  assert.equal(blocosAlheios, 0, "RLS do resumo por pessoa");

  const lider = await criarUsuario(db, a.orgId, { papel: "TEAM_LEAD", equipeId: a.equipeId });
  const visto = await comoUsuario(db, lider, async () =>
    (await db.query(`select colaborador_id from painel_produtividade($1, $2)`, [sp(QUARTA, "00:00"), sp(QUINTA, "00:00")])).rows,
  );
  assert.deepEqual(visto.map((r) => r.colaborador_id), [a.pessoaId]);

  const leitor = await criarUsuario(db, a.orgId, { papel: "VIEWER" });
  await assert.rejects(
    comoUsuario(db, leitor, () => db.query(`select reconsolidar_org($1)`, [a.orgId])),
    /Sem permissão/,
  );
});
