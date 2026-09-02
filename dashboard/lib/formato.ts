import type { PeriodoFiltro } from "./tipos";

/** Converte um total de minutos em "Xh Ym". */
export function formatarHoras(minutos: number): string {
  const h = Math.floor(minutos / 60);
  const m = Math.round(minutos % 60);
  if (h === 0) return `${m}min`;
  return `${h}h ${m.toString().padStart(2, "0")}min`;
}

export function formatarNumero(valor: number): string {
  return new Intl.NumberFormat("pt-BR").format(valor);
}

export function formatarPorcentagem(valor: number, casas = 0): string {
  return `${valor.toFixed(casas).replace(".", ",")}%`;
}

/** "há 3 min", "há 2 h", "agora". */
export function tempoRelativo(iso: string | null): string {
  if (!iso) return "nunca";
  const agora = Date.now();
  const t = new Date(iso).getTime();
  const seg = Math.max(0, Math.floor((agora - t) / 1000));

  if (seg < 45) return "agora";
  if (seg < 90) return "há 1 min";
  const min = Math.floor(seg / 60);
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.floor(h / 24);
  return `há ${d} d`;
}

export function horaCurta(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Início do intervalo (ISO) para o período escolhido. */
export function inicioDoPeriodo(periodo: PeriodoFiltro): Date {
  const agora = new Date();
  switch (periodo) {
    case "hoje": {
      const d = new Date(agora);
      d.setHours(0, 0, 0, 0);
      return d;
    }
    case "7dias":
      return new Date(agora.getTime() - 7 * 24 * 60 * 60 * 1000);
    case "30dias":
      return new Date(agora.getTime() - 30 * 24 * 60 * 60 * 1000);
  }
}

export const rotuloPeriodo: Record<PeriodoFiltro, string> = {
  hoje: "Hoje",
  "7dias": "Últimos 7 dias",
  "30dias": "Últimos 30 dias",
};
