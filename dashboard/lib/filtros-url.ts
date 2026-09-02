// ============================================================================
//  Leitura dos filtros a partir da URL.
//
//  As páginas do painel são Server Components: recebem searchParams, montam o
//  período e o escopo aqui e consultam já filtrado. O estado morar na URL é o
//  que torna cada recorte um link compartilhável.
// ============================================================================

import { periodoDeParams } from "./periodos";
import type { ContextoSessao, Escopo, Periodo } from "./tipos";

export type ParamsPagina = Record<string, string | string[] | undefined>;

function texto(params: ParamsPagina, chave: string): string | undefined {
  const valor = params[chave];
  if (Array.isArray(valor)) return valor[0];
  return valor;
}

export interface FiltrosPagina {
  periodo: Periodo;
  escopo: Escopo;
}

export function lerFiltros(params: ParamsPagina, contexto: ContextoSessao): FiltrosPagina {
  const fuso = contexto.empresa.fuso;

  const periodo = periodoDeParams(
    {
      preset: texto(params, "preset"),
      ancora: texto(params, "ancora"),
      de: texto(params, "de"),
      ate: texto(params, "ate"),
    },
    fuso,
  );

  // Líder de equipe não escolhe escopo: ele é fixo no perfil. O RLS já garante
  // isso no banco; fixar aqui evita mostrar um filtro que não teria efeito.
  const equipeId = contexto.equipeEscopo ?? texto(params, "equipe") ?? null;

  // A empresa em foco só vale para a operação da NewSec; o banco recusa o
  // parâmetro para qualquer outro usuário, então aqui não há risco.
  const orgId = contexto.adminPlataforma ? (texto(params, "empresa") ?? null) : null;

  return {
    periodo,
    escopo: {
      orgId,
      equipeId,
      colaboradorId: texto(params, "colaborador") ?? null,
      dispositivoId: texto(params, "dispositivo") ?? null,
    },
  };
}

/**
 * Empresa cujos cadastros devem ser lidos. Para a empresa cliente é sempre a
 * dela; para o master é a que ele escolheu, caindo na própria quando não há
 * escolha.
 */
export function orgEfetiva(contexto: ContextoSessao, escopo: Escopo): string {
  return escopo.orgId ?? contexto.empresa.id;
}

/** Rótulo curto do período anterior, usado nas comparações dos KPIs. */
export function rotuloComparacao(periodo: Periodo): string {
  switch (periodo.preset) {
    case "dia":
      return "dia anterior";
    case "semana":
      return "semana anterior";
    case "mes":
      return "mês anterior";
    case "ano":
      return "ano anterior";
    default:
      return "período anterior";
  }
}

/** Repassa os filtros atuais para links internos (mantém o recorte no drill-down). */
export function paramsDoRecorte(params: ParamsPagina): string {
  const busca = new URLSearchParams();
  for (const chave of ["preset", "ancora", "de", "ate", "empresa", "equipe", "colaborador", "dispositivo"]) {
    const valor = texto(params, chave);
    if (valor) busca.set(chave, valor);
  }
  const texto_ = busca.toString();
  return texto_ ? `?${texto_}` : "";
}
