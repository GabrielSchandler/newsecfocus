// ============================================================================
//  Regras da Visão geral que não são consulta nem desenho.
//
//  Três leituras moram aqui: a janela do gráfico de evolução (com o período
//  anterior alinhado ponto a ponto), o comparativo de equipes contra o período
//  anterior e os "pontos de atenção" — o que o gestor deveria olhar primeiro.
//  Tudo função pura, para a página só buscar e entregar.
// ============================================================================

import { agregarProdutividade, agruparPorEquipe, compararIndice } from "./produtividade";
import { diaNoFuso, instanteNoFuso, periodoAnterior } from "./periodos";
import { REGRAS } from "./regras";
import { formatarDuracao } from "./formato";
import type {
  ContagemPessoas,
  Estacao,
  LinhaProdutividade,
  Periodo,
  PontoProdutividade,
  ResumoAplicativos,
} from "./tipos";

type Balde = "day" | "week" | "month";

export interface JanelaEvolucao {
  atual: { inicio: string; fim: string };
  anterior: { inicio: string; fim: string } | null;
  balde: Balde;
  /** Subtítulo do gráfico: "Dia a dia", "Últimos 14 dias"… */
  descricao: string;
}

const DIA_MS = 86_400_000;

const MESES_CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];
const DIAS_SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

function partes(dia: string) {
  const [ano, mes, d] = dia.split("-").map(Number);
  return { ano, mes, dia: d };
}

function paraUtc(dia: string): number {
  const p = partes(dia);
  return Date.UTC(p.ano, p.mes - 1, p.dia);
}

function deUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Início do balde que contém o dia (semana começa na segunda). */
function truncar(dia: string, balde: Balde): string {
  const p = partes(dia);
  if (balde === "month") return `${p.ano}-${String(p.mes).padStart(2, "0")}-01`;
  if (balde === "week") {
    const ms = paraUtc(dia);
    const diaSemana = (new Date(ms).getUTCDay() + 6) % 7;
    return deUtc(ms - diaSemana * DIA_MS);
  }
  return dia;
}

/** Quantos baldes separam `de` de `ate` (ambos já truncados). */
function distancia(de: string, ate: string, balde: Balde): number {
  if (balde === "month") {
    const a = partes(de);
    const b = partes(ate);
    return (b.ano - a.ano) * 12 + (b.mes - a.mes);
  }
  const dias = Math.round((paraUtc(ate) - paraUtc(de)) / DIA_MS);
  return balde === "week" ? Math.round(dias / 7) : dias;
}

function avancar(dia: string, n: number, balde: Balde): string {
  if (balde === "month") {
    const p = partes(dia);
    return deUtc(Date.UTC(p.ano, p.mes - 1 + n, 1));
  }
  return deUtc(paraUtc(dia) + n * (balde === "week" ? 7 : 1) * DIA_MS);
}

/**
 * Janela do gráfico de evolução para o período escolhido.
 *
 * Um dia sozinho não tem evolução, então o preset "dia" mostra os 14 dias até
 * ele. "Geral" pode começar em 2000 e viraria uma linha reta de nada; mostra os
 * últimos 12 meses. O resto usa o próprio período, com o anterior ao lado.
 */
export function janelaEvolucao(periodo: Periodo, fuso: string): JanelaEvolucao {
  const agora = Date.now();
  const cortar = (j: { inicio: string; fim: string }) => ({
    inicio: j.inicio,
    fim: new Date(Math.max(new Date(j.inicio).getTime(), Math.min(agora, new Date(j.fim).getTime()))).toISOString(),
  });

  if (periodo.preset === "dia") {
    const a = partes(periodo.ancora);
    const inicio = instanteNoFuso(fuso, a.ano, a.mes, a.dia - 13).toISOString();
    const inicioAnterior = instanteNoFuso(fuso, a.ano, a.mes, a.dia - 27).toISOString();
    return {
      atual: cortar({ inicio, fim: periodo.fim }),
      anterior: { inicio: inicioAnterior, fim: inicio },
      balde: "day",
      descricao: "Últimos 14 dias",
    };
  }

  if (periodo.preset === "geral") {
    const hoje = partes(diaNoFuso(new Date(), fuso));
    const inicio = instanteNoFuso(fuso, hoje.ano, hoje.mes - 11, 1).toISOString();
    return {
      atual: cortar({ inicio, fim: periodo.fim }),
      anterior: null,
      balde: "month",
      descricao: "Últimos 12 meses",
    };
  }

  const dias = (new Date(periodo.fim).getTime() - new Date(periodo.inicio).getTime()) / DIA_MS;
  const balde: Balde =
    periodo.preset === "ano" ? "month" : dias <= 62 ? "day" : dias <= 400 ? "week" : "month";
  const anterior = periodoAnterior(periodo, fuso);

  return {
    atual: cortar({ inicio: periodo.inicio, fim: periodo.fim }),
    anterior: { inicio: anterior.inicio, fim: anterior.fim },
    balde,
    descricao: balde === "day" ? "Dia a dia" : balde === "week" ? "Semana a semana" : "Mês a mês",
  };
}

