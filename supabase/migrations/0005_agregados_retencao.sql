-- ============================================================================
--  0005 — Agregados incrementais, classificação materializada e retenção
--
--  Problema que esta migration resolve: activity_logs cresce 1 linha por minuto
--  por estação (1.440/dia). Cinquenta estações = 26 milhões de linhas por ano.
--  As consultas do painel varriam essa tabela crua, com dois LEFT JOIN de
--  classificação, a cada clique de filtro — insustentável.
--
--  Estratégia:
--    1. A classificação (produtivo/neutro/improdutivo) é resolvida UMA vez, na
--       consolidação, e não a cada consulta.
--    2. Três agregados alimentam todo o painel:
--         resumo_horario     → curva do dia (bucket de hora)
--         resumo_diario      → KPIs, semana, mês, ano e "geral"
--         resumo_app_diario  → distribuição por aplicativo/site
--    3. A consolidação é INCREMENTAL: recalcula só os baldes tocados por
--       registros que chegaram desde a última rodada (usa created_at, então
--       lote atrasado de agente offline também é reprocessado).
--    4. A atividade crua tem retenção por empresa; os resumos são permanentes.
--
--  O dia é sempre o dia do FUSO DA EMPRESA (organizations.fuso), nunca UTC.
-- ============================================================================

-- ----------------------------------------------------------------------------
--  1. Fora o agregado antigo (materialized view com refresh integral)
-- ----------------------------------------------------------------------------
do $$
begin
    perform cron.unschedule('refresh-daily-summary');
exception when others then
    null; -- job não existe: primeira aplicação do schema.
end$$;

drop materialized view if exists daily_productivity_summary;
drop function if exists refresh_daily_summary();

-- ----------------------------------------------------------------------------
--  2. Fonte única da classificação
--
--  Toda leitura do dado cru passa por aqui, então a regra "o que é produtivo"
--  existe num lugar só. SECURITY INVOKER de propósito: chamada direta por um
--  gestor respeita o RLS de activity_logs; chamada de dentro das rotinas de
--  consolidação (SECURITY DEFINER) roda como dono e enxerga todas as empresas.
-- ----------------------------------------------------------------------------
create or replace function classificar_atividade(p_inicio timestamptz, p_fim timestamptz)
returns table (
    org_id      uuid,
    employee_id uuid,
    device_id   uuid,
    hora        timestamptz,
    alvo        text,
    tipo        categoria_produtividade,
    estado      text,
    keystrokes_count   int,
    mouse_clicks_count int,
    scroll_count       int,
    active_seconds     int
)
language sql
stable
as $$
    select
        l.org_id,
        l.employee_id,
        l.device_id,
        date_trunc('hour', l."timestamp" at time zone o.fuso) at time zone o.fuso,
        coalesce(nullif(l.domain, ''), l.process_name) as alvo,
        c.type,
        case
            when l.is_locked then 'BLOQUEADO'
            when l.is_idle   then 'OCIOSO'
            else 'ATIVO'
        end,
        l.keystrokes_count,
        l.mouse_clicks_count,
        l.scroll_count,
        l.active_seconds
      from activity_logs l
      join organizations o on o.id = l.org_id
      left join app_mappings m
             on m.org_id = l.org_id
            and (
                  (m.process_name is not null and lower(m.process_name) = lower(l.process_name))
               or (m.domain is not null and l.domain is not null and lower(m.domain) = lower(l.domain))
                )
      left join productivity_categories c on c.id = m.category_id
     where l."timestamp" >= p_inicio
       and l."timestamp" <  p_fim
       and l.employee_id is not null;
$$;

-- ----------------------------------------------------------------------------
--  3. Agregado por hora — alimenta a curva do dia
-- ----------------------------------------------------------------------------
create table if not exists resumo_horario (
    org_id      uuid not null references organizations(id) on delete cascade,
    employee_id uuid not null references employees(id) on delete cascade,
    device_id   uuid not null references devices(id) on delete cascade,
    -- Início da hora no fuso da empresa, guardado como timestamptz.
    hora        timestamptz not null,

    minutos_registrados     int not null default 0,
    minutos_ativos          int not null default 0,
    minutos_ociosos         int not null default 0,
    minutos_bloqueado       int not null default 0,
    minutos_produtivos      int not null default 0,
    minutos_neutros         int not null default 0,
    minutos_improdutivos    int not null default 0,
    minutos_sem_classificar int not null default 0,

    teclas          bigint not null default 0,
    cliques         bigint not null default 0,
    rolagens        bigint not null default 0,
    segundos_ativos bigint not null default 0,

    atualizado_em timestamptz not null default now(),
    primary key (org_id, employee_id, device_id, hora)
);

