// ============================================================================
//  Produtividade contra o expediente — agregação e comparativo alinhado.
//
//  Duas regras de negócio moram aqui, e só aqui:
//
//  1. A média da empresa e da equipe é a MÉDIA SIMPLES do % de cada pessoa.
//     Somar minutos faria uma equipe de 10 parecer sempre melhor que uma de 3,
//     e o gestor não consegue comparar setores desse jeito.
//
//  2. O comparativo é alinhado no relógio. Às 10h, "vs ontem" compara com ontem
//     ATÉ AS 10H — não com o dia inteiro de ontem, que sempre pareceria melhor.
//     E "ontem" é o último dia com expediente: segunda compara com sexta.
// ============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import { buscarDiaExpedienteAnterior } from "./consultas";
import { criarPeriodo, periodoAnterior } from "./periodos";
import type { LinhaProdutividade, Periodo, ResumoProdutividade } from "./tipos";

export const COMPOSICAO_VAZIA = {
  produtivo: 0,
  neutro: 0,
  improdutivo: 0,
  semClassificar: 0,
  ocioso: 0,
  bloqueado: 0,
  desligado: 0,
};

export const RESUMO_VAZIO: ResumoProdutividade = {
  pessoas: 0,
  indiceMedio: null,
  aderenciaMedia: null,
  composicao: COMPOSICAO_VAZIA,
  totais: { expediente: 0, registrados: 0, produtivos: 0, ociosos: 0, bloqueado: 0, desligado: 0 },
};

/** Média simples dos percentuais — cada pessoa pesa igual. */
export function agregarProdutividade(linhas: LinhaProdutividade[]): ResumoProdutividade {
  const base = linhas.filter((l) => l.minutosExpediente > 0);
  const n = base.length;

  const soma = (f: (l: LinhaProdutividade) => number) => linhas.reduce((s, l) => s + f(l), 0);
  const mediaPct = (f: (l: LinhaProdutividade) => number) =>
    n === 0 ? 0 : base.reduce((s, l) => s + (f(l) / l.minutosExpediente) * 100, 0) / n;

  const mediaCampo = (f: (l: LinhaProdutividade) => number | null) => {
    const vals = base.map(f).filter((v): v is number => v !== null);
    return vals.length === 0 ? null : vals.reduce((s, v) => s + v, 0) / vals.length;
  };

  return {
    pessoas: n,
    indiceMedio: mediaCampo((l) => l.indice),
    aderenciaMedia: mediaCampo((l) => l.aderencia),
    composicao: {
      produtivo: mediaPct((l) => l.minutosProdutivos),
      neutro: mediaPct((l) => l.minutosNeutros),
      improdutivo: mediaPct((l) => l.minutosImprodutivos),
      semClassificar: mediaPct((l) => l.minutosSemClassificar),
      ocioso: mediaPct((l) => l.minutosOciosos),
      bloqueado: mediaPct((l) => l.minutosBloqueado),
      desligado: mediaPct((l) => l.minutosDesligado),
    },
    totais: {
      expediente: soma((l) => l.minutosExpediente),
      registrados: soma((l) => l.minutosRegistrados),
      produtivos: soma((l) => l.minutosProdutivos),
      ociosos: soma((l) => l.minutosOciosos),
      bloqueado: soma((l) => l.minutosBloqueado),
      desligado: soma((l) => l.minutosDesligado),
    },
  };
}

export interface JanelaComparativo {
  inicio: string;
  fim: string;
  /** O que aparece no cartão: "vs ontem (11/09)", "vs semana anterior"… */
  rotulo: string;
}

const DIA_MS = 24 * 60 * 60 * 1000;

/**
 * Janela do período anterior, cortada no mesmo ponto do relógio.
 *
 * Para "dia", o anterior é o último dia com expediente (o banco resolve pela
 * escala da empresa). Para os demais presets, é o período anterior inteiro
 * cortado no mesmo tanto de tempo já decorrido.
 */
