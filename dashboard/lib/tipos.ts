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
  /** Senha definida por um administrador, ainda pendente de decisão do dono. */
  senhaProvisoria: boolean;
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

/** Marcos do ciclo de vida da estação — espelha o enum tipo_evento_estacao. */
export type TipoEventoEstacao =
  | "AGENTE_INICIADO"
  | "AGENTE_PARADO"
  | "SUSPENSA"
  | "RETOMADA"
  | "DESLIGANDO"
  | "BLOQUEADA"
  | "DESBLOQUEADA";

/** Uma linha da linha do tempo da estação (tela de Dispositivos). */
export interface EventoEstacao {
  id: number;
  dispositivoId: string;
  maquina: string;
  tipo: TipoEventoEstacao;
  momento: string; // ISO
  versao: string | null;
}

/** Estados possíveis de um minuto na linha do tempo do dia. */
export type EstadoLinha =
  | "PRODUTIVO"
  | "NEUTRO"
  | "IMPRODUTIVO"
  | "SEM"
  | "OCIOSO"
  | "BLOQUEADO";

/** Um trecho contíguo de mesmo estado na linha do tempo (do banco). */
export interface SegmentoLinha {
  dia: string; // YYYY-MM-DD no fuso da empresa
  inicio: string; // ISO
  fim: string; // ISO
  estado: EstadoLinha;
  minutos: number;
}

/** Presença e pontualidade de uma pessoa no período. */
export interface LinhaPresenca {
  colaboradorId: string;
  colaborador: string;
  equipeId: string | null;
  equipe: string | null;
  diasPresentes: number;
  diasUteis: number;
  faltas: number;
  /** Minuto do dia (0..1439) no fuso da empresa; null quando não há sinal. */
  chegadaMedia: number | null;
  saidaMedia: number | null;
  chegadaCedo: number | null;
  saidaTarde: number | null;
}

/** Um ponto do ritmo: uma célula (dia da semana × hora). */
export interface PontoRitmo {
  diaSemana: number; // 1=segunda ... 7=domingo
  hora: number; // 0..23
  minutosAtivos: number;
  minutosProdutivos: number;
  minutosRegistrados: number;
}

/** Evolução de uma pessoa: período atual vs. período anterior. */
export interface LinhaEvolucao {
  colaboradorId: string;
  colaborador: string;
  equipe: string | null;
  indiceAtual: number | null;
  indiceAnterior: number | null;
  ativosAtual: number;
  ativosAnterior: number;
  diasAtual: number;
  diasAnterior: number;
}

/** Um site (domínio) no ranking de uso. */
export interface LinhaDominio {
  dominio: string;
  tipo: TipoCategoria | null;
  minutos: number;
  pessoas: number;
}

/** Dispersão de uma pessoa: trocas de aplicativo por hora ativa. */
export interface LinhaDispersao {
  colaboradorId: string;
  colaborador: string;
  equipe: string | null;
  trocas: number;
  minutosAtivos: number;
  trocasPorHora: number;
}

/**
 * Minutos de expediente de um recorte, todos sobre a MESMA janela e escala.
 * produtivos + neutros + improdutivos + semClassificar = ativos;
 * ativos + ociosos + bloqueado = registrados; registrados + semDados = expediente.
 * ativosFora é o tempo ativo fora da escala e fica de fora dessas somas.
 */
export interface MinutosExpediente {
  expediente: number;
  registrados: number;
  ativos: number;
  produtivos: number;
  neutros: number;
  improdutivos: number;
  semClassificar: number;
  ociosos: number;
  bloqueado: number;
  semDados: number;
  ativosFora: number;
  /** Minutos em que mais de uma estação da pessoa mandou registro. */
  sobrepostos: number;
}

/** As sete fatias do expediente, na ordem da barra e da legenda. */
export type FatiaExpediente =
  | "produtivos"
  | "neutros"
  | "improdutivos"
  | "semClassificar"
  | "ociosos"
  | "bloqueado"
  | "semDados";

/**
 * Métricas de expediente de uma pessoa (fonte única: painel_produtividade_diaria).
 * Índice = produtivo ÷ expediente decorrido. NULL quando não há expediente.
 */
