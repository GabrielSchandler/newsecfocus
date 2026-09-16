// ============================================================================
//  Camada de consultas.
//
//  Tudo passa pelas RPCs da migration 0006, que leem os agregados — nunca a
//  tabela crua de atividade. Cada função recebe o período fechado (início/fim)
//  e o escopo hierárquico (equipe → colaborador → dispositivo).
// ============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import { CORES_TIPO, PALETA_SERIES, rotuloDoBalde } from "./formato";
import { periodoAnterior } from "./periodos";
import type {
  CatalogoApps,
  Categoria,
  Colaborador,
  Dispositivo,
  EmpresaCliente,
  Equipe,
  Escopo,
  EventoEstacao,
  FatiaDistribuicao,
  LinhaDispersao,
  LinhaDominio,
  LinhaEvolucao,
  LinhaAppPessoa,
  LinhaEscala,
  LinhaPresenca,
  LinhaProdutividade,
  LinhaProdutividadeDia,
  LinhaPessoa,
  ContagemPessoas,
  FiltroAplicativos,
  LinhaAplicativo,
  ResumoAplicativos,
  LinhaJornada,
  JornadaDia,
  Sessao,
  Estacao,
  MinutosExpediente,
  PontoAppSerie,
  PontoProdutividade,
  PontoRitmo,
  SegmentoLinha,
  Kpis,
  KpisComparados,
  KpisEscala,
  LinhaCatalogoApp,
  LinhaHorasExtras,
  LinhaRankingColaborador,
  LinhaRankingEquipe,
  LinhaTempoReal,
  MapeamentoApp,
  Periodo,
  PontoSerie,
  Registro,
  UsuarioAcesso,
} from "./tipos";

