// ============================================================================
//  Tipos do domínio, espelhando o banco.
//
//  Hierarquia: Empresa (organizations) → Equipe (teams) → Colaborador
//  (employees) → Atividade. Os filtros do painel percorrem exatamente esses
//  três níveis.
// ============================================================================

export type TipoCategoria = "PRODUCTIVE" | "NEUTRAL" | "UNPRODUCTIVE";

export type PapelUsuario = "OWNER" | "MANAGER" | "TEAM_LEAD" | "VIEWER";

export type StatusEmpresa = "TRIAL" | "ATIVA" | "SUSPENSA" | "CANCELADA";

// ----------------------------------------------------------------------------
//  Contexto de quem está olhando o painel
// ----------------------------------------------------------------------------
export interface ContextoSessao {
  usuarioId: string;
  email: string;
  nome: string | null;
  papel: PapelUsuario;
  /** Preenchido só para TEAM_LEAD: limita o que a pessoa enxerga. */
  equipeEscopo: string | null;
  empresa: {
    id: string;
    nome: string;
    slug: string;
    status: StatusEmpresa;
    plano: string;
    fuso: string;
    maxDispositivos: number;
    retencaoDias: number;
  };
  /** Operador da revenda: administra contas de clientes, não vê telemetria. */
  adminPlataforma: boolean;
}

// ----------------------------------------------------------------------------
//  Cadastros
// ----------------------------------------------------------------------------
export interface Equipe {
  id: string;
  nome: string;
  descricao: string | null;
  cor: string | null;
  ativa: boolean;
  total_pessoas?: number;
}

export interface Colaborador {
  id: string;
  team_id: string | null;
  equipe_nome?: string | null;
  os_user: string;
  nome: string | null;
  cargo: string | null;
  email: string | null;
  ativo: boolean;
  jornada_minutos_dia: number;
}

export interface Dispositivo {
  id: string;
  machine_name: string;
  os_user: string | null;
  status_online: boolean;
  last_sync_at: string | null;
  agent_version: string | null;
}

export interface Categoria {
  id: string;
  name: string;
  type: TipoCategoria;
  color: string | null;
}

export interface MapeamentoApp {
  id: string;
  process_name: string | null;
  domain: string | null;
  category_id: string | null;
  categoria_nome?: string | null;
  categoria_tipo?: TipoCategoria | null;
}

// ----------------------------------------------------------------------------
//  Períodos
// ----------------------------------------------------------------------------
export type PresetPeriodo = "dia" | "semana" | "mes" | "ano" | "geral" | "personalizado";

export type BucketSerie = "hour" | "day" | "week" | "month";

export interface Periodo {
  preset: PresetPeriodo;
  /** Instante inicial, inclusivo (ISO). */
  inicio: string;
  /** Instante final, EXCLUSIVO (ISO). */
  fim: string;
  bucket: BucketSerie;
  rotulo: string;
  /** Data de referência (YYYY-MM-DD) usada para navegar anterior/próximo. */
  ancora: string;
}

// ----------------------------------------------------------------------------
//  Escopo hierárquico dos filtros
// ----------------------------------------------------------------------------
export interface Escopo {
  equipeId: string | null;
  colaboradorId: string | null;
  dispositivoId: string | null;
}

export const ESCOPO_VAZIO: Escopo = {
  equipeId: null,
  colaboradorId: null,
  dispositivoId: null,
};

// ----------------------------------------------------------------------------
//  Métricas
// ----------------------------------------------------------------------------
export interface Kpis {
  minutosRegistrados: number;
  minutosAtivos: number;
  minutosOciosos: number;
  minutosBloqueado: number;
  minutosProdutivos: number;
  minutosNeutros: number;
  minutosImprodutivos: number;
  minutosSemClassificar: number;
  teclas: number;
  cliques: number;
  rolagens: number;
  /** NULL = nada classificado no período. Nunca exibir como 0% nem como 100%. */
  indice: number | null;
  colaboradores: number;
  dispositivos: number;
  diasComRegistro: number;
  topAplicacao: string | null;
  jornadaEsperada: number;
}

export interface KpisComparados {
  atual: Kpis;
  anterior: Kpis;
  /** Variação percentual do período atual sobre o anterior. NULL = sem base. */
  variacao: {
    minutosAtivos: number | null;
    indice: number | null;
    minutosProdutivos: number | null;
    interacoes: number | null;
  };
}

export interface PontoSerie {
  balde: string;
  rotulo: string;
  ativo: number;
  ocioso: number;
  produtivo: number;
  neutro: number;
  improdutivo: number;
  indice: number | null;
}

export interface FatiaDistribuicao {
  nome: string;
  tipo: TipoCategoria | null;
  minutos: number;
  pessoas: number;
  cor: string;
}

export interface LinhaRankingEquipe {
  equipeId: string;
  equipe: string;
  cor: string | null;
  pessoas: number;
  minutosAtivos: number;
  minutosOciosos: number;
  minutosProdutivos: number;
  minutosNeutros: number;
  minutosImprodutivos: number;
  indice: number | null;
  aderencia: number | null;
}

export interface LinhaRankingColaborador {
  colaboradorId: string;
  colaborador: string;
  cargo: string | null;
  equipeId: string | null;
  equipe: string | null;
  diasComRegistro: number;
  minutosAtivos: number;
  minutosOciosos: number;
  minutosProdutivos: number;
  minutosNeutros: number;
  minutosImprodutivos: number;
  teclas: number;
  cliques: number;
  indice: number | null;
  aderencia: number | null;
}

export interface LinhaTempoReal {
  colaboradorId: string;
  colaborador: string;
  equipe: string;
  maquina: string | null;
  processo: string;
  dominio: string | null;
  tituloJanela: string;
  momento: string | null;
  teclas: number;
  cliques: number;
  rolagens: number;
  status: "ativo" | "ocioso" | "offline";
}

// ----------------------------------------------------------------------------
//  Painel da plataforma (revenda)
// ----------------------------------------------------------------------------
export interface EmpresaCliente {
  id: string;
  nome: string;
  slug: string;
  status: StatusEmpresa;
  plano: string;
  maxDispositivos: number;
  dispositivos: number;
  dispositivosOnline: number;
  usuarios: number;
  ultimaSincronizacao: string | null;
  criadaEm: string;
}

// ----------------------------------------------------------------------------
//  Relatórios exportáveis
// ----------------------------------------------------------------------------
export type TipoRelatorio = "diario" | "colaboradores" | "equipes" | "aplicativos";

export const RELATORIOS: Record<TipoRelatorio, { titulo: string; descricao: string }> = {
  diario: {
    titulo: "Dia a dia por colaborador",
    descricao: "Uma linha por pessoa e por dia, com horas, índice e expediente.",
  },
  colaboradores: {
    titulo: "Consolidado por colaborador",
    descricao: "Uma linha por pessoa no período, com aderência à jornada.",
  },
  equipes: {
    titulo: "Consolidado por equipe",
    descricao: "Comparativo entre equipes no período.",
  },
  aplicativos: {
    titulo: "Uso de aplicativos e sites",
    descricao: "Tempo por ferramenta, com a categoria de produtividade.",
  },
};