export interface LinhaProdutividade {
  colaboradorId: string;
  colaborador: string;
  equipeId: string | null;
  equipe: string | null;
  minutos: MinutosExpediente;
  diasComExpediente: number;
  diasComRegistro: number;
  /** Algum corte de escala caiu no meio de um bloco: parte do tempo foi rateada. */
  aproximado: boolean;
  indice: number | null;
  /** Registrado dentro do expediente ÷ expediente. */
  cobertura: number | null;
}

/** A mesma medida, por pessoa e por dia. */
export interface LinhaProdutividadeDia {
  colaboradorId: string;
  colaborador: string;
  equipeId: string | null;
  equipe: string | null;
  dia: string;
  trabalha: boolean;
  escalaInicio: string | null;
  escalaFim: string | null;
  intervaloInicio: string | null;
  intervaloFim: string | null;
  minutos: MinutosExpediente;
  aproximado: boolean;
  indice: number | null;
  cobertura: number | null;
}

/** Agregado de um recorte. */
export interface ResumoProdutividade {
  /** Pessoas com expediente previsto no recorte. */
  pessoas: number;
  pessoasComRegistro: number;
  /** Média SIMPLES do índice de cada pessoa — cada pessoa pesa igual. */
  indiceMedio: number | null;
  /** Média simples da cobertura de cada pessoa. */
  coberturaMedia: number | null;
  /** Razão dos totais: minutos registrados ÷ minutos de expediente. */
  cobertura: number | null;
  /** Somas de minutos do recorte (base da barra de composição, em horas). */
  minutos: MinutosExpediente;
  aproximado: boolean;
  pessoasComSobreposicao: number;
}

/** Um ponto da evolução do índice: um dia, semana ou mês com expediente. */
export interface PontoProdutividade {
  /** Início do balde, YYYY-MM-DD no fuso da empresa. */
  balde: string;
  pessoas: number;
  indice: number | null;
  cobertura: number | null;
}

/** Uma linha da lista de pessoas (paginada no banco). */
export interface LinhaPessoa {
  colaboradorId: string;
  nome: string;
  osUser: string;
  cargo: string | null;
  email: string | null;
  equipeId: string | null;
  equipe: string | null;
  ativo: boolean;
  perfilCompleto: boolean;
  minutosExpediente: number | null;
  minutosAtivos: number | null;
  minutosAtivosFora: number | null;
  indice: number | null;
  cobertura: number | null;
  aproximado: boolean;
  ultimoRegistro: string | null;
}

export interface ContagemPessoas {
  cadastradas: number;
  comRegistro: number;
  semRegistro: number;
  pendentes: number;
  semEquipe: number;
  inativas: number;
}

export type FiltroAplicativos = "todos" | "aplicativos" | "sites" | "sem";

/** Um aplicativo ou site usado no período. */
export interface LinhaAplicativo {
  alvo: string;
  ehSite: boolean;
  /** Categoria efetiva na consolidação. NULL = sem classificação. */
  tipo: TipoCategoria | null;
  mapeamentoId: string | null;
  categoriaId: string | null;
  categoriaNome: string | null;
  /** O alvo tem regra própria? Por domínio ou por processo. */
  regraPor: "dominio" | "processo" | null;
  minutos: number;
  pessoas: number;
  dias: number;
}

export interface ResumoAplicativos {
  identificados: number;
  classificados: number;
  semClassificacao: number;
  aplicativos: number;
  sites: number;
  qtdPorTipo: Record<TipoCategoria, number>;
  minutosTotal: number;
  minutosPorTipo: Record<TipoCategoria | "SEM", number>;
}

/** Jornada de uma pessoa no período. */
export interface LinhaJornada {
  colaboradorId: string;
  colaborador: string;
  equipeId: string | null;
  equipe: string | null;
  escala: string;
  diasComExpediente: number;
  diasComRegistro: number;
  minutosExpediente: number;
  minutosRegistrados: number;
  minutosAtivosFora: number;
  cobertura: number | null;
  /** Minuto do dia (0..1439), média dos dias com registro. */
  primeiroRegistroMedio: number | null;
  ultimoRegistroMedio: number | null;
  /** Algum dia só tinha o resumo de 15 min (dado cru fora da retenção). */
  horariosPorBloco: boolean;
  aproximado: boolean;
}