// ----------------------------------------------------------------------------
//  Helpers
// ----------------------------------------------------------------------------

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const numOuNulo = (v: unknown): number | null => {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

function paramsEscopo(escopo: Escopo) {
  return {
    p_org: escopo.orgId,
    p_equipe: escopo.equipeId,
    p_colaborador: escopo.colaboradorId,
    p_dispositivo: escopo.dispositivoId,
  };
}



// ----------------------------------------------------------------------------
//  Cadastros
// ----------------------------------------------------------------------------

export async function buscarEquipes(
  supabase: SupabaseClient,
  orgId?: string | null,
): Promise<Equipe[]> {
  let consulta = supabase
    .from("teams")
    .select("id, nome, descricao, cor, ativa, employees(count)")
    .order("nome");

  // O RLS já limita a empresa cliente à própria. Para o master, que enxerga
  // todas, é este filtro que separa uma empresa da outra nos seletores.
  if (orgId) consulta = consulta.eq("org_id", orgId);

  const { data, error } = await consulta;
  if (error) throw error;

  return (data ?? []).map((t: any) => ({
    id: t.id,
    nome: t.nome,
    descricao: t.descricao,
    cor: t.cor,
    ativa: t.ativa,
    total_pessoas: t.employees?.[0]?.count ?? 0,
  }));
}

export async function buscarColaboradores(
  supabase: SupabaseClient,
  equipeId?: string | null,
  orgId?: string | null,
): Promise<Colaborador[]> {
  let consulta = supabase
    .from("employees")
    .select(
      "id, team_id, os_user, nome, cargo, email, ativo, jornada_minutos_dia, jornada_hora_inicio, jornada_hora_fim, perfil_completo, teams(nome)",
    )
    .order("nome", { nullsFirst: false });

  if (equipeId) consulta = consulta.eq("team_id", equipeId);
  if (orgId) consulta = consulta.eq("org_id", orgId);

  const { data, error } = await consulta;
  if (error) throw error;

  return (data ?? []).map((e: any) => ({
    id: e.id,
    team_id: e.team_id,
    equipe_nome: Array.isArray(e.teams) ? e.teams[0]?.nome : e.teams?.nome,
    os_user: e.os_user,
    nome: e.nome,
    cargo: e.cargo,
    email: e.email,
    ativo: e.ativo,
    jornada_minutos_dia: e.jornada_minutos_dia,
    jornada_hora_inicio: e.jornada_hora_inicio,
    jornada_hora_fim: e.jornada_hora_fim,
    perfil_completo: e.perfil_completo ?? false,
  }));
}

export async function buscarDispositivos(
  supabase: SupabaseClient,
  orgId?: string | null,
): Promise<Dispositivo[]> {
  let consulta = supabase
    .from("devices")
    .select("id, machine_name, os_user, status_online, last_sync_at, agent_version")
    .order("machine_name");

  if (orgId) consulta = consulta.eq("org_id", orgId);

  const { data, error } = await consulta;
  if (error) throw error;
  return (data ?? []) as Dispositivo[];
}

/**
 * Linha do tempo da estação: ligar, suspender, bloquear, desligar etc.
 *
 * Janela fixa (últimos N dias) de propósito: a tela de Dispositivos não carrega
 * o filtro global de período, e o diário é curto — o que interessa é "o que
 * aconteceu com as máquinas ultimamente".
 */
export async function buscarDiarioEstacao(
  supabase: SupabaseClient,
  orgId?: string | null,
  dias = 14,
  dispositivoId?: string | null,
): Promise<EventoEstacao[]> {
  const fim = new Date();
  const inicio = new Date(fim.getTime() - dias * 24 * 60 * 60 * 1000);

  const { data, error } = await supabase.rpc("painel_diario_estacao", {
    p_inicio: inicio.toISOString(),
    p_fim: fim.toISOString(),
    p_org: orgId ?? null,
    p_dispositivo: dispositivoId ?? null,
  });
  if (error) throw error;

  return (data ?? []).map((e: any) => ({
    id: Number(e.id),
    dispositivoId: e.device_id,
    maquina: e.machine_name,
    tipo: e.tipo,
    momento: e.momento,
    versao: e.versao ?? null,
  })) as EventoEstacao[];
}

/**
 * Linha do tempo do dia de UMA pessoa (ou estação): segmentos de estado
 * — produtivo/neutro/improdutivo/ocioso/bloqueado — para desenhar a faixa. Os
 * buracos entre segmentos são a máquina desligada e ficam por conta do desenho.
 */
export async function buscarLinhaDoTempo(
  supabase: SupabaseClient,
  periodo: Periodo,
  colaboradorId?: string | null,
  dispositivoId?: string | null,
): Promise<SegmentoLinha[]> {
  const { data, error } = await supabase.rpc("painel_linha_do_tempo", {
    p_inicio: periodo.inicio,
    p_fim: periodo.fim,
    p_colaborador: colaboradorId ?? null,
    p_dispositivo: dispositivoId ?? null,
  });
  if (error) throw error;
  return (data ?? []) as SegmentoLinha[];
}


/** Ritmo por hora do dia e dia da semana (curva + mapa de calor). */
export async function buscarRitmo(
  supabase: SupabaseClient,
  periodo: Periodo,
  escopo: Escopo,
): Promise<PontoRitmo[]> {
  const { data, error } = await supabase.rpc("painel_ritmo_horario", {
    p_inicio: periodo.inicio,
    p_fim: periodo.fim,
    p_org: escopo.orgId,
    p_equipe: escopo.equipeId,
    p_colaborador: escopo.colaboradorId,
  });
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    diaSemana: num(r.dia_semana),
    hora: num(r.hora),
    minutosAtivos: num(r.minutos_ativos),
    minutosProdutivos: num(r.minutos_produtivos),
    minutosRegistrados: num(r.minutos_registrados),
  })) as PontoRitmo[];
}



/** Dispersão por pessoa: trocas de aplicativo por hora ativa. */
export async function buscarDispersao(
  supabase: SupabaseClient,
  periodo: Periodo,
  escopo: Escopo,
): Promise<LinhaDispersao[]> {
  const { data, error } = await supabase.rpc("painel_dispersao", {
    p_inicio: periodo.inicio,
    p_fim: periodo.fim,
    p_org: escopo.orgId,
    p_equipe: escopo.equipeId,
    p_colaborador: escopo.colaboradorId,
  });
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    colaboradorId: r.colaborador_id,
    colaborador: r.colaborador,
    equipe: r.equipe,
    trocas: num(r.trocas),
    minutosAtivos: num(r.minutos_ativos),
    trocasPorHora: num(r.trocas_por_hora),
  })) as LinhaDispersao[];
}

/**
 * Estações usadas por um colaborador. Como cada máquina corporativa é de uso
 * exclusivo, isto costuma trazer uma estação só — é o que permitiu fundir a
 * antiga tela de Dispositivos dentro da Pessoa. Descobre os device_id pelos
 * resumos diários (poucas linhas, já agregadas) e busca os dados das estações.
 */