export interface PontoEvolucao {
  chave: string;
  rotulo: string;
  rotuloCompleto: string;
  atual: number | null;
  anterior: number | null;
}

function rotulos(dia: string, balde: Balde): { curto: string; completo: string } {
  const p = partes(dia);
  const dd = String(p.dia).padStart(2, "0");
  const mm = String(p.mes).padStart(2, "0");
  if (balde === "month") {
    return {
      curto: `${MESES_CURTOS[p.mes - 1]}/${String(p.ano).slice(2)}`,
      completo: `${MESES[p.mes - 1]} de ${p.ano}`,
    };
  }
  if (balde === "week") return { curto: `${dd}/${mm}`, completo: `semana de ${dd}/${mm}/${p.ano}` };
  const diaSemana = DIAS_SEMANA[new Date(paraUtc(dia)).getUTCDay()];
  return {
    curto: `${dd} ${MESES_CURTOS[p.mes - 1]}.`,
    completo: `${diaSemana}, ${dd}/${mm}/${p.ano}`,
  };
}

/**
 * Junta o período atual e o anterior ponto a ponto: o 3º dia útil de agora fica
 * ao lado do 3º dia do período anterior, não da mesma data do calendário.
 *
 * O eixo termina onde o período atual termina hoje — o resto do mês passado não
 * entra, senão a linha cinza seguiria sozinha por duas semanas à direita.
 */
export function montarEvolucao(
  janela: JanelaEvolucao,
  atual: PontoProdutividade[],
  anterior: PontoProdutividade[],
  fuso: string,
): PontoEvolucao[] {
  const { balde } = janela;
  const inicioAtual = truncar(diaNoFuso(new Date(janela.atual.inicio), fuso), balde);
  const ultimoAtual = truncar(
    diaNoFuso(new Date(new Date(janela.atual.fim).getTime() - 1000), fuso),
    balde,
  );
  const limite = distancia(inicioAtual, ultimoAtual, balde);

  const pontos = new Map<number, PontoEvolucao>();
  const ponto = (n: number) => {
    let p = pontos.get(n);
    if (!p) {
      const dia = avancar(inicioAtual, n, balde);
      const r = rotulos(dia, balde);
      p = { chave: dia, rotulo: r.curto, rotuloCompleto: r.completo, atual: null, anterior: null };
      pontos.set(n, p);
    }
    return p;
  };

  // Dia com pouca cobertura sai da linha: com metade do expediente sem dado, o
  // índice cai sem ninguém ter trabalhado menos, e o desenho mentiria.
  const valido = (l: PontoProdutividade) =>
    (l.cobertura ?? 0) >= REGRAS.coberturaMinimaPontoEvolucao ? l.indice : null;

  for (const l of atual) {
    const n = distancia(inicioAtual, truncar(l.balde, balde), balde);
    if (n >= 0 && n <= limite) ponto(n).atual = valido(l);
  }

  if (janela.anterior) {
    const inicioAnterior = truncar(diaNoFuso(new Date(janela.anterior.inicio), fuso), balde);
    for (const l of anterior) {
      const n = distancia(inicioAnterior, truncar(l.balde, balde), balde);
      if (n >= 0 && n <= limite) ponto(n).anterior = valido(l);
    }
  }

  return [...pontos.entries()].sort((a, b) => a[0] - b[0]).map(([, p]) => p);
}

export interface LinhaComparativoEquipe {
  equipeId: string | null;
  equipe: string;
  pessoas: number;
  /** Média por pessoa. */
  indice: number | null;
  /** Razão dos totais da equipe. */
  cobertura: number | null;
  minutosForaEscala: number;
  minutosAtivos: number;
  /** NULL quando falta base comparável (sem expediente ou cobertura baixa). */
  variacao: number | null;
}

