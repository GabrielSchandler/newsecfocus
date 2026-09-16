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

/**
 * Duração para número grande de indicador: "158h 24m", "124h", "40m".
 * Mais curta que formatarHoras porque divide a linha com um título.
 */
export function formatarDuracao(minutos: number): string {
  const total = Math.max(0, Math.round(minutos));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m.toString().padStart(2, "0")}m`;
}

/** "62%" quando é redondo, "10,8%" quando não é — sem ",0" sobrando. */
export function formatarPorcentagemEnxuta(valor: number | null): string {
  if (valor === null || Number.isNaN(valor)) return "—";
  const arredondado = Math.round(valor * 10) / 10;
  return Number.isInteger(arredondado)
    ? `${arredondado}%`
    : `${arredondado.toFixed(1).replace(".", ",")}%`;
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

const DIAS_SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

const MESES_CURTOS = [
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
];

/** Como se chama a granularidade do gráfico, em português claro. */
export const ROTULO_BUCKET: Record<BucketSerie, string> = {
  hour: "hora a hora",
  day: "dia a dia",
  week: "semana a semana",
  month: "mês a mês",
};

/**
 * Rótulo completo de um ponto da série, para o tooltip.
 *
 * O rótulo curto do eixo ("14h", "03/09") é ambíguo fora de contexto: não dá
 * para saber de que dia é aquela hora, nem se "03/09" é um dia ou a semana que
 * começa nele. Aqui o ponto se explica sozinho.
 */
export function rotuloCompletoDoBalde(iso: string, bucket: BucketSerie, fuso: string): string {
  const p = partesNoFuso(new Date(iso), fuso);
  const dd = String(p.dia).padStart(2, "0");
  const mm = String(p.mes).padStart(2, "0");
  const hh = String(p.hora).padStart(2, "0");

  switch (bucket) {
    case "hour":
      return `${dd}/${mm}, ${hh}h às ${String((p.hora + 1) % 24).padStart(2, "0")}h`;
    case "day": {
      // Dia da semana da data LOCAL: montar em UTC a partir das partes já
      // convertidas evita o deslocamento de um dia em fuso à frente de UTC.
      const diaSemana = DIAS_SEMANA[new Date(Date.UTC(p.ano, p.mes - 1, p.dia)).getUTCDay()];
      return `${diaSemana}, ${dd}/${mm}/${p.ano}`;
    }
    case "week":
      return `semana de ${dd}/${mm}/${p.ano}`;
    case "month":
      return `${MESES_CURTOS[p.mes - 1]} de ${p.ano}`;
  }
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
// Mesmos tons das fatias do expediente (lib/cores-expediente.ts): a categoria
// de um aplicativo e o tempo que ele ocupa são a mesma leitura.
export const CORES_TIPO: Record<string, string> = {
  PRODUCTIVE: "#1f9fb2",
  NEUTRAL: "#3d5f8f",
  UNPRODUCTIVE: "#e0676b",
  SEM: "#a9c8e4",
};

export const ROTULOS_TIPO: Record<string, string> = {
  PRODUCTIVE: "Produtivo",
  NEUTRAL: "Neutro",
  UNPRODUCTIVE: "Improdutivo",
  SEM: "Sem classificação",
};

export const PALETA_SERIES = [
  "#1f9fb2", "#3d5f8f", "#e0a13a", "#6b8fbf",
  "#e0676b", "#4f9d78", "#8a6fb0", "#c07a4f",
  "#5aa7c9", "#9aa5b4",
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
    return { rotulo: "sem classificação", cor: "#94a3b8", classe: "text-slate-500" };
  }
  if (indice >= 70) return { rotulo: "alto", cor: "#15803d", classe: "text-emerald-700" };
  if (indice >= 45) return { rotulo: "médio", cor: "#b45309", classe: "text-amber-700" };
  return { rotulo: "baixo", cor: "#be123c", classe: "text-rose-700" };
}

/**
 * O agregado guarda aplicativo e site no mesmo campo de texto, então "é
 * processo ou domínio?" se decide pelo nome. O agente sempre grava processo
 * terminando em ".exe" — mesma regra usada pela RPC painel_catalogo_apps
 * (migration 0012). Se mudar aqui, mudar lá também.
 */
export function ehProcessoWindows(alvo: string): boolean {
  return alvo.toLowerCase().endsWith(".exe");
}

/**
 * Código de instalação em blocos de quatro: 1234-5678-9012.
 * Quem digita isso é o TI do cliente, muitas vezes lendo de um papel — os
 * blocos reduzem erro e facilitam ditar por telefone.
 */
export function formatarCodigoInstalacao(codigo: string | null): string {
  if (!codigo) return "—";
  const digitos = codigo.replace(/\D/g, "");
  return digitos.replace(/(\d{4})(?=\d)/g, "$1-");
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