export async function buscarEstacoesColaborador(
  supabase: SupabaseClient,
  colaboradorId: string,
): Promise<Dispositivo[]> {
  const { data: resumos, error: erroResumo } = await supabase
    .from("resumo_diario")
    .select("device_id")
    .eq("employee_id", colaboradorId)
    .limit(500);
  if (erroResumo) throw erroResumo;

  const ids = [...new Set((resumos ?? []).map((r: any) => r.device_id))].filter(Boolean);
  if (ids.length === 0) return [];

  const { data, error } = await supabase
    .from("devices")
    .select("id, machine_name, os_user, status_online, last_sync_at, agent_version")
    .in("id", ids)
    .order("last_sync_at", { ascending: false, nullsFirst: false });
  if (error) throw error;
  return (data ?? []) as Dispositivo[];
}

/**
 * Produtividade contra o expediente, uma linha por pessoa. Recebe a janela
 * explícita (e não o Periodo) porque a mesma consulta serve para o período atual
 * e para a janela de comparação alinhada no relógio.
 */
export async function buscarProdutividade(
  supabase: SupabaseClient,
  janela: { inicio: string; fim: string },
  escopo: Escopo,
): Promise<LinhaProdutividade[]> {
  const { data, error } = await supabase.rpc("painel_produtividade", {
    p_inicio: janela.inicio,
    p_fim: janela.fim,
    p_org: escopo.orgId,
    p_equipe: escopo.equipeId,
    p_colaborador: escopo.colaboradorId,
  });
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    colaboradorId: r.colaborador_id,
    colaborador: r.colaborador,
    equipeId: r.equipe_id,
    equipe: r.equipe,
    minutos: mapearMinutos(r),
    diasComExpediente: num(r.dias_com_expediente),
    diasComRegistro: num(r.dias_com_registro),
    aproximado: !!r.aproximado,
    indice: numOuNulo(r.indice),
    cobertura: numOuNulo(r.aderencia),
  }));
}

/** As colunas minutos_* das RPCs de expediente viram um MinutosExpediente. */
function mapearMinutos(r: any): MinutosExpediente {
  return {
    expediente: num(r.minutos_expediente),
    registrados: num(r.minutos_registrados),
    ativos: num(r.minutos_ativos),
    produtivos: num(r.minutos_produtivos),
    neutros: num(r.minutos_neutros),
    improdutivos: num(r.minutos_improdutivos),
    semClassificar: num(r.minutos_sem_classificar),
    ociosos: num(r.minutos_ociosos),
    bloqueado: num(r.minutos_bloqueado),
    semDados: num(r.minutos_sem_dados),
    ativosFora: num(r.minutos_ativos_fora),
    sobrepostos: num(r.minutos_sobrepostos),
  };
}

const horaCurtaSql = (v: string | null) => (v ? String(v).slice(0, 5) : null);

/** A mesma medida por pessoa e por dia — base do relatório diário e do histórico. */
export async function buscarProdutividadeDiaria(
  supabase: SupabaseClient,
  janela: { inicio: string; fim: string },
  escopo: Escopo,
): Promise<LinhaProdutividadeDia[]> {
  const { data, error } = await supabase.rpc("painel_produtividade_diaria", {
    p_inicio: janela.inicio,
    p_fim: janela.fim,
    p_org: escopo.orgId,
    p_equipe: escopo.equipeId,
    p_colaborador: escopo.colaboradorId,
  });
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    colaboradorId: r.colaborador_id,
    colaborador: r.colaborador,
    equipeId: r.equipe_id,
    equipe: r.equipe,
    dia: String(r.dia).slice(0, 10),
    trabalha: !!r.trabalha,
    escalaInicio: horaCurtaSql(r.escala_inicio),
    escalaFim: horaCurtaSql(r.escala_fim),
    intervaloInicio: horaCurtaSql(r.intervalo_inicio),
    intervaloFim: horaCurtaSql(r.intervalo_fim),
    minutos: mapearMinutos(r),
    aproximado: !!r.aproximado,
    indice: numOuNulo(r.indice),
    cobertura: numOuNulo(r.cobertura),
  }));
}

/**
 * Índice do expediente balde a balde (migration 0035). Mesma régua do número
 * grande do topo: a função do banco chama painel_produtividade em cada janela.
 */
export async function buscarSerieProdutividade(
  supabase: SupabaseClient,
  janela: { inicio: string; fim: string },
  bucket: "day" | "week" | "month",
  escopo: Escopo,
): Promise<PontoProdutividade[]> {
  const { data, error } = await supabase.rpc("painel_produtividade_serie", {
    p_inicio: janela.inicio,
    p_fim: janela.fim,
    p_bucket: bucket,
    p_org: escopo.orgId,
    p_equipe: escopo.equipeId,
    p_colaborador: escopo.colaboradorId,
  });
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    balde: String(r.balde).slice(0, 10),
    pessoas: num(r.pessoas),
    indice: numOuNulo(r.indice_medio),
    cobertura: numOuNulo(r.aderencia_media),
  }));
}

