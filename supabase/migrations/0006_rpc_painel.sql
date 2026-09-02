-- ============================================================================
--  0006 — RPCs do painel (v2)
--
--  Substituem as funções da 0003. Diferenças que importam:
--
--    • Período fechado: recebem p_inicio E p_fim, então "agosto", "2025" e
--      "ontem" são pedidos legítimos — antes só existia "dos últimos X até
--      agora", o que impedia comparar períodos.
--    • Escopo hierárquico: filtram por equipe, colaborador e dispositivo.
--    • Leem os AGREGADOS (0005), nunca a tabela crua de 26M linhas.
--    • O dia é o dia do fuso da empresa, não UTC.
--    • Índice de produtividade devolve NULL quando não há nada classificado —
--      antes o painel exibia "100%" nessa situação, o que é mentira.
--
--  Todas são SECURITY INVOKER: o RLS dos agregados continua valendo, então um
--  líder de equipe agrega só a equipe dele sem que a função precise saber disso.
-- ============================================================================

-- Fora as versões antigas (assinaturas incompatíveis).
drop function if exists serie_atividade(timestamptz, text, uuid);
drop function if exists distribuicao_apps(timestamptz, uuid, int);
drop function if exists kpis_periodo(timestamptz, uuid);
drop function if exists ultima_atividade_por_dispositivo();

-- ----------------------------------------------------------------------------
--  Fuso da empresa do usuário logado. Base da virada do dia em todo o painel.
-- ----------------------------------------------------------------------------
create or replace function auth_fuso()
returns text
language sql
stable
security definer
set search_path = public
as $$
    select coalesce(
        (select o.fuso from organizations o where o.id = auth_org_id()),
        'America/Sao_Paulo'
    );
$$;

-- Índice de produtividade: produtivos sobre o tempo efetivamente classificado.
-- NULL = nada classificado ainda (o painel mostra "sem classificação", não 100%).
create or replace function calcular_indice(p_prod bigint, p_neutro bigint, p_improd bigint)
returns numeric
language sql
immutable
as $$
    select case
        when coalesce(p_prod, 0) + coalesce(p_neutro, 0) + coalesce(p_improd, 0) = 0 then null
        else round(coalesce(p_prod, 0) * 100.0 / (p_prod + p_neutro + p_improd), 1)
    end;
$$;

-- ----------------------------------------------------------------------------
--  KPIs consolidados do período (uma linha)
-- ----------------------------------------------------------------------------
create or replace function painel_kpis(
    p_inicio      timestamptz,
    p_fim         timestamptz,
    p_equipe      uuid default null,
    p_colaborador uuid default null,
    p_dispositivo uuid default null
)
returns table (
    minutos_registrados     bigint,
    minutos_ativos          bigint,
    minutos_ociosos         bigint,
    minutos_bloqueado       bigint,
    minutos_produtivos      bigint,
    minutos_neutros         bigint,
    minutos_improdutivos    bigint,
    minutos_sem_classificar bigint,
    teclas                  bigint,
    cliques                 bigint,
    rolagens                bigint,
    indice                  numeric,
    colaboradores           bigint,
    dispositivos            bigint,
    dias_com_registro       bigint,
    top_aplicacao           text,
    jornada_esperada        bigint
)
language sql
stable
as $$
    with f as (
        select auth_fuso() as fuso
    ),
    janela as (
        select (p_inicio at time zone f.fuso)::date as d_ini,
               ((p_fim - interval '1 second') at time zone f.fuso)::date as d_fim
          from f
    ),
    base as (
        select r.*, e.jornada_minutos_dia
          from resumo_diario r
          join employees e on e.id = r.employee_id
         cross join janela j
         where r.dia between j.d_ini and j.d_fim
           and (p_equipe      is null or e.team_id   = p_equipe)
           and (p_colaborador is null or r.employee_id = p_colaborador)
           and (p_dispositivo is null or r.device_id = p_dispositivo)
    ),
    agr as (
        select
            coalesce(sum(minutos_registrados), 0)     as minutos_registrados,
            coalesce(sum(minutos_ativos), 0)          as minutos_ativos,
            coalesce(sum(minutos_ociosos), 0)         as minutos_ociosos,
            coalesce(sum(minutos_bloqueado), 0)       as minutos_bloqueado,
            coalesce(sum(minutos_produtivos), 0)      as minutos_produtivos,
            coalesce(sum(minutos_neutros), 0)         as minutos_neutros,
            coalesce(sum(minutos_improdutivos), 0)    as minutos_improdutivos,
            coalesce(sum(minutos_sem_classificar), 0) as minutos_sem_classificar,
            coalesce(sum(teclas), 0)                  as teclas,
            coalesce(sum(cliques), 0)                 as cliques,
            coalesce(sum(rolagens), 0)                as rolagens,
            count(distinct employee_id)               as colaboradores,
            count(distinct device_id)                 as dispositivos,
            count(distinct dia)                       as dias_com_registro
          from base
    ),
    -- Jornada esperada = soma da jornada de cada pessoa nos dias em que ela
    -- apareceu. Contada uma vez por pessoa/dia, mesmo com várias estações.
    jornada as (
        select coalesce(sum(j.jornada_minutos_dia), 0) as total
          from (
              select distinct employee_id, dia, jornada_minutos_dia from base
          ) j
    ),
    topo as (
        select a.alvo
          from resumo_app_diario a
          join employees e on e.id = a.employee_id
         cross join janela j
         where a.dia between j.d_ini and j.d_fim
           and (p_equipe      is null or e.team_id     = p_equipe)
           and (p_colaborador is null or a.employee_id = p_colaborador)
         group by a.alvo
         order by sum(a.minutos) desc
         limit 1
    )
    select
        agr.minutos_registrados, agr.minutos_ativos, agr.minutos_ociosos,
        agr.minutos_bloqueado, agr.minutos_produtivos, agr.minutos_neutros,
        agr.minutos_improdutivos, agr.minutos_sem_classificar,
        agr.teclas, agr.cliques, agr.rolagens,
        calcular_indice(agr.minutos_produtivos, agr.minutos_neutros, agr.minutos_improdutivos),
        agr.colaboradores, agr.dispositivos, agr.dias_com_registro,
        (select alvo from topo),
        jornada.total
      from agr cross join jornada;