/** Equipes pela média por pessoa, com a variação validada contra o período anterior. */
export function compararEquipes(
  atual: LinhaProdutividade[],
  anterior: LinhaProdutividade[] | null,
): LinhaComparativoEquipe[] {
  const antes = new Map((anterior ? agruparPorEquipe(anterior) : []).map((g) => [g.equipeId, g.resumo]));

  return agruparPorEquipe(atual)
    .filter((g) => g.resumo.pessoas > 0)
    .map((g) => ({
      equipeId: g.equipeId,
      equipe: g.equipe,
      pessoas: g.resumo.pessoas,
      indice: g.resumo.indiceMedio,
      cobertura: g.resumo.cobertura,
      minutosForaEscala: g.resumo.minutos.ativosFora,
      minutosAtivos: g.resumo.minutos.ativos,
      variacao: anterior ? compararIndice(g.resumo, antes.get(g.equipeId) ?? null) : null,
    }));
}

/** Pessoas de um recorte com a variação individual validada (mesma regra das equipes). */
export function montarMembros(
  atual: LinhaProdutividade[],
  anterior: LinhaProdutividade[] | null,
): {
  colaboradorId: string;
  nome: string;
  equipe: string | null;
  indice: number | null;
  cobertura: number | null;
  minutosAtivos: number;
  minutosForaEscala: number;
  variacao: number | null;
  aproximado: boolean;
}[] {
  const antes = new Map((anterior ?? []).map((l) => [l.colaboradorId, l]));
  return atual.map((l) => {
    const previo = antes.get(l.colaboradorId);
    return {
      colaboradorId: l.colaboradorId,
      nome: l.colaborador,
      equipe: l.equipe,
      indice: l.indice,
      cobertura: l.cobertura,
      minutosAtivos: l.minutos.ativos,
      minutosForaEscala: l.minutos.ativosFora,
      variacao:
        anterior && previo
          ? compararIndice(agregarProdutividade([l]), agregarProdutividade([previo]))
          : null,
      aproximado: l.aproximado,
    };
  });
}

/**
 * Tempo ativo fora da escala, só de quem passou do ruído. Sai da mesma fonte
 * do índice (painel_produtividade), então "4 pessoas" é o mesmo número no
 * cartão do topo, no aviso e na tela de Jornada.
 */
export function foraDaEscala(linhas: LinhaProdutividade[]): { minutos: number; pessoas: number } {
  const relevantes = linhas.filter((l) => l.minutos.ativosFora >= REGRAS.minutosForaEscalaRelevante);
  return {
    minutos: relevantes.reduce((s, l) => s + l.minutos.ativosFora, 0),
    pessoas: relevantes.length,
  };
}

export interface PontoAtencao {
  /** "dados" = qualidade do dado; "observacao" = leitura da atividade. */
  natureza: "dados" | "observacao";
  titulo: string;
  detalhe?: string;
  acao: { rotulo: string; href: string };
}

const plural = (n: number, um: string, varios: string) => (n === 1 ? um : varios);

/**
 * O que olhar primeiro. Problema de DADO vem antes de observação de atividade:
 * estação sem enviar, aplicativo sem categoria e cadastro incompleto distorcem
 * todos os números abaixo, e uma queda de índice causada por falha técnica não
 * pode ser lida como queda de desempenho.
 */