/** Último dia antes de `dia` em que a empresa tem expediente (para o "vs ontem"). */
export async function buscarDiaExpedienteAnterior(
  supabase: SupabaseClient,
  orgId: string | null,
  dia: string,
): Promise<string | null> {
  const { data, error } = await supabase.rpc("dia_expediente_anterior", {
    p_org: orgId,
    p_dia: dia,
  });
  if (error) throw error;
  return (data as string | null) ?? null;
}

/** Todas as escalas da empresa (os três escopos), para a tela de configuração. */
export async function buscarEscalas(
  supabase: SupabaseClient,
  orgId?: string | null,
): Promise<LinhaEscala[]> {
  let consulta = supabase
    .from("escalas_expediente")
    .select("escopo, equipe_id, colaborador_id, dia_semana, trabalha, inicio, fim, intervalo_inicio, intervalo_fim")
    .order("dia_semana");
  if (orgId) consulta = consulta.eq("org_id", orgId);

  const { data, error } = await consulta;
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    escopo: r.escopo,
    equipeId: r.equipe_id,
    colaboradorId: r.colaborador_id,
    diaSemana: num(r.dia_semana),
    trabalha: !!r.trabalha,
    // O Postgres devolve time como "08:00:00"; a tela usa "08:00".
    inicio: String(r.inicio ?? "08:00").slice(0, 5),
    fim: String(r.fim ?? "18:00").slice(0, 5),
    intervaloInicio: r.intervalo_inicio ? String(r.intervalo_inicio).slice(0, 5) : null,
    intervaloFim: r.intervalo_fim ? String(r.intervalo_fim).slice(0, 5) : null,
  })) as LinhaEscala[];
}

/** Quem usa um aplicativo/site no recorte. */
export async function buscarAppPessoas(
  supabase: SupabaseClient,
  periodo: Periodo,
  alvo: string,
  escopo: Escopo,
): Promise<LinhaAppPessoa[]> {
  const { data, error } = await supabase.rpc("painel_app_pessoas", {
    p_inicio: periodo.inicio,
    p_fim: periodo.fim,
    p_alvo: alvo,
    p_org: escopo.orgId,
    p_equipe: escopo.equipeId,
    p_colaborador: escopo.colaboradorId,
  });
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    colaboradorId: r.colaborador_id,
    colaborador: r.colaborador,
    equipeId: r.equipe_id,
    equipe: r.equipe,
    minutos: num(r.minutos),
    dias: num(r.dias),
  })) as LinhaAppPessoa[];
}

/**
 * Uso do aplicativo no tempo. Com o filtro de um dia, a série sai por HORA;
 * nos demais períodos, por dia — que é o que o gestor pediu ao clicar no app.
 */
export async function buscarAppSerie(
  supabase: SupabaseClient,
  periodo: Periodo,
  alvo: string,
  escopo: Escopo,
): Promise<PontoAppSerie[]> {
  const { data, error } = await supabase.rpc("painel_app_serie", {
    p_inicio: periodo.inicio,
    p_fim: periodo.fim,
    p_alvo: alvo,
    p_por_hora: periodo.preset === "dia",
    p_org: escopo.orgId,
    p_equipe: escopo.equipeId,
    p_colaborador: escopo.colaboradorId,
  });
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    balde: r.balde,
    minutos: num(r.minutos),
  })) as PontoAppSerie[];
}

export async function buscarUsuariosAcesso(
  supabase: SupabaseClient,
  orgId?: string | null,
): Promise<UsuarioAcesso[]> {
  let consulta = supabase
    .from("profiles")
    .select("id, full_name, role, team_id, ativo, teams(nome)")
    .order("full_name", { nullsFirst: false });

  if (orgId) consulta = consulta.eq("org_id", orgId);

  const { data, error } = await consulta;
  if (error) throw error;

  return (data ?? []).map((p: any) => {
    const equipe = Array.isArray(p.teams) ? p.teams[0] : p.teams;
    return {
      id: p.id,
      nome: p.full_name,
      // O e-mail vive em auth.users, que o painel não lê: mostramos o que há.
      email: null,
      papel: p.role,
      equipeId: p.team_id,
      equipeNome: equipe?.nome ?? null,
      ativo: p.ativo ?? true,
    };
  });
}