$$;

-- ----------------------------------------------------------------------------
--  Série temporal — bucket de hora, dia, semana ou mês
--
--  'hour' lê o agregado horário (só faz sentido em janelas curtas);
--  os demais leem o agregado diário.
-- ----------------------------------------------------------------------------
create or replace function painel_serie(
    p_inicio      timestamptz,
    p_fim         timestamptz,
    p_bucket      text default 'day',
    p_equipe      uuid default null,
    p_colaborador uuid default null,
    p_dispositivo uuid default null
)
returns table (
    balde                timestamptz,
    minutos_ativos       bigint,
    minutos_ociosos      bigint,
    minutos_produtivos   bigint,
    minutos_neutros      bigint,
    minutos_improdutivos bigint,
    indice               numeric
)
language sql
stable
as $$
    with f as (select auth_fuso() as fuso),
    horario as (
        select
            date_trunc('hour', r.hora at time zone f.fuso) at time zone f.fuso as balde,
            sum(r.minutos_ativos)::bigint       as minutos_ativos,
            sum(r.minutos_ociosos + r.minutos_bloqueado)::bigint as minutos_ociosos,
            sum(r.minutos_produtivos)::bigint   as minutos_produtivos,
            sum(r.minutos_neutros)::bigint      as minutos_neutros,
            sum(r.minutos_improdutivos)::bigint as minutos_improdutivos
          from resumo_horario r
          join employees e on e.id = r.employee_id
         cross join f
         where p_bucket = 'hour'
           and r.hora >= p_inicio and r.hora < p_fim
           and (p_equipe      is null or e.team_id     = p_equipe)
           and (p_colaborador is null or r.employee_id = p_colaborador)
           and (p_dispositivo is null or r.device_id   = p_dispositivo)
         group by 1
    ),
    diario as (
        select
            date_trunc(
                case p_bucket when 'week' then 'week' when 'month' then 'month' else 'day' end,
                r.dia::timestamp
            ) at time zone f.fuso as balde,
            sum(r.minutos_ativos)::bigint       as minutos_ativos,
            sum(r.minutos_ociosos + r.minutos_bloqueado)::bigint as minutos_ociosos,
            sum(r.minutos_produtivos)::bigint   as minutos_produtivos,
            sum(r.minutos_neutros)::bigint      as minutos_neutros,
            sum(r.minutos_improdutivos)::bigint as minutos_improdutivos
          from resumo_diario r
          join employees e on e.id = r.employee_id
         cross join f
         where p_bucket <> 'hour'
           and r.dia between (p_inicio at time zone f.fuso)::date
                         and ((p_fim - interval '1 second') at time zone f.fuso)::date
           and (p_equipe      is null or e.team_id     = p_equipe)
           and (p_colaborador is null or r.employee_id = p_colaborador)
           and (p_dispositivo is null or r.device_id   = p_dispositivo)
         group by 1
    ),
    uniao as (
        select * from horario
        union all
        select * from diario
    )
    select
        balde, minutos_ativos, minutos_ociosos,
        minutos_produtivos, minutos_neutros, minutos_improdutivos,
        calcular_indice(minutos_produtivos, minutos_neutros, minutos_improdutivos)
      from uniao
     order by balde;
