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
import { REGRAS } from "./regras";
import type { LinhaProdutividade, MinutosExpediente, Periodo, ResumoProdutividade } from "./tipos";

export const MINUTOS_VAZIOS: MinutosExpediente = {
  expediente: 0,
  registrados: 0,
  ativos: 0,
  produtivos: 0,
  neutros: 0,
  improdutivos: 0,
  semClassificar: 0,
  ociosos: 0,
  bloqueado: 0,
  semDados: 0,
  ativosFora: 0,
  sobrepostos: 0,
};

export const RESUMO_VAZIO: ResumoProdutividade = {
  pessoas: 0,
  pessoasComRegistro: 0,
  indiceMedio: null,
  coberturaMedia: null,
  cobertura: null,
  minutos: MINUTOS_VAZIOS,
  aproximado: false,
  pessoasComSobreposicao: 0,
};

export function somarMinutos(lista: MinutosExpediente[]): MinutosExpediente {
  const total = { ...MINUTOS_VAZIOS };
  for (const m of lista) {
    for (const chave of Object.keys(total) as (keyof MinutosExpediente)[]) total[chave] += m[chave];
  }
  return total;
}

const media = (valores: (number | null)[]) => {
  const v = valores.filter((x): x is number => x !== null);
  return v.length === 0 ? null : v.reduce((s, x) => s + x, 0) / v.length;
};

/**
 * Resumo de um recorte. Duas medidas convivem aqui e cada tela diz qual usa:
 *   • indiceMedio / coberturaMedia — média simples por pessoa (regra 1);
 *   • minutos e cobertura — somas e razão dos totais, base da barra em horas.
 */
export function agregarProdutividade(linhas: LinhaProdutividade[]): ResumoProdutividade {
  const base = linhas.filter((l) => l.minutos.expediente > 0);
  const minutos = somarMinutos(linhas.map((l) => l.minutos));
  return {
    pessoas: base.length,
    pessoasComRegistro: linhas.filter((l) => l.minutos.registrados + l.minutos.ativosFora > 0).length,
    indiceMedio: media(base.map((l) => l.indice)),
    coberturaMedia: media(base.map((l) => l.cobertura)),
    cobertura:
      minutos.expediente > 0
        ? (Math.min(minutos.registrados, minutos.expediente) / minutos.expediente) * 100
        : null,
    minutos,
    aproximado: linhas.some((l) => l.aproximado),
    pessoasComSobreposicao: linhas.filter((l) => l.minutos.sobrepostos > 0).length,
  };
}

/**
 * Variação do índice médio entre dois recortes, em p.p. — ou NULL quando não
 * há base: sem expediente de um dos lados, ou com cobertura baixa demais para
 * a diferença significar mudança de trabalho e não falta de dado.
 */
export function compararIndice(
  atual: ResumoProdutividade,
  anterior: ResumoProdutividade | null,
): number | null {
  if (!anterior || atual.indiceMedio === null || anterior.indiceMedio === null) return null;
  const minima = REGRAS.coberturaMinimaComparacao;
  if ((atual.cobertura ?? 0) < minima || (anterior.cobertura ?? 0) < minima) return null;
  return Number((atual.indiceMedio - anterior.indiceMedio).toFixed(1));
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