export async function buscarCategorias(
  supabase: SupabaseClient,
  orgId?: string | null,
): Promise<Categoria[]> {
  let consulta = supabase
    .from("productivity_categories")
    .select("id, name, type, color")
    .order("name");

  if (orgId) consulta = consulta.eq("org_id", orgId);

  const { data, error } = await consulta;
  if (error) throw error;
  return (data ?? []) as Categoria[];
}

export async function buscarMapeamentos(
  supabase: SupabaseClient,
  orgId?: string | null,
): Promise<MapeamentoApp[]> {
  let consulta = supabase
    .from("app_mappings")
    .select("id, process_name, domain, category_id, productivity_categories(name, type)")
    .order("process_name", { nullsFirst: false });

  if (orgId) consulta = consulta.eq("org_id", orgId);

  const { data, error } = await consulta;
  if (error) throw error;

  return (data ?? []).map((m: any) => {
    const cat = Array.isArray(m.productivity_categories)
      ? m.productivity_categories[0]
      : m.productivity_categories;
    return {
      id: m.id,
      process_name: m.process_name,
      domain: m.domain,
      category_id: m.category_id,
      categoria_nome: cat?.name ?? null,
      categoria_tipo: cat?.type ?? null,
    };
  });
}

export async function buscarCatalogoApps(
  supabase: SupabaseClient,
  orgId?: string | null,
  limite = 300,
): Promise<CatalogoApps> {
  const { data, error } = await supabase.rpc("painel_catalogo_apps", {
    p_org: orgId ?? null,
    p_limite: limite,
  });
  if (error) throw error;

  const linhas = (data ?? []).map((r: any) => ({
    alvo: r.alvo,
    ehProcesso: !!r.eh_processo,
    mapeamentoId: r.mapeamento_id,
    categoryId: r.category_id,
    categoriaNome: r.categoria_nome,
    categoriaTipo: r.categoria_tipo,
    primeiroVisto: r.primeiro_visto,
    ultimoVisto: r.ultimo_visto,
    minutosTotais: num(r.minutos_totais),
  })) as LinhaCatalogoApp[];

  // O total vem repetido em toda linha (count over) — uma consulta só.
  return { linhas, total: num((data ?? [])[0]?.total) };
}

export const CATALOGO_VAZIO: CatalogoApps = { linhas: [], total: 0 };

// ----------------------------------------------------------------------------
//  KPIs
// ----------------------------------------------------------------------------






// ----------------------------------------------------------------------------
//  Série temporal
// ----------------------------------------------------------------------------

export async function buscarSerie(
  supabase: SupabaseClient,
  periodo: Periodo,
  escopo: Escopo,
  fuso: string,
): Promise<PontoSerie[]> {
  const { data, error } = await supabase.rpc("painel_serie", {
    p_inicio: periodo.inicio,
    p_fim: periodo.fim,
    p_bucket: periodo.bucket,
    ...paramsEscopo(escopo),
  });

  if (error) throw error;

  return (data ?? []).map((r: any) => ({
    balde: r.balde,
    rotulo: rotuloDoBalde(r.balde, periodo.bucket, fuso),
    ativo: num(r.minutos_ativos),
    ocioso: num(r.minutos_ociosos),
    produtivo: num(r.minutos_produtivos),
    neutro: num(r.minutos_neutros),
    improdutivo: num(r.minutos_improdutivos),
    indice: numOuNulo(r.indice),
  }));
}

// ----------------------------------------------------------------------------
//  Distribuição por aplicativo / site
// ----------------------------------------------------------------------------


// ----------------------------------------------------------------------------
//  Rankings
// ----------------------------------------------------------------------------



// ----------------------------------------------------------------------------
//  Horas extras — atividade fora da janela de jornada esperada
// ----------------------------------------------------------------------------


// ----------------------------------------------------------------------------
//  Tempo real
// ----------------------------------------------------------------------------

export async function buscarTempoReal(
  supabase: SupabaseClient,
  orgId: string | null = null,
): Promise<LinhaTempoReal[]> {
  const { data, error } = await supabase.rpc("painel_tempo_real", { p_org: orgId });
  if (error) throw error;

  return (data ?? []).map((r: any) => {
    let status: LinhaTempoReal["status"] = "offline";
    if (r.status_online) status = r.is_idle || r.is_locked ? "ocioso" : "ativo";

    return {
      colaboradorId: r.colaborador_id,
      colaborador: r.colaborador,
      equipe: r.equipe ?? "Sem equipe",
      maquina: r.machine_name,
      processo: r.process_name ?? "—",
      dominio: r.domain,
      tituloJanela: r.window_title ?? "",
      momento: r.momento,
      teclas: num(r.teclas),
      cliques: num(r.cliques),
      rolagens: num(r.rolagens),
      status,
    };
  });
}