$$;

-- ----------------------------------------------------------------------------
--  Distribuição por aplicativo / site
-- ----------------------------------------------------------------------------
create or replace function painel_distribuicao(
    p_inicio      timestamptz,
    p_fim         timestamptz,
    p_equipe      uuid default null,
    p_colaborador uuid default null,
    p_limite      int  default 10
)
returns table (
    alvo    text,
    tipo    categoria_produtividade,
    minutos bigint,
    pessoas bigint
)
language sql
stable
as $$
    with f as (select auth_fuso() as fuso)
    select
        a.alvo,
        max(a.tipo),
        sum(a.minutos)::bigint,
        count(distinct a.employee_id)::bigint
      from resumo_app_diario a
      join employees e on e.id = a.employee_id
     cross join f
     where a.dia between (p_inicio at time zone f.fuso)::date
                     and ((p_fim - interval '1 second') at time zone f.fuso)::date
       and (p_equipe      is null or e.team_id     = p_equipe)
       and (p_colaborador is null or a.employee_id = p_colaborador)
     group by a.alvo
     order by sum(a.minutos) desc
     limit greatest(p_limite, 1);
$$;

-- ----------------------------------------------------------------------------
--  Ranking por equipe
-- ----------------------------------------------------------------------------
create or replace function painel_ranking_equipes(
    p_inicio timestamptz,
    p_fim    timestamptz
)
returns table (
    equipe_id            uuid,
    equipe               text,
    cor                  text,
    pessoas              bigint,
    minutos_ativos       bigint,
    minutos_ociosos      bigint,
    minutos_produtivos   bigint,
    minutos_neutros      bigint,
    minutos_improdutivos bigint,
    indice               numeric,
    aderencia            numeric
)
language sql
stable
as $$
    with f as (select auth_fuso() as fuso),
    base as (
        select r.*, e.team_id, e.jornada_minutos_dia
          from resumo_diario r
          join employees e on e.id = r.employee_id
         cross join f
         where r.dia between (p_inicio at time zone f.fuso)::date
                         and ((p_fim - interval '1 second') at time zone f.fuso)::date
    ),
    jornada as (
        select team_id, sum(jornada_minutos_dia) as esperado
          from (select distinct team_id, employee_id, dia, jornada_minutos_dia from base) j
         group by team_id
    )
    select
        t.id,
        t.nome,
        t.cor,
        count(distinct b.employee_id)::bigint,
        coalesce(sum(b.minutos_ativos), 0)::bigint,
        coalesce(sum(b.minutos_ociosos + b.minutos_bloqueado), 0)::bigint,
        coalesce(sum(b.minutos_produtivos), 0)::bigint,
        coalesce(sum(b.minutos_neutros), 0)::bigint,
        coalesce(sum(b.minutos_improdutivos), 0)::bigint,
        calcular_indice(
            coalesce(sum(b.minutos_produtivos), 0)::bigint,
            coalesce(sum(b.minutos_neutros), 0)::bigint,
            coalesce(sum(b.minutos_improdutivos), 0)::bigint
        ),
        case
            when coalesce(j.esperado, 0) = 0 then null
            else round(coalesce(sum(b.minutos_ativos), 0) * 100.0 / j.esperado, 1)
        end
      from teams t
      left join base b on b.team_id = t.id
      left join jornada j on j.team_id = t.id
     where t.ativa
     group by t.id, t.nome, t.cor, j.esperado
     order by 10 desc nulls last, 5 desc;
$$;

