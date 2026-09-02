-- ============================================================================
--  Funções de agregação para o Dashboard.
--  Todas rodam com SECURITY INVOKER (padrão): o RLS de activity_logs continua
--  valendo, então cada gestor só agrega os dados da própria organização — não é
--  preciso passar org_id, e não há como vazar dado de outra empresa.
-- ============================================================================

-- ----------------------------------------------------------------------------
--  Série temporal de atividade (área: Ativo x Ocioso x Improdutivo)
--  p_bucket: 'hour' para o gráfico do dia, 'day' para tendências de 7/30 dias.
-- ----------------------------------------------------------------------------
create or replace function serie_atividade(
    p_inicio timestamptz,
    p_bucket text default 'hour',
    p_device uuid default null
)
returns table (
    balde        timestamptz,
    min_ativo    bigint,
    min_ocioso   bigint,
    min_improd   bigint
)
language sql
stable
as $$
    select
        date_trunc(case when p_bucket = 'day' then 'day' else 'hour' end, l."timestamp") as balde,
        count(*) filter (where not l.is_idle and not l.is_locked)              as min_ativo,
        count(*) filter (where l.is_idle or l.is_locked)                       as min_ocioso,
        count(*) filter (where c.type = 'UNPRODUCTIVE' and not l.is_idle)      as min_improd
    from activity_logs l
    left join app_mappings m
           on m.org_id = l.org_id
          and (
                (m.process_name is not null and lower(m.process_name) = lower(l.process_name))
             or (m.domain is not null and l.domain is not null and lower(m.domain) = lower(l.domain))
              )
    left join productivity_categories c on c.id = m.category_id
    where l."timestamp" >= p_inicio
      and (p_device is null or l.device_id = p_device)
    group by balde
    order by balde;
$$;

-- ----------------------------------------------------------------------------
--  Distribuição de tempo por aplicativo/site (Donut)
-- ----------------------------------------------------------------------------
create or replace function distribuicao_apps(
    p_inicio timestamptz,
    p_device uuid default null,
    p_limite int default 8
)
returns table (
    rotulo   text,
    minutos  bigint,
    tipo     categoria_produtividade
)
language sql
stable
as $$
    select
        coalesce(nullif(l.domain, ''), l.process_name) as rotulo,
        count(*)                                        as minutos,
        coalesce(max(c.type), 'NEUTRAL')                as tipo
    from activity_logs l
    left join app_mappings m
           on m.org_id = l.org_id
          and (
                (m.process_name is not null and lower(m.process_name) = lower(l.process_name))
             or (m.domain is not null and l.domain is not null and lower(m.domain) = lower(l.domain))
              )
    left join productivity_categories c on c.id = m.category_id
    where l."timestamp" >= p_inicio
      and not l.is_idle
      and not l.is_locked
      and (p_device is null or l.device_id = p_device)
    group by rotulo
    order by minutos desc
    limit p_limite;
$$;

-- ----------------------------------------------------------------------------
--  KPIs consolidados do período (uma linha)
-- ----------------------------------------------------------------------------
create or replace function kpis_periodo(
    p_inicio timestamptz,
    p_device uuid default null
)
returns table (
    minutos_ativos     bigint,
    minutos_produtivos bigint,
    minutos_neutros    bigint,
    minutos_improd     bigint,
    total_teclas       bigint,
    total_cliques      bigint,
    total_rolagens     bigint,
    top_aplicacao      text
)
language sql
stable
as $$
    with base as (
        select
            l.*,
            coalesce(nullif(l.domain, ''), l.process_name) as alvo,
            c.type as tipo
        from activity_logs l
        left join app_mappings m
               on m.org_id = l.org_id
              and (
                    (m.process_name is not null and lower(m.process_name) = lower(l.process_name))
                 or (m.domain is not null and l.domain is not null and lower(m.domain) = lower(l.domain))
                  )
        left join productivity_categories c on c.id = m.category_id
        where l."timestamp" >= p_inicio
          and (p_device is null or l.device_id = p_device)
    )
    select
        count(*) filter (where not is_idle and not is_locked)          as minutos_ativos,
        count(*) filter (where tipo = 'PRODUCTIVE' and not is_idle)    as minutos_produtivos,
        count(*) filter (where tipo = 'NEUTRAL' and not is_idle)       as minutos_neutros,
        count(*) filter (where tipo = 'UNPRODUCTIVE' and not is_idle)  as minutos_improd,
        coalesce(sum(keystrokes_count), 0)                             as total_teclas,
        coalesce(sum(mouse_clicks_count), 0)                           as total_cliques,
        coalesce(sum(scroll_count), 0)                                 as total_rolagens,
        (select alvo from base where not is_idle group by alvo order by count(*) desc limit 1) as top_aplicacao
    from base;
$$;

-- ----------------------------------------------------------------------------
--  Última linha por dispositivo — alimenta a Timeline em tempo real
-- ----------------------------------------------------------------------------
create or replace function ultima_atividade_por_dispositivo()
returns table (
    device_id     uuid,
    machine_name  text,
    os_user       text,
    process_name  text,
    domain        text,
    window_title  text,
    is_idle       boolean,
    is_locked     boolean,
    "timestamp"   timestamptz,
    keystrokes_count int,
    mouse_clicks_count int,
    scroll_count  int,
    status_online boolean,
    last_sync_at  timestamptz
)
language sql
stable
as $$
    select distinct on (d.id)
        d.id, d.machine_name, d.os_user,
        l.process_name, l.domain, l.window_title,
        l.is_idle, l.is_locked, l."timestamp",
        l.keystrokes_count, l.mouse_clicks_count, l.scroll_count,
        d.status_online, d.last_sync_at
    from devices d
    left join activity_logs l on l.device_id = d.id
    order by d.id, l."timestamp" desc nulls last;
$$;