// ----------------------------------------------------------------------------
//  Registros brutos — a atividade minuto a minuto por trás do consolidado
// ----------------------------------------------------------------------------

export interface PaginaRegistros {
  linhas: Registro[];
  total: number;
}

export async function buscarRegistros(
  supabase: SupabaseClient,
  periodo: Periodo,
  escopo: Escopo,
  opcoes: { estado?: string | null; busca?: string | null; limite?: number; pagina?: number } = {},
): Promise<PaginaRegistros> {
  const limite = opcoes.limite ?? 100;
  const pagina = Math.max(1, opcoes.pagina ?? 1);

  const { data, error } = await supabase.rpc("painel_registros", {
    p_inicio: periodo.inicio,
    p_fim: periodo.fim,
    p_org: escopo.orgId,
    p_colaborador: escopo.colaboradorId,
    p_dispositivo: escopo.dispositivoId,
    p_equipe: escopo.equipeId,
    p_estado: opcoes.estado ?? null,
    p_busca: opcoes.busca ?? null,
    p_limite: limite,
    p_deslocamento: (pagina - 1) * limite,
  });

  if (error) throw error;

  const linhas = (data ?? []).map((r: any) => ({
    momento: r.momento,
    colaborador: r.colaborador,
    equipe: r.equipe ?? "Sem equipe",
    maquina: r.maquina,
    processo: r.processo ?? "—",
    dominio: r.dominio,
    titulo: r.titulo ?? "",
    estado: r.estado,
    teclas: num(r.teclas),
    cliques: num(r.cliques),
    rolagens: num(r.rolagens),
    segundosAtivos: num(r.segundos_ativos),
  })) as Registro[];

  // O total vem repetido em toda linha (count over) — uma consulta só.
  return { linhas, total: num((data ?? [])[0]?.total) };
}

// ----------------------------------------------------------------------------
//  Relatórios (linhas cruas — a formatação fica no exportador)
// ----------------------------------------------------------------------------



// ----------------------------------------------------------------------------
//  Plataforma (revenda)
// ----------------------------------------------------------------------------

export async function buscarEmpresasClientes(
  supabase: SupabaseClient,
): Promise<EmpresaCliente[]> {
  const { data, error } = await supabase.rpc("plataforma_empresas");
  if (error) throw error;

  return (data ?? []).map((r: any) => ({
    id: r.id,
    nome: r.nome,
    slug: r.slug,
    status: r.status,
    plano: r.plano,
    maxDispositivos: num(r.max_dispositivos),
    dispositivos: num(r.dispositivos),
    dispositivosOnline: num(r.dispositivos_online),
    usuarios: num(r.usuarios),
    ultimaSincronizacao: r.ultima_sincronizacao,
    criadaEm: r.criada_em,
  }));
}

// ----------------------------------------------------------------------------
//  Telas do redesenho (migration 0037) — paginação e filtros no banco
// ----------------------------------------------------------------------------

export type OrdemPessoas = "nome" | "equipe" | "indice" | "ativos" | "cobertura" | "ultimo";
export type SituacaoPessoas = "todas" | "com_registro" | "sem_registro" | "pendente" | "inativas";

export interface PaginaPessoas {
  linhas: LinhaPessoa[];
  total: number;
}

export async function buscarPessoasLista(
  supabase: SupabaseClient,
  janela: { inicio: string; fim: string },
  escopo: Escopo,
  opcoes: {
    busca?: string | null;
    situacao?: SituacaoPessoas;
    ordem?: OrdemPessoas;
    decrescente?: boolean;
    limite?: number;
    pagina?: number;
  } = {},
): Promise<PaginaPessoas> {
  const limite = opcoes.limite ?? 25;
  const pagina = Math.max(1, opcoes.pagina ?? 1);
  const { data, error } = await supabase.rpc("painel_pessoas_lista", {
    p_inicio: janela.inicio,
    p_fim: janela.fim,
    p_org: escopo.orgId,
    p_equipe: escopo.equipeId,
    p_busca: opcoes.busca || null,
    p_situacao: opcoes.situacao ?? "todas",
    p_ordem: opcoes.ordem ?? "nome",
    p_decrescente: !!opcoes.decrescente,
    p_limite: limite,
    p_deslocamento: (pagina - 1) * limite,
  });
  if (error) throw error;
  const linhas = (data ?? []).map((r: any) => ({
    colaboradorId: r.colaborador_id,
    nome: r.nome,
    osUser: r.os_user,
    cargo: r.cargo,
    email: r.email,
    equipeId: r.equipe_id,
    equipe: r.equipe,
    ativo: !!r.ativo,
    perfilCompleto: !!r.perfil_completo,
    minutosExpediente: numOuNulo(r.minutos_expediente),
    minutosAtivos: numOuNulo(r.minutos_ativos),
    minutosAtivosFora: numOuNulo(r.minutos_ativos_fora),
    indice: numOuNulo(r.indice),
    cobertura: numOuNulo(r.cobertura),
    aproximado: !!r.aproximado,
    ultimoRegistro: r.ultimo_registro ?? null,
  })) as LinhaPessoa[];
  return { linhas, total: num((data ?? [])[0]?.total) };
}

