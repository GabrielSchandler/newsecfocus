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
  Categoria,
  Colaborador,
  Dispositivo,
  EmpresaCliente,
  Equipe,
  Escopo,
  FatiaDistribuicao,
  Kpis,
  KpisComparados,
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

/** Variação percentual entre dois valores. NULL quando não há base de comparação. */
function variacao(atual: number, anterior: number): number | null {
  if (!anterior) return null;
  return Number((((atual - anterior) / anterior) * 100).toFixed(1));
}

export const KPIS_VAZIOS: Kpis = {
  minutosRegistrados: 0,
  minutosAtivos: 0,
  minutosOciosos: 0,
  minutosBloqueado: 0,
  minutosProdutivos: 0,
  minutosNeutros: 0,
  minutosImprodutivos: 0,
  minutosSemClassificar: 0,
  teclas: 0,
  cliques: 0,
  rolagens: 0,
  indice: null,
  colaboradores: 0,
  dispositivos: 0,
  diasComRegistro: 0,
  topAplicacao: null,
  jornadaEsperada: 0,
};

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
    .select("id, team_id, os_user, nome, cargo, email, ativo, jornada_minutos_dia, teams(nome)")
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

// ----------------------------------------------------------------------------
//  KPIs
// ----------------------------------------------------------------------------

function mapearKpis(linha: any): Kpis {
  return {
    minutosRegistrados: num(linha?.minutos_registrados),
    minutosAtivos: num(linha?.minutos_ativos),
    minutosOciosos: num(linha?.minutos_ociosos),
    minutosBloqueado: num(linha?.minutos_bloqueado),
    minutosProdutivos: num(linha?.minutos_produtivos),
    minutosNeutros: num(linha?.minutos_neutros),
    minutosImprodutivos: num(linha?.minutos_improdutivos),
    minutosSemClassificar: num(linha?.minutos_sem_classificar),
    teclas: num(linha?.teclas),
    cliques: num(linha?.cliques),
    rolagens: num(linha?.rolagens),
    indice: numOuNulo(linha?.indice),
    colaboradores: num(linha?.colaboradores),
    dispositivos: num(linha?.dispositivos),
    diasComRegistro: num(linha?.dias_com_registro),
    topAplicacao: linha?.top_aplicacao ?? null,
    jornadaEsperada: num(linha?.jornada_esperada),
  };
}

export async function buscarKpis(
  supabase: SupabaseClient,
  periodo: Periodo,
  escopo: Escopo,
): Promise<Kpis> {
  const { data, error } = await supabase.rpc("painel_kpis", {
    p_inicio: periodo.inicio,
    p_fim: periodo.fim,
    ...paramsEscopo(escopo),
  });

  if (error) throw error;
  return mapearKpis(Array.isArray(data) ? data[0] : data);
}

/**
 * KPIs do período com o período anterior de mesma duração ao lado.
 * É o que sustenta o "+12% vs. período anterior" — na primeira versão esse
 * número era uma constante zero no código.
 */
export async function buscarKpisComparados(
  supabase: SupabaseClient,
  periodo: Periodo,
  escopo: Escopo,
  fuso: string,
): Promise<KpisComparados> {
  const anterior = periodoAnterior(periodo, fuso);

  const [atual, passado] = await Promise.all([
    buscarKpis(supabase, periodo, escopo),
    buscarKpis(supabase, anterior, escopo),
  ]);

  return {
    atual,
    anterior: passado,
    variacao: {
      minutosAtivos: variacao(atual.minutosAtivos, passado.minutosAtivos),
      minutosProdutivos: variacao(atual.minutosProdutivos, passado.minutosProdutivos),
      interacoes: variacao(
        atual.teclas + atual.cliques,
        passado.teclas + passado.cliques,
      ),
      indice:
        atual.indice !== null && passado.indice !== null
          ? Number((atual.indice - passado.indice).toFixed(1))
          : null,
    },
  };
}

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

