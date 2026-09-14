-- ============================================================================
--  0026 — Evolução, Domínios/sites e Dispersão
--
--  Três indicadores novos, cada um da fonte mais barata que serve:
--    • Evolução: resumo_diario, comparando o período com o período anterior de
--      mesma duração (quem subiu, quem caiu de produtividade).
--    • Domínios: resumo_app_diario, só os alvos que são site (têm ponto e não
--      terminam em .exe) — as ferramentas web mais usadas.
--    • Dispersão: activity_logs, trocas de aplicativo por hora ativa (proxy de
--      foco x dispersão).
--
--  Sem SECURITY DEFINER: a RLS de cada tabela vale para o usuário.
-- ============================================================================

-- ----------------------------------------------------------------------------
--  Evolução vs. período anterior
-- ----------------------------------------------------------------------------
create or replace function painel_evolucao(
    p_inicio      timestamptz,
    p_fim         timestamptz,
    p_org         uuid default null,
    p_equipe      uuid default null,
    p_colaborador uuid default null
)
returns table (
    colaborador_id       uuid,
    colaborador          text,
    equipe               text,
    indice_atual         numeric,
    indice_anterior      numeric,
    minutos_ativos_atual   bigint,
    minutos_ativos_anterior bigint,
    dias_atual           int,
    dias_anterior        int
)
language sql
stable
as $$
    with a as (select org_em_foco(p_org) as org_id, fuso_da_org(p_org) as fuso),
    lim as (
        select
            (p_inicio at time zone a.fuso)::date as at_ini,
            ((p_fim - interval '1 second') at time zone a.fuso)::date as at_fim,
            ((p_inicio - (p_fim - p_inicio)) at time zone a.fuso)::date as an_ini,
            ((p_inicio - interval '1 second') at time zone a.fuso)::date as an_fim
          from a
    ),
    base as (
        select r.employee_id,
               sum(r.minutos_produtivos)  filter (where r.dia between l.at_ini and l.at_fim) as prod_at,
               sum(r.minutos_neutros)     filter (where r.dia between l.at_ini and l.at_fim) as neu_at,
               sum(r.minutos_improdutivos) filter (where r.dia between l.at_ini and l.at_fim) as imp_at,
               sum(r.minutos_ativos)      filter (where r.dia between l.at_ini and l.at_fim) as atv_at,
               count(distinct r.dia)      filter (where r.dia between l.at_ini and l.at_fim
                                                    and r.minutos_registrados > 0) as dias_at,
               sum(r.minutos_produtivos)  filter (where r.dia between l.an_ini and l.an_fim) as prod_an,
               sum(r.minutos_neutros)     filter (where r.dia between l.an_ini and l.an_fim) as neu_an,
               sum(r.minutos_improdutivos) filter (where r.dia between l.an_ini and l.an_fim) as imp_an,
               sum(r.minutos_ativos)      filter (where r.dia between l.an_ini and l.an_fim) as atv_an,
               count(distinct r.dia)      filter (where r.dia between l.an_ini and l.an_fim
                                                    and r.minutos_registrados > 0) as dias_an
          from resumo_diario r
          cross join a
          cross join lim l
         where r.org_id = a.org_id
           and r.dia between l.an_ini and l.at_fim
         group by r.employee_id
    )
    select
        e.id,
        coalesce(e.nome, e.os_user),
        t.nome,
        calcular_indice(coalesce(b.prod_at,0)::bigint, coalesce(b.neu_at,0)::bigint, coalesce(b.imp_at,0)::bigint),
        calcular_indice(coalesce(b.prod_an,0)::bigint, coalesce(b.neu_an,0)::bigint, coalesce(b.imp_an,0)::bigint),
        coalesce(b.atv_at, 0)::bigint,
        coalesce(b.atv_an, 0)::bigint,
        coalesce(b.dias_at, 0)::int,
        coalesce(b.dias_an, 0)::int
      from base b
      join employees e on e.id = b.employee_id
      left join teams t on t.id = e.team_id
     where (p_equipe is null or e.team_id = p_equipe)
       and (p_colaborador is null or e.id = p_colaborador)
       and coalesce(b.atv_at, 0) + coalesce(b.atv_an, 0) > 0;
$$;