export async function buscarPessoasContagem(
  supabase: SupabaseClient,
  janela: { inicio: string; fim: string },
  escopo: Escopo,
): Promise<ContagemPessoas> {
  const { data, error } = await supabase.rpc("painel_pessoas_contagem", {
    p_inicio: janela.inicio,
    p_fim: janela.fim,
    p_org: escopo.orgId,
    p_equipe: escopo.equipeId,
  });
  if (error) throw error;
  const r = (Array.isArray(data) ? data[0] : data) ?? {};
  return {
    cadastradas: num(r.cadastradas),
    comRegistro: num(r.com_registro),
    semRegistro: num(r.sem_registro),
    pendentes: num(r.pendentes),
    semEquipe: num(r.sem_equipe),
    inativas: num(r.inativas),
  };
}

export interface PaginaAplicativos {
  linhas: LinhaAplicativo[];
  total: number;
}

export async function buscarAplicativosLista(
  supabase: SupabaseClient,
  periodo: { inicio: string; fim: string },
  escopo: Escopo,
  opcoes: { filtro?: FiltroAplicativos; busca?: string | null; limite?: number; pagina?: number } = {},
): Promise<PaginaAplicativos> {
  const limite = opcoes.limite ?? 25;
  const pagina = Math.max(1, opcoes.pagina ?? 1);
  const { data, error } = await supabase.rpc("painel_aplicativos_lista", {
    p_inicio: periodo.inicio,
    p_fim: periodo.fim,
    p_org: escopo.orgId,
    p_equipe: escopo.equipeId,
    p_colaborador: escopo.colaboradorId,
    p_filtro: opcoes.filtro ?? "todos",
    p_busca: opcoes.busca || null,
    p_limite: limite,
    p_deslocamento: (pagina - 1) * limite,
  });
  if (error) throw error;
  const linhas = (data ?? []).map((r: any) => ({
    alvo: r.alvo,
    ehSite: !!r.eh_site,
    tipo: r.tipo ?? null,
    mapeamentoId: r.mapeamento_id ?? null,
    categoriaId: r.categoria_id ?? null,
    categoriaNome: r.categoria_nome ?? null,
    regraPor: r.regra_por ?? null,
    minutos: num(r.minutos),
    pessoas: num(r.pessoas),
    dias: num(r.dias),
  })) as LinhaAplicativo[];
  return { linhas, total: num((data ?? [])[0]?.total) };
}

export async function buscarAplicativosResumo(
  supabase: SupabaseClient,
  periodo: { inicio: string; fim: string },
  escopo: Escopo,
): Promise<ResumoAplicativos> {
  const { data, error } = await supabase.rpc("painel_aplicativos_resumo", {
    p_inicio: periodo.inicio,
    p_fim: periodo.fim,
    p_org: escopo.orgId,
    p_equipe: escopo.equipeId,
    p_colaborador: escopo.colaboradorId,
  });
  if (error) throw error;
  const r = (Array.isArray(data) ? data[0] : data) ?? {};
  return {
    identificados: num(r.identificados),
    classificados: num(r.classificados),
    semClassificacao: num(r.sem_classificacao),
    aplicativos: num(r.aplicativos),
    sites: num(r.sites),
    qtdPorTipo: {
      PRODUCTIVE: num(r.qtd_produtivo),
      NEUTRAL: num(r.qtd_neutro),
      UNPRODUCTIVE: num(r.qtd_improdutivo),
    },
    minutosTotal: num(r.minutos_total),
    minutosPorTipo: {
      PRODUCTIVE: num(r.minutos_produtivo),
      NEUTRAL: num(r.minutos_neutro),
      UNPRODUCTIVE: num(r.minutos_improdutivo),
      SEM: num(r.minutos_sem),
    },
  };
}