/** Um dia de jornada de uma pessoa, para o comparativo visual. */
export interface JornadaDia {
  colaboradorId: string;
  colaborador: string;
  equipe: string | null;
  trabalha: boolean;
  escalaInicio: string | null;
  escalaFim: string | null;
  intervaloInicio: string | null;
  intervaloFim: string | null;
  minutosExpediente: number;
  minutosRegistrados: number;
  minutosAtivosFora: number;
  primeiroRegistro: string | null;
  ultimoRegistro: string | null;
  /** Blocos de 15 min: [minuto do dia, minutos registrados, minutos ativos]. */
  blocos: [number, number, number][];
}

/** Minutos seguidos do mesmo aplicativo e estado. */
export interface Sessao {
  inicio: string;
  fim: string;
  alvo: string;
  tipo: TipoCategoria | null;
  estado: "ATIVO" | "OCIOSO" | "BLOQUEADO";
  minutos: number;
  maquina: string | null;
}

export type SituacaoEstacao = "RECENTE" | "ATRASADA" | "SEM_ENVIO";

export interface Estacao {
  id: string;
  maquina: string;
  usuarioWindows: string | null;
  versao: string | null;
  ultimoEnvio: string | null;
  ultimoRegistro: string | null;
  minutosSemEnvio: number | null;
  limiarMinutos: number;
  situacao: SituacaoEstacao;
  colaboradorId: string | null;
  colaborador: string | null;
  equipeId: string | null;
  equipe: string | null;
  emExpedienteAgora: boolean;
}

/** Quem usa um aplicativo/site, na visão por aplicativo. */
export interface LinhaAppPessoa {
  colaboradorId: string;
  colaborador: string;
  equipeId: string | null;
  equipe: string | null;
  minutos: number;
  dias: number;
}

/** Um ponto do uso de um aplicativo no tempo (hora ou dia). */
export interface PontoAppSerie {
  balde: string; // ISO
  minutos: number;
}

/** Uma linha da escala de expediente (um dia da semana de um alvo). */
export interface LinhaEscala {
  escopo: "EMPRESA" | "EQUIPE" | "PESSOA";
  equipeId: string | null;
  colaboradorId: string | null;
  /** isodow: 1 = segunda … 7 = domingo. */
  diaSemana: number;
  trabalha: boolean;
  inicio: string;
  fim: string;
  intervaloInicio: string | null;
  intervaloFim: string | null;
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

export interface CatalogoApps {
  linhas: LinhaCatalogoApp[];
  /** Quantos existem no total — a lista pode vir cortada pelo limite. */
  total: number;
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

/**
 * Índice cortado entre o horário contratado e a hora extra. Existe porque o
 * índice geral mistura os dois: quem varre e-mail às 22h contava igual a quem
 * faz o mesmo às 14h.
 */
export interface KpisEscala {
  /** Falso quando ninguém do recorte tem janela — o painel esconde o corte. */
  temJanela: boolean;
  minutosAtivosEscala: number;
  minutosProdutivosEscala: number;
  minutosNeutrosEscala: number;
  minutosImprodutivosEscala: number;
  indiceEscala: number | null;
  minutosAtivosExtra: number;
  minutosProdutivosExtra: number;
  indiceExtra: number | null;
  pessoasComExtra: number;
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
    titulo: "Diário por pessoa",
    descricao: "Uma linha por pessoa e por dia: escala, expediente, uso e índice.",
  },
  colaboradores: {
    titulo: "Consolidado por pessoa",
    descricao: "Uma linha por pessoa no período, com cobertura e fora da escala.",
  },
  equipes: {
    titulo: "Consolidado por equipe",
    descricao: "Uma linha por equipe: índice médio por pessoa e horas somadas.",
  },
  aplicativos: {
    titulo: "Aplicativos e sites",
    descricao: "Tempo de uso por aplicativo ou site, com a categoria efetiva.",
  },
};
