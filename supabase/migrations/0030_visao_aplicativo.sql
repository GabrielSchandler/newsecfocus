-- ============================================================================
--  0030 — Visão por aplicativo
--
--  Até aqui o painel respondia "quais apps a empresa usa". Faltava o outro lado:
--  clicar num app e ver QUEM usa, QUAL SETOR usa e COMO o uso se distribui no
--  tempo. É a pergunta que vem logo depois de olhar o ranking — e sem ela o
--  gestor exporta a planilha para cruzar na mão.
--
--  Duas fontes, por precisão e custo:
--    • pessoas e série por DIA saem de resumo_app_diario (já agregado);
--    • série por HORA sai de activity_logs, porque o agregado diário não guarda
--      hora. Só é usada no recorte de um dia, então lê pouca coisa.
-- ============================================================================

-- ----------------------------------------------------------------------------
--  Quem usa o aplicativo
-- ----------------------------------------------------------------------------
create or replace function painel_app_pessoas(
    p_inicio      timestamptz,
    p_fim         timestamptz,
    p_alvo        text,
    p_org         uuid default null,
    p_equipe      uuid default null,
    p_colaborador uuid default null
)
returns table (
    colaborador_id uuid,
    colaborador    text,
    equipe_id      uuid,
    equipe         text,
    minutos        bigint,
    dias           int
)
language sql
stable
as $$
    with a as (select org_em_foco(p_org) as org_id, fuso_da_org(p_org) as fuso)
    select
        e.id,
        coalesce(e.nome, e.os_user),
        t.id,
        t.nome,
        coalesce(sum(r.minutos), 0)::bigint,
        count(distinct r.dia)::int
      from resumo_app_diario r
      cross join a
      join employees e on e.id = r.employee_id
      left join teams t on t.id = e.team_id
     where r.org_id = a.org_id
       and lower(r.alvo) = lower(p_alvo)
       and r.dia between (p_inicio at time zone a.fuso)::date
                     and ((p_fim - interval '1 second') at time zone a.fuso)::date
       and (p_equipe is null or e.team_id = p_equipe)
       and (p_colaborador is null or e.id = p_colaborador)
     group by e.id, e.nome, e.os_user, t.id, t.nome
    having sum(r.minutos) > 0
     order by sum(r.minutos) desc;
$$;

comment on function painel_app_pessoas is
    'Quem usou um aplicativo/site no recorte, com o tempo de cada um. O painel soma por equipe a partir daqui — não precisa de uma segunda consulta.';

-- ----------------------------------------------------------------------------
--  Uso do aplicativo ao longo do tempo
--
--  p_por_hora = true devolve o dia em baldes de hora (para o recorte de um dia);
--  false devolve um ponto por dia (para períodos mais longos).
-- ----------------------------------------------------------------------------
create or replace function painel_app_serie(
    p_inicio      timestamptz,
    p_fim         timestamptz,
    p_alvo        text,
    p_por_hora    boolean default false,
    p_org         uuid default null,
    p_equipe      uuid default null,
    p_colaborador uuid default null
)
returns table (
    balde   timestamptz,
    minutos bigint
)
language sql
stable
as $$
    with a as (select org_em_foco(p_org) as org_id, fuso_da_org(p_org) as fuso)
    -- Por hora: precisa do dado cru, porque o agregado por app é diário.
    select
        date_trunc('hour', l."timestamp" at time zone a.fuso) at time zone a.fuso,
        count(*)::bigint
      from activity_logs l
      cross join a
      join employees e on e.id = l.employee_id
     where p_por_hora
       and l.org_id = a.org_id
       and l."timestamp" >= p_inicio
       and l."timestamp" <  p_fim
       and lower(coalesce(nullif(l.domain, ''), l.process_name)) = lower(p_alvo)
       and (p_equipe is null or e.team_id = p_equipe)
       and (p_colaborador is null or e.id = p_colaborador)
     group by 1

    union all

    -- Por dia: sai do agregado, que é barato mesmo em 30+ dias.
    select
        (r.dia::timestamp at time zone a.fuso),
        coalesce(sum(r.minutos), 0)::bigint
      from resumo_app_diario r
      cross join a
      join employees e on e.id = r.employee_id
     where not p_por_hora
       and r.org_id = a.org_id
       and lower(r.alvo) = lower(p_alvo)
       and r.dia between (p_inicio at time zone a.fuso)::date
                     and ((p_fim - interval '1 second') at time zone a.fuso)::date
       and (p_equipe is null or e.team_id = p_equipe)
       and (p_colaborador is null or e.id = p_colaborador)
     group by r.dia, a.fuso
    having sum(r.minutos) > 0

     order by 1;
$$;

comment on function painel_app_serie is
    'Uso de um aplicativo/site ao longo do tempo: por hora (recorte de um dia) ou por dia. A versão por hora lê o dado cru porque o agregado por app é diário.';
