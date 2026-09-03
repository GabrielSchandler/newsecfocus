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
    /** Jornada diária padrão da empresa, em minutos. Base da aderência. */
    jornadaPadraoMinutos: number;
    /** Início/fim esperado do expediente (HH:MM). NULL = sem controle de horas extras por padrão. */
    jornadaPadraoHoraInicio: string | null;
    jornadaPadraoHoraFim: string | null;
    /** Código de 12 dígitos digitado no instalador do agente. */
    codigoInstalacao: string | null;
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

/** Uma linha de atividade crua — o detalhe por trás do consolidado. */
export interface Registro {
  momento: string;
  colaborador: string;
  equipe: string;
  maquina: string | null;
  processo: string;
  dominio: string | null;
  titulo: string;
  estado: "ATIVO" | "OCIOSO" | "BLOQUEADO";
  teclas: number;
  cliques: number;
  rolagens: number;
  segundosAtivos: number;
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
  /** NULL = herda a jornada padrão da empresa. */
  jornada_minutos_dia: number | null;
  /** Exceção de horário desta pessoa (HH:MM). NULL = herda o padrão da empresa. */
  jornada_hora_inicio: string | null;
  jornada_hora_fim: string | null;
  /** Falso até um administrador salvar esta pessoa — "aguardando configuração". */
  perfil_completo: boolean;
}

export interface Dispositivo {
  id: string;
  machine_name: string;
  os_user: string | null;
  status_online: boolean;
  last_sync_at: string | null;
  agent_version: string | null;
}

/** Quem entra no painel — diferente de Colaborador, que é quem é acompanhado. */
export interface UsuarioAcesso {
  id: string;
  nome: string | null;
  email: string | null;
  papel: PapelUsuario;
  equipeId: string | null;
  equipeNome: string | null;
  ativo: boolean;
}

/** Configuração que a frota recebe na próxima sincronização. */
export interface ConfiguracaoAgente {
  sync_interval_minutes: number | null;
  agente_segundos_ocioso: number;
  agente_janela_inicio: string | null;
  agente_janela_fim: string | null;
  agente_extrair_dominio: boolean;
  agente_mostrar_bandeja: boolean;
  agente_redigir_numeros: boolean;
  agente_tamanho_lote: number;
  agente_dias_buffer: number;
  agente_processos_sigilosos: string[];
}

export interface Categoria {
  id: string;
  name: string;
  type: TipoCategoria;
  color: string | null;
}

/** Uma linha do catálogo de apps/sites detectados — usado, ou não, para classificar. */
export interface LinhaCatalogoApp {
  alvo: string;
  ehProcesso: boolean;
  mapeamentoId: string | null;
  categoryId: string | null;
  categoriaNome: string | null;
  categoriaTipo: TipoCategoria | null;
  primeiroVisto: string;
  ultimoVisto: string;
  minutosTotais: number;
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
  /** Empresa em foco. Só a operação da NewSec troca; empresa cliente fica na dela. */
  orgId: string | null;
  equipeId: string | null;
  colaboradorId: string | null;
  dispositivoId: string | null;
}

export const ESCOPO_VAZIO: Escopo = {
  orgId: null,
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

/** Uma linha do ranking de horas extras — atividade fora da janela de jornada. */
export interface LinhaHorasExtras {
  colaboradorId: string;
  colaborador: string;
  cargo: string | null;
  equipeId: string | null;
  equipe: string | null;
  /** Falso quando a pessoa não tem janela própria nem herdada da empresa. */
  temJanelaDefinida: boolean;
  minutosExtras: number;
  diasComHoraExtra: number;
  minutosAtivosTotais: number;
  /** NULL quando não há janela definida — nunca tratado como 0%. */
  percentualExtra: number | null;
  /** "09:00–18:00", ou null sem janela definida. */
  janela: string | null;
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