export async function buscarJornadaPessoas(
  supabase: SupabaseClient,
  janela: { inicio: string; fim: string },
  escopo: Escopo,
): Promise<LinhaJornada[]> {
  const { data, error } = await supabase.rpc("painel_jornada_pessoas", {
    p_inicio: janela.inicio,
    p_fim: janela.fim,
    p_org: escopo.orgId,
    p_equipe: escopo.equipeId,
    p_colaborador: escopo.colaboradorId,
  });
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    colaboradorId: r.colaborador_id,
    colaborador: r.colaborador,
    equipeId: r.equipe_id,
    equipe: r.equipe,
    escala: r.escala,
    diasComExpediente: num(r.dias_com_expediente),
    diasComRegistro: num(r.dias_com_registro),
    minutosExpediente: num(r.minutos_expediente),
    minutosRegistrados: num(r.minutos_registrados),
    minutosAtivosFora: num(r.minutos_ativos_fora),
    cobertura: numOuNulo(r.cobertura),
    primeiroRegistroMedio: numOuNulo(r.primeiro_registro_medio),
    ultimoRegistroMedio: numOuNulo(r.ultimo_registro_medio),
    horariosPorBloco: !!r.horarios_por_bloco,
    aproximado: !!r.aproximado,
  }));
}

export async function buscarJornadaDia(
  supabase: SupabaseClient,
  dia: string,
  escopo: Escopo,
): Promise<JornadaDia[]> {
  const { data, error } = await supabase.rpc("painel_jornada_dia", {
    p_dia: dia,
    p_org: escopo.orgId,
    p_equipe: escopo.equipeId,
    p_colaborador: escopo.colaboradorId,
  });
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    colaboradorId: r.colaborador_id,
    colaborador: r.colaborador,
    equipe: r.equipe,
    trabalha: !!r.trabalha,
    escalaInicio: horaCurtaSql(r.escala_inicio),
    escalaFim: horaCurtaSql(r.escala_fim),
    intervaloInicio: horaCurtaSql(r.intervalo_inicio),
    intervaloFim: horaCurtaSql(r.intervalo_fim),
    minutosExpediente: num(r.minutos_expediente),
    minutosRegistrados: num(r.minutos_registrados),
    minutosAtivosFora: num(r.minutos_ativos_fora),
    primeiroRegistro: r.primeiro_registro ?? null,
    ultimoRegistro: r.ultimo_registro ?? null,
    blocos: (r.blocos ?? []).map((b: any[]) => [num(b[0]), num(b[1]), num(b[2])]),
  }));
}

export async function buscarSessoes(
  supabase: SupabaseClient,
  colaboradorId: string,
  janela: { inicio: string; fim: string },
  dispositivoId?: string | null,
): Promise<Sessao[]> {
  const { data, error } = await supabase.rpc("painel_sessoes", {
    p_colaborador: colaboradorId,
    p_inicio: janela.inicio,
    p_fim: janela.fim,
    p_dispositivo: dispositivoId ?? null,
  });
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    inicio: r.inicio,
    fim: r.fim,
    alvo: r.alvo,
    tipo: r.tipo ?? null,
    estado: r.estado,
    minutos: num(r.minutos),
    maquina: r.maquina ?? null,
  }));
}

export async function buscarEstacoes(
  supabase: SupabaseClient,
  orgId: string | null,
): Promise<Estacao[]> {
  const { data, error } = await supabase.rpc("painel_estacoes", { p_org: orgId });
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    id: r.dispositivo_id,
    maquina: r.maquina,
    usuarioWindows: r.usuario_windows ?? null,
    versao: r.versao ?? null,
    ultimoEnvio: r.ultimo_envio ?? null,
    ultimoRegistro: r.ultimo_registro ?? null,
    minutosSemEnvio: numOuNulo(r.minutos_sem_envio),
    limiarMinutos: num(r.limiar_minutos),
    situacao: r.situacao,
    colaboradorId: r.colaborador_id ?? null,
    colaborador: r.colaborador ?? null,
    equipeId: r.equipe_id ?? null,
    equipe: r.equipe ?? null,
    emExpedienteAgora: !!r.em_expediente_agora,
  }));
}

/** Quando os resumos foram atualizados pela última vez (consolidação). */
export async function buscarUltimaConsolidacao(supabase: SupabaseClient): Promise<string | null> {
  const { data, error } = await supabase.from("estado_consolidacao").select("executado_em").maybeSingle();
  if (error) throw error;
  return (data as { executado_em?: string } | null)?.executado_em ?? null;
}