-- ----------------------------------------------------------------------------
--  Ranking por colaborador
-- ----------------------------------------------------------------------------
create or replace function painel_ranking_colaboradores(
    p_inicio timestamptz,
    p_fim    timestamptz,
    p_equipe uuid default null,
    p_limite int  default 100
)
returns table (
    colaborador_id       uuid,
    colaborador          text,
    cargo                text,
    equipe_id            uuid,
    equipe               text,
    dias_com_registro    bigint,
    minutos_ativos       bigint,
    minutos_ociosos      bigint,
    minutos_produtivos   bigint,
    minutos_neutros      bigint,
    minutos_improdutivos bigint,
    teclas               bigint,
    cliques              bigint,
    indice               numeric,
    aderencia            numeric
)
language sql
stable
as $$
    with f as (select auth_fuso() as fuso),
    base as (
        select r.*
          from resumo_diario r
         cross join f
         where r.dia between (p_inicio at time zone f.fuso)::date
                         and ((p_fim - interval '1 second') at time zone f.fuso)::date
    )
    select
        e.id,
        coalesce(e.nome, e.os_user),
        e.cargo,
        t.id,
        t.nome,
        count(distinct b.dia)::bigint,
        coalesce(sum(b.minutos_ativos), 0)::bigint,
        coalesce(sum(b.minutos_ociosos + b.minutos_bloqueado), 0)::bigint,
        coalesce(sum(b.minutos_produtivos), 0)::bigint,
        coalesce(sum(b.minutos_neutros), 0)::bigint,
        coalesce(sum(b.minutos_improdutivos), 0)::bigint,
        coalesce(sum(b.teclas), 0)::bigint,
        coalesce(sum(b.cliques), 0)::bigint,
        calcular_indice(
            coalesce(sum(b.minutos_produtivos), 0)::bigint,
            coalesce(sum(b.minutos_neutros), 0)::bigint,
            coalesce(sum(b.minutos_improdutivos), 0)::bigint
        ),
        case
            when count(distinct b.dia) = 0 then null
            else round(
                coalesce(sum(b.minutos_ativos), 0) * 100.0
                / (count(distinct b.dia) * greatest(e.jornada_minutos_dia, 1)), 1)
        end
      from employees e
      left join teams t on t.id = e.team_id
      left join base b on b.employee_id = e.id
     where e.ativo
       and (p_equipe is null or e.team_id = p_equipe)
     group by e.id, e.nome, e.os_user, e.cargo, e.jornada_minutos_dia, t.id, t.nome
     order by 7 desc
     limit greatest(p_limite, 1);
$$;

-- ----------------------------------------------------------------------------
--  Relatório dia a dia — a granularidade fina que vai para XLSX/CSV
-- ----------------------------------------------------------------------------
create or replace function painel_relatorio_diario(
    p_inicio      timestamptz,
    p_fim         timestamptz,
    p_equipe      uuid default null,
    p_colaborador uuid default null
)
returns table (
    dia                  date,
    equipe               text,
    colaborador          text,
    cargo                text,
    minutos_registrados  bigint,
    minutos_ativos       bigint,
    minutos_ociosos      bigint,
    minutos_produtivos   bigint,
    minutos_neutros      bigint,
    minutos_improdutivos bigint,
    minutos_sem_classificar bigint,
    teclas               bigint,
    cliques              bigint,
    indice               numeric,
    primeiro_sinal       timestamptz,
    ultimo_sinal         timestamptz
)
language sql
stable
as $$
    with f as (select auth_fuso() as fuso)
    select
        r.dia,
        coalesce(t.nome, 'Sem equipe'),
        coalesce(e.nome, e.os_user),
        e.cargo,
        sum(r.minutos_registrados)::bigint,
        sum(r.minutos_ativos)::bigint,
        sum(r.minutos_ociosos + r.minutos_bloqueado)::bigint,
        sum(r.minutos_produtivos)::bigint,
        sum(r.minutos_neutros)::bigint,
        sum(r.minutos_improdutivos)::bigint,
        sum(r.minutos_sem_classificar)::bigint,
        sum(r.teclas)::bigint,
        sum(r.cliques)::bigint,
        calcular_indice(
            sum(r.minutos_produtivos)::bigint,
            sum(r.minutos_neutros)::bigint,
            sum(r.minutos_improdutivos)::bigint
        ),
        min(r.primeiro_sinal),
        max(r.ultimo_sinal)
      from resumo_diario r
      join employees e on e.id = r.employee_id
      left join teams t on t.id = e.team_id
     cross join f
     where r.dia between (p_inicio at time zone f.fuso)::date
                     and ((p_fim - interval '1 second') at time zone f.fuso)::date
       and (p_equipe      is null or e.team_id     = p_equipe)
       and (p_colaborador is null or r.employee_id = p_colaborador)
     group by r.dia, t.nome, e.nome, e.os_user, e.cargo
     order by r.dia, 3;
