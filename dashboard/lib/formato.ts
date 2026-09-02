// ============================================================================
//  Formatação de números, tempo e rótulos — sempre em pt-BR.
// ============================================================================

import type { BucketSerie } from "./tipos";
import { partesNoFuso } from "./periodos";

/** Converte um total de minutos em "Xh YYmin". */
export function formatarHoras(minutos: number): string {
  const total = Math.max(0, Math.round(minutos));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m}min`;
  return `${h}h ${m.toString().padStart(2, "0")}min`;
}

/** Versão compacta para células de tabela: "7h32". */
export function formatarHorasCurto(minutos: number): string {
  const total = Math.max(0, Math.round(minutos));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m}min`;
  return `${h}h${m.toString().padStart(2, "0")}`;
}

export function formatarNumero(valor: number): string {
  return new Intl.NumberFormat("pt-BR").format(Math.round(valor));
}

/** Abrevia números grandes: 12.400 → "12,4 mil". */
export function formatarNumeroCompacto(valor: number): string {
  if (Math.abs(valor) < 1000) return formatarNumero(valor);
  return new Intl.NumberFormat("pt-BR", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(valor);
}

export function formatarPorcentagem(valor: number | null, casas = 0): string {
  if (valor === null || Number.isNaN(valor)) return "—";
  return `${valor.toFixed(casas).replace(".", ",")}%`;
}

/** Variação com sinal explícito: "+12,4%" / "−3,1%". */
export function formatarVariacao(valor: number | null): string {
  if (valor === null || Number.isNaN(valor)) return "—";
  const sinal = valor > 0 ? "+" : valor < 0 ? "−" : "";
  return `${sinal}${Math.abs(valor).toFixed(1).replace(".", ",")}%`;
}

/** "há 3 min", "há 2 h", "agora". */
export function tempoRelativo(iso: string | null): string {
  if (!iso) return "nunca";
  const seg = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));

  if (seg < 45) return "agora";
  if (seg < 90) return "há 1 min";
  const min = Math.floor(seg / 60);
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.floor(h / 24);
  return `há ${d} d`;
}

export function horaCurta(iso: string | null, fuso: string): string {
  if (!iso) return "—";
  const p = partesNoFuso(new Date(iso), fuso);
  return `${String(p.hora).padStart(2, "0")}:${String(p.minuto).padStart(2, "0")}`;
}

export function dataCurta(iso: string | null, fuso: string): string {
  if (!iso) return "—";
  const p = partesNoFuso(new Date(iso), fuso);
  return `${String(p.dia).padStart(2, "0")}/${String(p.mes).padStart(2, "0")}/${p.ano}`;
}

/** Rótulo de um ponto da série, adequado ao bucket em uso. */
export function rotuloDoBalde(iso: string, bucket: BucketSerie, fuso: string): string {
  const p = partesNoFuso(new Date(iso), fuso);
  const dd = String(p.dia).padStart(2, "0");
  const mm = String(p.mes).padStart(2, "0");

  switch (bucket) {
    case "hour":
      return `${String(p.hora).padStart(2, "0")}h`;
    case "day":
      return `${dd}/${mm}`;
    case "week":
      return `${dd}/${mm}`;
    case "month":
      return `${mm}/${String(p.ano).slice(2)}`;
  }
}

// ----------------------------------------------------------------------------
//  Cores e rótulos das categorias de produtividade
// ----------------------------------------------------------------------------
export const CORES_TIPO: Record<string, string> = {
  PRODUCTIVE: "#22d3ee",
  NEUTRAL: "#a78bfa",
  UNPRODUCTIVE: "#fb7185",
  SEM: "#475569",
};

export const ROTULOS_TIPO: Record<string, string> = {
  PRODUCTIVE: "Produtivo",
  NEUTRAL: "Neutro",
  UNPRODUCTIVE: "Improdutivo",
  SEM: "Sem classificação",
};

export const PALETA_SERIES = [
  "#22d3ee", "#a78bfa", "#34d399", "#fbbf24",
  "#fb7185", "#38bdf8", "#f472b6", "#818cf8",
  "#2dd4bf", "#facc15",
];

/**
 * Faixa qualitativa do índice de produtividade. Usada para colorir sem depender
 * só de cor (o rótulo acompanha), o que mantém a leitura acessível.
 */
export function faixaIndice(indice: number | null): {
  rotulo: string;
  cor: string;
  classe: string;
} {
  if (indice === null) {
    return { rotulo: "sem classificação", cor: "#475569", classe: "text-slate-500" };
  }
  if (indice >= 70) return { rotulo: "alto", cor: "#34d399", classe: "text-emerald-400" };
  if (indice >= 45) return { rotulo: "médio", cor: "#fbbf24", classe: "text-amber-400" };
  return { rotulo: "baixo", cor: "#fb7185", classe: "text-rose-400" };
}

/** Nome de arquivo seguro para os relatórios exportados. */
export function nomeArquivo(base: string, rotuloPeriodo: string, extensao: string): string {
  const limpo = (t: string) =>
    t
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase();
  return `${limpo(base)}-${limpo(rotuloPeriodo)}.${extensao}`;
}