comment on function painel_evolucao is
    'Produtividade da pessoa no período contra o período anterior de mesma duração. O painel ordena por variação de índice para mostrar quem subiu e quem caiu.';

-- ----------------------------------------------------------------------------
--  Domínios / sites mais usados
-- ----------------------------------------------------------------------------
create or replace function painel_dominios(
    p_inicio      timestamptz,
    p_fim         timestamptz,
    p_org         uuid default null,
    p_equipe      uuid default null,
    p_colaborador uuid default null,
    p_limite      int  default 20
)
returns table (
    dominio text,
    tipo    categoria_produtividade,
    minutos bigint,
    pessoas bigint
)
language sql
stable
as $$
    with a as (select org_em_foco(p_org) as org_id, fuso_da_org(p_org) as fuso)
    select
        r.alvo,
        max(r.tipo)::categoria_produtividade,
        sum(r.minutos)::bigint,
        count(distinct r.employee_id)::bigint
      from resumo_app_diario r
      cross join a
      join employees e on e.id = r.employee_id
     where r.org_id = a.org_id
       and r.dia between (p_inicio at time zone a.fuso)::date
                     and ((p_fim - interval '1 second') at time zone a.fuso)::date
       -- Só sites: têm ponto e não terminam em .exe (processos de app).
       and r.alvo like '%.%'
       and r.alvo not ilike '%.exe'
       and (p_equipe is null or e.team_id = p_equipe)
       and (p_colaborador is null or e.id = p_colaborador)
     group by r.alvo
     order by sum(r.minutos) desc
     limit greatest(1, least(p_limite, 100));
$$;

comment on function painel_dominios is
    'Sites mais usados (domínios) no recorte, de resumo_app_diario. Distingue site de aplicativo pela heurística: site tem ponto e não termina em .exe.';

-- ----------------------------------------------------------------------------
--  Dispersão — trocas de aplicativo por hora ativa
-- ----------------------------------------------------------------------------
create or replace function painel_dispersao(
    p_inicio      timestamptz,
    p_fim         timestamptz,
    p_org         uuid default null,
    p_equipe      uuid default null,
    p_colaborador uuid default null
)
returns table (
    colaborador_id  uuid,
    colaborador     text,
    equipe          text,
    trocas          bigint,
    minutos_ativos  bigint,
    trocas_por_hora numeric
)
language sql
stable
as $$
    with a as (select org_em_foco(p_org) as org_id, fuso_da_org(p_org) as fuso),
    seq as (
        select
            l.employee_id,
            l.process_name,
            l."timestamp" as ts,
            lag(l.process_name) over (partition by l.employee_id order by l."timestamp") as ant,
            lag(l."timestamp")  over (partition by l.employee_id order by l."timestamp") as ant_ts
          from activity_logs l
          cross join a
          join employees e on e.id = l.employee_id
         where l.org_id = a.org_id
           and l."timestamp" >= p_inicio
           and l."timestamp" <  p_fim
           and l.employee_id is not null
           and not l.is_idle
           and not l.is_locked
           and (p_equipe is null or e.team_id = p_equipe)
           and (p_colaborador is null or e.id = p_colaborador)
    ),
    agg as (
        select
            employee_id,
            count(*)::bigint as minutos_ativos,
            count(*) filter (
                where ant is not null
                  and process_name is distinct from ant
                  and ts - ant_ts <= interval '1 minute'
            )::bigint as trocas
          from seq
         group by employee_id
    )
    select
        e.id,
        coalesce(e.nome, e.os_user),
        t.nome,
        g.trocas,
        g.minutos_ativos,
        case when g.minutos_ativos > 0
             then round((g.trocas::numeric * 60) / g.minutos_ativos, 1)
             else 0 end
      from agg g
      join employees e on e.id = g.employee_id
      left join teams t on t.id = e.team_id
     where g.minutos_ativos >= 10   -- pouca amostra vira ruído
     order by (g.trocas::numeric * 60) / nullif(g.minutos_ativos, 0) desc nulls last;
$$;

comment on function painel_dispersao is
    'Trocas de aplicativo por hora ativa (foco x dispersão): conta quando o app em primeiro plano muda entre minutos ativos consecutivos. Ignora ocioso e bloqueado. Lê activity_logs.';