create index if not exists idx_resumo_horario_org_hora on resumo_horario(org_id, hora desc);
create index if not exists idx_resumo_horario_emp_hora on resumo_horario(employee_id, hora desc);

-- ----------------------------------------------------------------------------
--  4. Agregado por dia — alimenta KPIs, tendências e relatórios
-- ----------------------------------------------------------------------------
create table if not exists resumo_diario (
    org_id      uuid not null references organizations(id) on delete cascade,
    employee_id uuid not null references employees(id) on delete cascade,
    device_id   uuid not null references devices(id) on delete cascade,
    dia         date not null,

    minutos_registrados     int not null default 0,
    minutos_ativos          int not null default 0,
    minutos_ociosos         int not null default 0,
    minutos_bloqueado       int not null default 0,
    minutos_produtivos      int not null default 0,
    minutos_neutros         int not null default 0,
    minutos_improdutivos    int not null default 0,
    minutos_sem_classificar int not null default 0,

    teclas          bigint not null default 0,
    cliques         bigint not null default 0,
    rolagens        bigint not null default 0,
    segundos_ativos bigint not null default 0,

    -- Primeiro e último sinal do dia: base de "início/fim de expediente".
    primeiro_sinal timestamptz,
    ultimo_sinal   timestamptz,

    atualizado_em timestamptz not null default now(),
    primary key (org_id, employee_id, device_id, dia)
);

create index if not exists idx_resumo_diario_org_dia on resumo_diario(org_id, dia desc);
create index if not exists idx_resumo_diario_emp_dia on resumo_diario(employee_id, dia desc);

-- ----------------------------------------------------------------------------
--  5. Agregado por aplicativo/site e dia — alimenta a distribuição
-- ----------------------------------------------------------------------------
create table if not exists resumo_app_diario (
    org_id      uuid not null references organizations(id) on delete cascade,
    employee_id uuid not null references employees(id) on delete cascade,
    dia         date not null,
    alvo        text not null,
    tipo        categoria_produtividade,
    minutos     int not null default 0,
    teclas      bigint not null default 0,
    cliques     bigint not null default 0,
    primary key (org_id, employee_id, dia, alvo)
);

create index if not exists idx_resumo_app_org_dia on resumo_app_diario(org_id, dia desc);

