// Tipos compartilhados do domínio, espelhando as tabelas do Supabase.

export type TipoCategoria = "PRODUCTIVE" | "NEUTRAL" | "UNPRODUCTIVE";

export interface Dispositivo {
  id: string;
  machine_name: string;
  os_user: string | null;
  status_online: boolean;
  last_sync_at: string | null;
  agent_version: string | null;
}

export interface RegistroAtividade {
  id: number;
  device_id: string;
  timestamp: string;
  process_name: string;
  window_title: string;
  domain: string | null;
  is_idle: boolean;
  is_locked: boolean;
  keystrokes_count: number;
  mouse_clicks_count: number;
  scroll_count: number;
  active_seconds: number;
  foreground_seconds: number;
  os_user: string | null;
}

export interface ResumoDiario {
  org_id: string;
  device_id: string;
  machine_name: string;
  os_user: string | null;
  dia: string;
  minutos_registrados: number;
  minutos_ociosos: number;
  minutos_bloqueado: number;
  minutos_ativos: number;
  segundos_ativos: number;
  total_teclas: number;
  total_cliques: number;
  total_rolagens: number;
  minutos_produtivos: number;
  minutos_neutros: number;
  minutos_improdutivos: number;
}

export interface KpisPainel {
  horasAtivas: number;
  indiceProdutividade: number; // 0-100
  topAplicacao: string;
  dispositivosOnline: number;
  dispositivosTotal: number;
  variacaoHorasAtivas: number; // % vs período anterior
}

export interface PontoSerieTemporal {
  rotulo: string;
  ativo: number;
  ocioso: number;
  improdutivo: number;
}

export interface FatiaDistribuicao {
  nome: string;
  minutos: number;
  cor: string;
}

export interface LinhaTimeline {
  device_id: string;
  machine_name: string;
  os_user: string | null;
  process_name: string;
  domain: string | null;
  window_title: string;
  is_idle: boolean;
  is_locked: boolean;
  timestamp: string;
  interatividade: number; // 0-100
  status: "ativo" | "ocioso" | "offline";
}

export type PeriodoFiltro = "hoje" | "7dias" | "30dias";

export interface EstadoFiltros {
  periodo: PeriodoFiltro;
  dispositivoId: string | "todos";
  busca: string;
}