export async function janelaComparativo(
  supabase: SupabaseClient,
  periodo: Periodo,
  fuso: string,
  orgId: string | null,
): Promise<JanelaComparativo | null> {
  // "Todo o período" não tem anterior com que comparar.
  if (periodo.preset === "geral") return null;

  const inicio = new Date(periodo.inicio).getTime();
  const fim = new Date(periodo.fim).getTime();
  const decorrido = Math.max(0, Math.min(Date.now(), fim) - inicio);
  if (decorrido === 0) return null;

  if (periodo.preset === "dia") {
    const diaAtual = periodo.ancora;
    const anterior = await buscarDiaExpedienteAnterior(supabase, orgId, diaAtual);
    if (!anterior) return null;

    const prev = criarPeriodo("dia", fuso, { ancora: anterior });
    const prevInicio = new Date(prev.inicio).getTime();
    const [ano, mes, dia] = anterior.split("-");
    return {
      inicio: new Date(prevInicio).toISOString(),
      fim: new Date(prevInicio + decorrido).toISOString(),
      rotulo: `vs ${dia}/${mes}${ano ? "" : ""}`,
    };
  }

  const prev = periodoAnterior(periodo, fuso);
  const prevInicio = new Date(prev.inicio).getTime();
  const prevFim = new Date(prev.fim).getTime();
  const rotulos: Record<string, string> = {
    semana: "vs semana anterior",
    mes: "vs mês anterior",
    ano: "vs ano anterior",
  };

  return {
    inicio: new Date(prevInicio).toISOString(),
    // Nunca ultrapassa o fim real do período anterior (mês curto x mês longo).
    fim: new Date(Math.min(prevFim, prevInicio + decorrido)).toISOString(),
    rotulo: rotulos[periodo.preset] ?? "vs período anterior",
  };
}

/** Variação em pontos percentuais. NULL quando falta base dos dois lados. */
export function variacaoPP(atual: number | null, anterior: number | null): number | null {
  if (atual === null || anterior === null) return null;
  return Number((atual - anterior).toFixed(1));
}

/** Janela do período atual, cortada em "agora" (não adianta somar o futuro). */
export function janelaAtual(periodo: Periodo): { inicio: string; fim: string } {
  const fim = Math.min(Date.now(), new Date(periodo.fim).getTime());
  return {
    inicio: periodo.inicio,
    fim: new Date(Math.max(new Date(periodo.inicio).getTime(), fim)).toISOString(),
  };
}

/** Soma de dias úteis — usado só para rótulos auxiliares. */
export function diasEntre(inicio: string, fim: string): number {
  return Math.max(1, Math.round((new Date(fim).getTime() - new Date(inicio).getTime()) / DIA_MS));
}

export interface GrupoEquipe {
  equipeId: string | null;
  equipe: string;
  resumo: ResumoProdutividade;
}

/**
 * Agrupa as pessoas por equipe e tira a média SIMPLES de cada uma.
 *
 * É o que torna uma equipe de 3 comparável com uma de 10: somar minutos faria a
 * equipe grande parecer sempre mais produtiva só por ser grande.
 */
export function agruparPorEquipe(linhas: LinhaProdutividade[]): GrupoEquipe[] {
  const mapa = new Map<string, LinhaProdutividade[]>();
  for (const l of linhas) {
    const chave = l.equipeId ?? "__sem_equipe__";
    const atual = mapa.get(chave);
    if (atual) atual.push(l);
    else mapa.set(chave, [l]);
  }

  return [...mapa.entries()]
    .map(([chave, ls]) => ({
      equipeId: chave === "__sem_equipe__" ? null : chave,
      equipe: ls[0].equipe ?? "Sem equipe",
      resumo: agregarProdutividade(ls),
    }))
    .sort((a, b) => (b.resumo.indiceMedio ?? -1) - (a.resumo.indiceMedio ?? -1));
}