export async function buscarDistribuicao(
  supabase: SupabaseClient,
  periodo: Periodo,
  escopo: Escopo,
  limite = 10,
): Promise<FatiaDistribuicao[]> {
  const { data, error } = await supabase.rpc("painel_distribuicao", {
    p_inicio: periodo.inicio,
    p_fim: periodo.fim,
    p_org: escopo.orgId,
    p_equipe: escopo.equipeId,
    p_colaborador: escopo.colaboradorId,
    p_limite: limite,
  });

  if (error) throw error;

  return (data ?? []).map((r: any, i: number) => ({
    nome: r.alvo ?? "—",
    tipo: r.tipo ?? null,
    minutos: num(r.minutos),
    pessoas: num(r.pessoas),
    cor: r.tipo ? CORES_TIPO[r.tipo] : PALETA_SERIES[i % PALETA_SERIES.length],
  }));
}

// ----------------------------------------------------------------------------
//  Rankings
// ----------------------------------------------------------------------------

export async function buscarRankingEquipes(
  supabase: SupabaseClient,
  periodo: Periodo,
  orgId: string | null = null,
): Promise<LinhaRankingEquipe[]> {
  const { data, error } = await supabase.rpc("painel_ranking_equipes", {
    p_inicio: periodo.inicio,
    p_fim: periodo.fim,
    p_org: orgId,
  });

  if (error) throw error;

  return (data ?? []).map((r: any) => ({
    equipeId: r.equipe_id,
    equipe: r.equipe,
    cor: r.cor,
    pessoas: num(r.pessoas),
    minutosAtivos: num(r.minutos_ativos),
    minutosOciosos: num(r.minutos_ociosos),
    minutosProdutivos: num(r.minutos_produtivos),
    minutosNeutros: num(r.minutos_neutros),
    minutosImprodutivos: num(r.minutos_improdutivos),
    indice: numOuNulo(r.indice),
    aderencia: numOuNulo(r.aderencia),
  }));
}

export async function buscarRankingColaboradores(
  supabase: SupabaseClient,
  periodo: Periodo,
  equipeId: string | null = null,
  limite = 100,
  orgId: string | null = null,
): Promise<LinhaRankingColaborador[]> {
  const { data, error } = await supabase.rpc("painel_ranking_colaboradores", {
    p_inicio: periodo.inicio,
    p_fim: periodo.fim,
    p_equipe: equipeId,
    p_limite: limite,
    p_org: orgId,
  });

  if (error) throw error;

  return (data ?? []).map((r: any) => ({
    colaboradorId: r.colaborador_id,
    colaborador: r.colaborador,
    cargo: r.cargo,
    equipeId: r.equipe_id,
    equipe: r.equipe,
    diasComRegistro: num(r.dias_com_registro),
    minutosAtivos: num(r.minutos_ativos),
    minutosOciosos: num(r.minutos_ociosos),
    minutosProdutivos: num(r.minutos_produtivos),
    minutosNeutros: num(r.minutos_neutros),
    minutosImprodutivos: num(r.minutos_improdutivos),
    teclas: num(r.teclas),
    cliques: num(r.cliques),
    indice: numOuNulo(r.indice),
    aderencia: numOuNulo(r.aderencia),
  }));
}

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

export async function buscarRelatorioDiario(
  supabase: SupabaseClient,
  periodo: Periodo,
  escopo: Escopo,
) {
  const { data, error } = await supabase.rpc("painel_relatorio_diario", {
    p_inicio: periodo.inicio,
    p_fim: periodo.fim,
    p_org: escopo.orgId,
    p_equipe: escopo.equipeId,
    p_colaborador: escopo.colaboradorId,
  });
  if (error) throw error;
  return data ?? [];
}

export async function buscarRelatorioAplicativos(
  supabase: SupabaseClient,
  periodo: Periodo,
  escopo: Escopo,
) {
  const { data, error } = await supabase.rpc("painel_relatorio_aplicativos", {
    p_inicio: periodo.inicio,
    p_fim: periodo.fim,
    p_org: escopo.orgId,
    p_equipe: escopo.equipeId,
    p_colaborador: escopo.colaboradorId,
  });
  if (error) throw error;
  return data ?? [];
}

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