export function pontosDeAtencao(opcoes: {
  estacoes?: Estacao[];
  aplicativos?: ResumoAplicativos | null;
  pessoas?: ContagemPessoas | null;
  produtividade: LinhaProdutividade[];
  equipes?: LinhaComparativoEquipe[];
  admin: boolean;
  recorte: string;
  limite?: number;
}): PontoAtencao[] {
  const { estacoes = [], aplicativos, pessoas, produtividade, equipes = [], admin, recorte } = opcoes;
  const pontos: PontoAtencao[] = [];

  const atrasadas = estacoes.filter((e) => e.situacao !== "RECENTE" && e.emExpedienteAgora);
  if (atrasadas.length > 0) {
    const pior = atrasadas[0];
    pontos.push({
      natureza: "dados",
      titulo: `${atrasadas.length} ${plural(atrasadas.length, "estação sem enviar dados", "estações sem enviar dados")} no expediente`,
      detalhe: `${pior.maquina}${pior.minutosSemEnvio !== null ? ` · último envio há ${formatarDuracao(pior.minutosSemEnvio)}` : ""}`,
      acao: { rotulo: "Ver dispositivos", href: "/painel/dispositivos?situacao=atrasadas" },
    });
  }

  if (aplicativos && aplicativos.semClassificacao > 0) {
    pontos.push({
      natureza: "dados",
      titulo: `${aplicativos.semClassificacao} ${plural(aplicativos.semClassificacao, "aplicativo sem classificação", "aplicativos sem classificação")}`,
      detalhe: `${formatarDuracao(aplicativos.minutosPorTipo.SEM)} fora do índice no período`,
      acao: {
        rotulo: admin ? "Revisar categorias" : "Ver aplicativos",
        href: `/painel/aplicativos${juntar(recorte, "filtro=sem")}`,
      },
    });
  }

  if (pessoas && pessoas.pendentes > 0) {
    pontos.push({
      natureza: "dados",
      titulo: `${pessoas.pendentes} ${plural(pessoas.pendentes, "pessoa com cadastro pendente", "pessoas com cadastro pendente")}`,
      detalhe:
        pessoas.semEquipe > 0
          ? `${pessoas.semEquipe} sem equipe — ficam fora do comparativo de equipes`
          : "Cadastro ainda não revisado por um administrador",
      acao: admin
        ? { rotulo: "Revisar cadastro", href: "/painel/administracao?aba=pessoas" }
        : { rotulo: "Ver pessoas", href: "/painel/pessoas?situacao=pendente" },
    });
  }

  const fora = foraDaEscala(produtividade);
  if (fora.pessoas > 0) {
    // Em recorte pequeno (uma equipe) vale dizer quem; na empresa, só quantos.
    const nomes =
      fora.pessoas <= 3
        ? produtividade
            .filter((l) => l.minutos.ativosFora >= REGRAS.minutosForaEscalaRelevante)
            .sort((a, b) => b.minutos.ativosFora - a.minutos.ativosFora)
            .map((l) => `${l.colaborador} · ${formatarDuracao(l.minutos.ativosFora)}`)
            .join(" · ")
        : null;
    pontos.push({
      natureza: "observacao",
      titulo: `${fora.pessoas} ${plural(fora.pessoas, "pessoa com atividade fora da escala", "pessoas com atividade fora da escala")}`,
      detalhe: nomes ?? `${formatarDuracao(fora.minutos)} somadas · estimativa, não é marcação de ponto`,
      acao: { rotulo: "Ver jornada", href: `/painel/jornada${recorte}` },
    });
  }

  const maiorMudanca = equipes
    .filter((e) => e.equipeId && e.variacao !== null && Math.abs(e.variacao) >= REGRAS.variacaoRelevantePp)
    .sort((a, b) => Math.abs(b.variacao!) - Math.abs(a.variacao!))[0];
  if (maiorMudanca) {
    const v = maiorMudanca.variacao!;
    pontos.push({
      natureza: "observacao",
      titulo: `${maiorMudanca.equipe}: ${v > 0 ? "+" : "−"}${Math.abs(v).toFixed(0)} p.p. no índice`,
      detalhe: "Comparado ao período anterior, com cobertura suficiente nos dois",
      acao: { rotulo: "Explorar equipe", href: `/painel/equipes/${maiorMudanca.equipeId}${recorte}` },
    });
  }

  return opcoes.limite ? pontos.slice(0, opcoes.limite) : pontos;
}

/** Acrescenta um parâmetro a uma query string que pode estar vazia. */
export function juntar(recorte: string, extra: string): string {
  return recorte ? `${recorte}&${extra}` : `?${extra}`;
}

/** "01 – 16 set. 2026": o intervalo que os números cobrem, cortado em hoje. */
export function rotuloIntervaloCurto(periodo: Periodo, fuso: string): string {
  if (periodo.preset === "geral") return periodo.rotulo;

  const fim = Math.min(Date.now(), new Date(periodo.fim).getTime() - 1000);
  const a = partes(diaNoFuso(new Date(periodo.inicio), fuso));
  const b = partes(diaNoFuso(new Date(Math.max(fim, new Date(periodo.inicio).getTime())), fuso));
  const dd = (n: number) => String(n).padStart(2, "0");

  if (a.ano === b.ano && a.mes === b.mes && a.dia === b.dia) {
    return `${dd(a.dia)} ${MESES_CURTOS[a.mes - 1]}. ${a.ano}`;
  }
  if (a.ano === b.ano && a.mes === b.mes) {
    return `${dd(a.dia)} – ${dd(b.dia)} ${MESES_CURTOS[a.mes - 1]}. ${a.ano}`;
  }
  if (a.ano === b.ano) {
    return `${dd(a.dia)} ${MESES_CURTOS[a.mes - 1]}. – ${dd(b.dia)} ${MESES_CURTOS[b.mes - 1]}. ${a.ano}`;
  }
  return `${dd(a.dia)}/${dd(a.mes)}/${a.ano} – ${dd(b.dia)}/${dd(b.mes)}/${b.ano}`;
}