$$;

-- ----------------------------------------------------------------------------
--  Relatório por aplicativo — para o XLSX de uso de ferramentas
-- ----------------------------------------------------------------------------
create or replace function painel_relatorio_aplicativos(
    p_inicio      timestamptz,
    p_fim         timestamptz,
    p_equipe      uuid default null,
    p_colaborador uuid default null
)
returns table (
    aplicativo  text,
    categoria   text,
    equipe      text,
    colaborador text,
    minutos     bigint,
    teclas      bigint,
    cliques     bigint
)
language sql
stable
as $$
    with f as (select auth_fuso() as fuso)
    select
        a.alvo,
        case max(a.tipo)
            when 'PRODUCTIVE'   then 'Produtivo'
            when 'NEUTRAL'      then 'Neutro'
            when 'UNPRODUCTIVE' then 'Improdutivo'
            else 'Sem classificação'
        end,
        coalesce(t.nome, 'Sem equipe'),
        coalesce(e.nome, e.os_user),
        sum(a.minutos)::bigint,
        sum(a.teclas)::bigint,
        sum(a.cliques)::bigint
      from resumo_app_diario a
      join employees e on e.id = a.employee_id
      left join teams t on t.id = e.team_id
     cross join f
     where a.dia between (p_inicio at time zone f.fuso)::date
                     and ((p_fim - interval '1 second') at time zone f.fuso)::date
       and (p_equipe      is null or e.team_id     = p_equipe)
       and (p_colaborador is null or a.employee_id = p_colaborador)
     group by a.alvo, t.nome, e.nome, e.os_user
     order by 5 desc;
$$;

-- ----------------------------------------------------------------------------
--  Tempo real: último sinal de cada colaborador (alimenta a timeline)
-- ----------------------------------------------------------------------------
create or replace function painel_tempo_real()
returns table (
    colaborador_id uuid,
    colaborador    text,
    equipe         text,
    machine_name   text,
    device_id      uuid,
    process_name   text,
    domain         text,
    window_title   text,
    is_idle        boolean,
    is_locked      boolean,
    momento        timestamptz,
    teclas         int,
    cliques        int,
    rolagens       int,
    status_online  boolean,
    last_sync_at   timestamptz
)
language sql
stable
as $$
    select distinct on (e.id)
        e.id,
        coalesce(e.nome, e.os_user),
        coalesce(t.nome, 'Sem equipe'),
        d.machine_name,
        d.id,
        l.process_name,
        l.domain,
        l.window_title,
        l.is_idle,
        l.is_locked,
        l."timestamp",
        l.keystrokes_count,
        l.mouse_clicks_count,
        l.scroll_count,
        coalesce(d.status_online, false),
        d.last_sync_at
      from employees e
      left join teams t on t.id = e.team_id
      left join activity_logs l on l.employee_id = e.id
      left join devices d on d.id = l.device_id
     where e.ativo
     order by e.id, l."timestamp" desc nulls last;
$$;

-- ----------------------------------------------------------------------------
--  Painel da plataforma (revenda): uma linha por empresa cliente.
--  Só contadores de conta — nenhuma métrica de produtividade sai daqui.
-- ----------------------------------------------------------------------------
create or replace function plataforma_empresas()
returns table (
    id               uuid,
    nome             text,
    slug             text,
    status           text,
    plano            text,
    max_dispositivos int,
    dispositivos     bigint,
    dispositivos_online bigint,
    usuarios         bigint,
    ultima_sincronizacao timestamptz,
    criada_em        timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
    select
        o.id, o.name, o.slug, o.status, o.plano, o.max_dispositivos,
        (select count(*) from devices d where d.org_id = o.id),
        (select count(*) from devices d where d.org_id = o.id and d.status_online),
        (select count(*) from profiles p where p.org_id = o.id),
        (select max(d.last_sync_at) from devices d where d.org_id = o.id),
        o.created_at
      from organizations o
     where eh_admin_plataforma()
     order by o.name;
$$;