-- ----------------------------------------------------------------------------
--  6. Consolidação incremental
--
--  Recalcula, do zero, apenas os baldes tocados por registros gravados desde
--  p_desde. Recalcular o balde inteiro (em vez de somar deltas) é o que torna a
--  operação idempotente: rodar duas vezes dá o mesmo resultado.
-- ----------------------------------------------------------------------------
create or replace function consolidar_resumos(p_desde timestamptz default null)
returns table (horas_afetadas bigint, dias_afetados bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
    v_desde  timestamptz := coalesce(p_desde, now() - interval '3 hours');
    v_min    timestamptz;
    v_max    timestamptz;
    v_horas  bigint;
    v_dias   bigint;
begin
    drop table if exists _baldes_hora;
    drop table if exists _baldes_dia;

    -- 6.1 Baldes de hora tocados por registros recém-chegados.
    create temp table _baldes_hora on commit drop as
    select distinct
           l.org_id,
           l.employee_id,
           l.device_id,
           date_trunc('hour', l."timestamp" at time zone o.fuso) at time zone o.fuso as hora
      from activity_logs l
      join organizations o on o.id = l.org_id
     where l.created_at >= v_desde
       and l.employee_id is not null;

    get diagnostics v_horas = row_count;

    if v_horas = 0 then
        return query select 0::bigint, 0::bigint;
        return;
    end if;

    create index on _baldes_hora (org_id, employee_id, device_id, hora);
    select min(hora), max(hora) + interval '1 hour' into v_min, v_max from _baldes_hora;

    delete from resumo_horario r
     using _baldes_hora b
     where r.org_id = b.org_id
       and r.employee_id = b.employee_id
       and r.device_id = b.device_id
       and r.hora = b.hora;

    -- 6.2 Recalcula os baldes de hora a partir do dado cru, já classificado.
    insert into resumo_horario (
        org_id, employee_id, device_id, hora,
        minutos_registrados, minutos_ativos, minutos_ociosos, minutos_bloqueado,
        minutos_produtivos, minutos_neutros, minutos_improdutivos, minutos_sem_classificar,
        teclas, cliques, rolagens, segundos_ativos
    )
    select
        cl.org_id, cl.employee_id, cl.device_id, cl.hora,
        count(*),
        count(*) filter (where cl.estado = 'ATIVO'),
        count(*) filter (where cl.estado = 'OCIOSO'),
        count(*) filter (where cl.estado = 'BLOQUEADO'),
        count(*) filter (where cl.estado = 'ATIVO' and cl.tipo = 'PRODUCTIVE'),
        count(*) filter (where cl.estado = 'ATIVO' and cl.tipo = 'NEUTRAL'),
        count(*) filter (where cl.estado = 'ATIVO' and cl.tipo = 'UNPRODUCTIVE'),
        count(*) filter (where cl.estado = 'ATIVO' and cl.tipo is null),
        coalesce(sum(cl.keystrokes_count), 0),
        coalesce(sum(cl.mouse_clicks_count), 0),
        coalesce(sum(cl.scroll_count), 0),
        coalesce(sum(cl.active_seconds), 0)
      from classificar_atividade(v_min, v_max) cl
      join _baldes_hora b
        on b.org_id = cl.org_id
       and b.employee_id = cl.employee_id
       and b.device_id = cl.device_id
       and b.hora = cl.hora
     group by cl.org_id, cl.employee_id, cl.device_id, cl.hora;

    -- 6.3 Dias tocados (no fuso da empresa).
    create temp table _baldes_dia on commit drop as
    select distinct b.org_id, b.employee_id, b.device_id,
           (b.hora at time zone o.fuso)::date as dia
      from _baldes_hora b
      join organizations o on o.id = b.org_id;

    get diagnostics v_dias = row_count;

    delete from resumo_diario r
     using _baldes_dia b
     where r.org_id = b.org_id
       and r.employee_id = b.employee_id
       and r.device_id = b.device_id
       and r.dia = b.dia;

    insert into resumo_diario (
        org_id, employee_id, device_id, dia,
        minutos_registrados, minutos_ativos, minutos_ociosos, minutos_bloqueado,
        minutos_produtivos, minutos_neutros, minutos_improdutivos, minutos_sem_classificar,
        teclas, cliques, rolagens, segundos_ativos, primeiro_sinal, ultimo_sinal
    )
    select
        h.org_id, h.employee_id, h.device_id, (h.hora at time zone o.fuso)::date,
        sum(h.minutos_registrados), sum(h.minutos_ativos), sum(h.minutos_ociosos),
        sum(h.minutos_bloqueado), sum(h.minutos_produtivos), sum(h.minutos_neutros),
        sum(h.minutos_improdutivos), sum(h.minutos_sem_classificar),
        sum(h.teclas), sum(h.cliques), sum(h.rolagens), sum(h.segundos_ativos),
        min(h.hora), max(h.hora)
      from resumo_horario h
      join organizations o on o.id = h.org_id
      join _baldes_dia d
        on d.org_id = h.org_id
       and d.employee_id = h.employee_id
       and d.device_id = h.device_id
       and d.dia = (h.hora at time zone o.fuso)::date
     group by h.org_id, h.employee_id, h.device_id, (h.hora at time zone o.fuso)::date;

    -- 6.4 Distribuição por aplicativo/site nos mesmos dias.
    delete from resumo_app_diario r
     using (select distinct org_id, employee_id, dia from _baldes_dia) b
     where r.org_id = b.org_id
       and r.employee_id = b.employee_id
       and r.dia = b.dia;

    insert into resumo_app_diario (org_id, employee_id, dia, alvo, tipo, minutos, teclas, cliques)
    select
        cl.org_id, cl.employee_id, (cl.hora at time zone o.fuso)::date, cl.alvo,
        max(cl.tipo), count(*), coalesce(sum(cl.keystrokes_count), 0),
        coalesce(sum(cl.mouse_clicks_count), 0)
      from classificar_atividade(v_min, v_max) cl
      join organizations o on o.id = cl.org_id
      join (select distinct org_id, employee_id, dia from _baldes_dia) d
        on d.org_id = cl.org_id
       and d.employee_id = cl.employee_id
       and d.dia = (cl.hora at time zone o.fuso)::date
     where cl.estado = 'ATIVO'
     group by cl.org_id, cl.employee_id, (cl.hora at time zone o.fuso)::date, cl.alvo;

    return query select v_horas, v_dias;
end;
$$;

-- ----------------------------------------------------------------------------
--  7. Reconsolidação sob demanda
--
--  Mudou a classificação de um app? O histórico precisa ser recalculado, senão
--  o painel mostra a regra velha. A tela de administração chama esta função
--  depois de salvar mapeamentos.
-- ----------------------------------------------------------------------------
create or replace function reconsolidar_org(p_org uuid, p_dias int default 90)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
    v_inicio timestamptz := now() - make_interval(days => greatest(p_dias, 1));
    v_linhas bigint;
begin
    if not (p_org = auth_org_id() and auth_pode_administrar()) then
        raise exception 'Sem permissão para reconsolidar esta empresa.'
            using errcode = 'insufficient_privilege';
    end if;

    delete from resumo_horario    where org_id = p_org and hora >= v_inicio;
    delete from resumo_diario     where org_id = p_org and dia  >= v_inicio::date;
    delete from resumo_app_diario where org_id = p_org and dia  >= v_inicio::date;

    insert into resumo_horario (
        org_id, employee_id, device_id, hora,
        minutos_registrados, minutos_ativos, minutos_ociosos, minutos_bloqueado,
        minutos_produtivos, minutos_neutros, minutos_improdutivos, minutos_sem_classificar,
        teclas, cliques, rolagens, segundos_ativos
    )
    select
        cl.org_id, cl.employee_id, cl.device_id, cl.hora,
        count(*),
        count(*) filter (where cl.estado = 'ATIVO'),
        count(*) filter (where cl.estado = 'OCIOSO'),
        count(*) filter (where cl.estado = 'BLOQUEADO'),
        count(*) filter (where cl.estado = 'ATIVO' and cl.tipo = 'PRODUCTIVE'),
        count(*) filter (where cl.estado = 'ATIVO' and cl.tipo = 'NEUTRAL'),
        count(*) filter (where cl.estado = 'ATIVO' and cl.tipo = 'UNPRODUCTIVE'),
        count(*) filter (where cl.estado = 'ATIVO' and cl.tipo is null),
        coalesce(sum(cl.keystrokes_count), 0),
        coalesce(sum(cl.mouse_clicks_count), 0),
        coalesce(sum(cl.scroll_count), 0),
        coalesce(sum(cl.active_seconds), 0)
      from classificar_atividade(v_inicio, now() + interval '1 hour') cl
     where cl.org_id = p_org
     group by cl.org_id, cl.employee_id, cl.device_id, cl.hora;

    get diagnostics v_linhas = row_count;

    insert into resumo_diario (
        org_id, employee_id, device_id, dia,
        minutos_registrados, minutos_ativos, minutos_ociosos, minutos_bloqueado,
        minutos_produtivos, minutos_neutros, minutos_improdutivos, minutos_sem_classificar,
        teclas, cliques, rolagens, segundos_ativos, primeiro_sinal, ultimo_sinal
    )
    select
        h.org_id, h.employee_id, h.device_id, (h.hora at time zone o.fuso)::date,
        sum(h.minutos_registrados), sum(h.minutos_ativos), sum(h.minutos_ociosos),
        sum(h.minutos_bloqueado), sum(h.minutos_produtivos), sum(h.minutos_neutros),
        sum(h.minutos_improdutivos), sum(h.minutos_sem_classificar),
        sum(h.teclas), sum(h.cliques), sum(h.rolagens), sum(h.segundos_ativos),
        min(h.hora), max(h.hora)
      from resumo_horario h
      join organizations o on o.id = h.org_id
     where h.org_id = p_org and h.hora >= v_inicio
     group by h.org_id, h.employee_id, h.device_id, (h.hora at time zone o.fuso)::date;

    insert into resumo_app_diario (org_id, employee_id, dia, alvo, tipo, minutos, teclas, cliques)
    select
        cl.org_id, cl.employee_id, (cl.hora at time zone o.fuso)::date, cl.alvo,
        max(cl.tipo), count(*), coalesce(sum(cl.keystrokes_count), 0),
        coalesce(sum(cl.mouse_clicks_count), 0)
      from classificar_atividade(v_inicio, now() + interval '1 hour') cl
      join organizations o on o.id = cl.org_id
     where cl.org_id = p_org
       and cl.estado = 'ATIVO'
     group by cl.org_id, cl.employee_id, (cl.hora at time zone o.fuso)::date, cl.alvo;

    return v_linhas;
end;
$$;

-- ----------------------------------------------------------------------------
--  8. Retenção da atividade crua (LGPD: guardar só o necessário)
-- ----------------------------------------------------------------------------
create or replace function expurgar_atividade_antiga()
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
    v_total bigint := 0;
    v_org   record;
    v_qtd   bigint;
begin
    for v_org in select id, retencao_dias from organizations loop
        delete from activity_logs
         where org_id = v_org.id
           and "timestamp" < now() - make_interval(days => v_org.retencao_dias);
        get diagnostics v_qtd = row_count;
        v_total := v_total + v_qtd;
    end loop;
    return v_total;
end;
$$;

comment on function expurgar_atividade_antiga() is
    'Apaga a atividade minuto-a-minuto além da retenção contratada. Os resumos agregados permanecem — o histórico gerencial não se perde.';

-- ----------------------------------------------------------------------------
--  9. Rotinas de manutenção não são chamáveis pelo cliente do navegador
-- ----------------------------------------------------------------------------
revoke execute on function consolidar_resumos(timestamptz)   from public, anon, authenticated;
revoke execute on function expurgar_atividade_antiga()       from public, anon, authenticated;
revoke execute on function resolver_colaborador(uuid, text)  from public, anon, authenticated;

-- A ingestão (Edge Function, service_role) precisa resolver o colaborador do lote.
grant execute on function resolver_colaborador(uuid, text) to service_role;

-- ----------------------------------------------------------------------------
--  10. Row Level Security dos agregados (mesma regra da atividade crua)
-- ----------------------------------------------------------------------------
alter table resumo_horario    enable row level security;
alter table resumo_diario     enable row level security;
alter table resumo_app_diario enable row level security;

drop policy if exists resumo_horario_select on resumo_horario;
create policy resumo_horario_select on resumo_horario
    for select using (
        org_id = auth_org_id()
        and (
            auth_escopo_equipe() is null
            or employee_id in (select id from employees where team_id = auth_escopo_equipe())
        )
    );

drop policy if exists resumo_diario_select on resumo_diario;
create policy resumo_diario_select on resumo_diario
    for select using (
        org_id = auth_org_id()
        and (
            auth_escopo_equipe() is null
            or employee_id in (select id from employees where team_id = auth_escopo_equipe())
        )
    );

drop policy if exists resumo_app_select on resumo_app_diario;
create policy resumo_app_select on resumo_app_diario
    for select using (
        org_id = auth_org_id()
        and (
            auth_escopo_equipe() is null
            or employee_id in (select id from employees where team_id = auth_escopo_equipe())
        )
    );

-- ----------------------------------------------------------------------------
--  11. Agendamentos
-- ----------------------------------------------------------------------------
do $$
begin
    perform cron.unschedule('consolidar-resumos');
exception when others then null;
end$$;

do $$
begin
    perform cron.unschedule('expurgar-atividade');
exception when others then null;
end$$;

select cron.schedule(
    'consolidar-resumos',
    '*/10 * * * *',
    $$ select consolidar_resumos(now() - interval '3 hours'); $$
);

-- Expurgo diário às 04:10 UTC (01:10 em Brasília), fora do horário comercial.
select cron.schedule(
    'expurgar-atividade',
    '10 4 * * *',
    $$ select expurgar_atividade_antiga(); $$
);
