import type { SupabaseClient } from "@supabase/supabase-js";
import { inicioDoPeriodo } from "./formato";
import type {
  Dispositivo,
  FatiaDistribuicao,
  KpisPainel,
  LinhaTimeline,
  PeriodoFiltro,
  PontoSerieTemporal,
} from "./tipos";

// Cores por tipo de categoria, reaproveitadas no donut.
const CORES_TIPO: Record<string, string> = {
  PRODUCTIVE: "#22d3ee",
  NEUTRAL: "#a78bfa",
  UNPRODUCTIVE: "#fb7185",
};
const PALETA_FALLBACK = ["#22d3ee", "#38bdf8", "#a78bfa", "#34d399", "#fbbf24", "#fb7185", "#f472b6", "#818cf8"];

export async function buscarDispositivos(supabase: SupabaseClient): Promise<Dispositivo[]> {
  const { data, error } = await supabase
    .from("devices")
    .select("id, machine_name, os_user, status_online, last_sync_at, agent_version")
    .order("machine_name");

  if (error) throw error;
  return (data ?? []) as Dispositivo[];
}

export interface ResumoKpis {
  kpis: KpisPainel;
  totalTeclas: number;
  totalCliques: number;
}

export async function buscarKpis(
  supabase: SupabaseClient,
  periodo: PeriodoFiltro,
  dispositivoId: string | "todos",
  totalDispositivos: number,
  onlineDispositivos: number,
): Promise<ResumoKpis> {
  const inicio = inicioDoPeriodo(periodo).toISOString();
  const p_device = dispositivoId === "todos" ? null : dispositivoId;

  const { data, error } = await supabase.rpc("kpis_periodo", { p_inicio: inicio, p_device });
  if (error) throw error;

  const linha = (Array.isArray(data) ? data[0] : data) ?? {};
  const minutosAtivos = Number(linha.minutos_ativos ?? 0);
  const prod = Number(linha.minutos_produtivos ?? 0);
  const neutro = Number(linha.minutos_neutros ?? 0);
  const improd = Number(linha.minutos_improd ?? 0);
  const classificados = prod + neutro + improd;

  // Índice: produtivos sobre o tempo classificado; sem classificação, cai para ativos.
  const indice =
    classificados > 0
      ? (prod / classificados) * 100
      : minutosAtivos > 0
        ? 100
        : 0;

  return {
    kpis: {
      horasAtivas: minutosAtivos / 60,
      indiceProdutividade: Math.round(indice),
      topAplicacao: linha.top_aplicacao ?? "—",
      dispositivosOnline: onlineDispositivos,
      dispositivosTotal: totalDispositivos,
      variacaoHorasAtivas: 0,
    },
    totalTeclas: Number(linha.total_teclas ?? 0),
    totalCliques: Number(linha.total_cliques ?? 0),
  };
}

export async function buscarSerieTemporal(
  supabase: SupabaseClient,
  periodo: PeriodoFiltro,
  dispositivoId: string | "todos",
): Promise<PontoSerieTemporal[]> {
  const inicio = inicioDoPeriodo(periodo).toISOString();
  const p_device = dispositivoId === "todos" ? null : dispositivoId;
  const p_bucket = periodo === "hoje" ? "hour" : "day";

  const { data, error } = await supabase.rpc("serie_atividade", {
    p_inicio: inicio,
    p_bucket,
    p_device,
  });
  if (error) throw error;

  return (data ?? []).map((r: any) => {
    const d = new Date(r.balde);
    const rotulo =
      p_bucket === "hour"
        ? d.toLocaleTimeString("pt-BR", { hour: "2-digit" }) + "h"
        : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
    return {
      rotulo,
      ativo: Number(r.min_ativo ?? 0),
      ocioso: Number(r.min_ocioso ?? 0),
      improdutivo: Number(r.min_improd ?? 0),
    };
  });
}

export async function buscarDistribuicao(
  supabase: SupabaseClient,
  periodo: PeriodoFiltro,
  dispositivoId: string | "todos",
): Promise<FatiaDistribuicao[]> {
  const inicio = inicioDoPeriodo(periodo).toISOString();
  const p_device = dispositivoId === "todos" ? null : dispositivoId;

  const { data, error } = await supabase.rpc("distribuicao_apps", {
    p_inicio: inicio,
    p_device,
    p_limite: 8,
  });
  if (error) throw error;

  return (data ?? []).map((r: any, i: number) => ({
    nome: r.rotulo ?? "—",
    minutos: Number(r.minutos ?? 0),
    cor: CORES_TIPO[r.tipo] ?? PALETA_FALLBACK[i % PALETA_FALLBACK.length],
  }));
}

export async function buscarTimeline(supabase: SupabaseClient): Promise<LinhaTimeline[]> {
  const { data, error } = await supabase.rpc("ultima_atividade_por_dispositivo");
  if (error) throw error;

  return (data ?? []).map((r: any) => {
    const interatividade = Math.min(
      100,
      (Number(r.keystrokes_count ?? 0) +
        Number(r.mouse_clicks_count ?? 0) +
        Number(r.scroll_count ?? 0)) /
        3,
    );

    let status: LinhaTimeline["status"] = "offline";
    if (r.status_online) status = r.is_idle || r.is_locked ? "ocioso" : "ativo";

    return {
      device_id: r.device_id,
      machine_name: r.machine_name,
      os_user: r.os_user,
      process_name: r.process_name ?? "—",
      domain: r.domain,
      window_title: r.window_title ?? "",
      is_idle: !!r.is_idle,
      is_locked: !!r.is_locked,
      timestamp: r.timestamp,
      interatividade: Math.round(interatividade),
      status,
    } as LinhaTimeline;
  });
}
