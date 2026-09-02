-- ============================================================================
--  0008 — RPCs do painel com empresa em foco e jornada herdada
--
--  Duas mudanças em todas as funções do painel:
--
--  1. p_org — a operação da NewSec escolhe qual empresa está olhando. Usuário
--     comum passa NULL e continua preso à própria empresa: org_em_foco() é quem
--     decide, e devolve NULL quando não há permissão, fazendo a consulta voltar
--     vazia em vez de vazar dado de outro cliente.
--
--     Sem isso, a visão master agregaria TODAS as empresas numa soma só — o RLS
--     da 0007 abriu a leitura, mas quem separa uma empresa da outra é este
--     parâmetro.
--
--  2. jornada_efetiva() — a jornada da pessoa passa a herdar o padrão da
--     empresa quando não há exceção cadastrada.
-- ============================================================================

drop function if exists painel_kpis(timestamptz, timestamptz, uuid, uuid, uuid);
drop function if exists painel_serie(timestamptz, timestamptz, text, uuid, uuid, uuid);
drop function if exists painel_distribuicao(timestamptz, timestamptz, uuid, uuid, int);
drop function if exists painel_ranking_equipes(timestamptz, timestamptz);
drop function if exists painel_ranking_colaboradores(timestamptz, timestamptz, uuid, int);
drop function if exists painel_relatorio_diario(timestamptz, timestamptz, uuid, uuid);
drop function if exists painel_relatorio_aplicativos(timestamptz, timestamptz, uuid, uuid);
drop function if exists painel_tempo_real();

-- ----------------------------------------------------------------------------
--  KPIs consolidados do período
-- ----------------------------------------------------------------------------
create or replace function painel_kpis(
    p_inicio      timestamptz,
    p_fim         timestamptz,
    p_equipe      uuid default null,
    p_colaborador uuid default null,
    p_dispositivo uuid default null,
    p_org         uuid default null
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
    with alvo as (
        select org_em_foco(p_org) as org_id, fuso_da_org(p_org) as fuso
    ),
    janela as (
        select a.org_id, a.fuso,
               (p_inicio at time zone a.fuso)::date as d_ini,
               ((p_fim - interval '1 second') at time zone a.fuso)::date as d_fim
          from alvo a
    ),
    base as (
        select r.*,
               jornada_efetiva(e.jornada_minutos_dia, o.jornada_padrao_minutos) as jornada
          from resumo_diario r
          join employees e on e.id = r.employee_id
          join organizations o on o.id = r.org_id
         cross join janela j
         where r.org_id = j.org_id
           and r.dia between j.d_ini and j.d_fim
           and (p_equipe      is null or e.team_id     = p_equipe)
           and (p_colaborador is null or r.employee_id = p_colaborador)
           and (p_dispositivo is null or r.device_id   = p_dispositivo)
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
    -- Contada uma vez por pessoa/dia, mesmo quando ela usa várias estações.
    jornada as (
        select coalesce(sum(j.jornada), 0) as total
          from (select distinct employee_id, dia, jornada from base) j
    ),
    topo as (
        select a.alvo
          from resumo_app_diario a
          join employees e on e.id = a.employee_id
         cross join janela j
         where a.org_id = j.org_id
           and a.dia between j.d_ini and j.d_fim
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
--  Série temporal
-- ----------------------------------------------------------------------------
create or replace function painel_serie(
    p_inicio      timestamptz,
    p_fim         timestamptz,
    p_bucket      text default 'day',
    p_equipe      uuid default null,
    p_colaborador uuid default null,
    p_dispositivo uuid default null,
    p_org         uuid default null
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
    with alvo as (select org_em_foco(p_org) as org_id, fuso_da_org(p_org) as fuso),
    horario as (
        select
            date_trunc('hour', r.hora at time zone a.fuso) at time zone a.fuso as balde,
            sum(r.minutos_ativos)::bigint                         as minutos_ativos,
            sum(r.minutos_ociosos + r.minutos_bloqueado)::bigint  as minutos_ociosos,
            sum(r.minutos_produtivos)::bigint                     as minutos_produtivos,
            sum(r.minutos_neutros)::bigint                        as minutos_neutros,
            sum(r.minutos_improdutivos)::bigint                   as minutos_improdutivos
          from resumo_horario r
          join employees e on e.id = r.employee_id
         cross join alvo a
         where p_bucket = 'hour'
           and r.org_id = a.org_id
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
            ) at time zone a.fuso as balde,
            sum(r.minutos_ativos)::bigint                         as minutos_ativos,
            sum(r.minutos_ociosos + r.minutos_bloqueado)::bigint  as minutos_ociosos,
            sum(r.minutos_produtivos)::bigint                     as minutos_produtivos,
            sum(r.minutos_neutros)::bigint                        as minutos_neutros,
            sum(r.minutos_improdutivos)::bigint                   as minutos_improdutivos
          from resumo_diario r
          join employees e on e.id = r.employee_id
         cross join alvo a
         where p_bucket <> 'hour'
           and r.org_id = a.org_id
           and r.dia between (p_inicio at time zone a.fuso)::date
                         and ((p_fim - interval '1 second') at time zone a.fuso)::date
           and (p_equipe      is null or e.team_id     = p_equipe)
           and (p_colaborador is null or r.employee_id = p_colaborador)
           and (p_dispositivo is null or r.device_id   = p_dispositivo)
         group by 1
    ),
    uniao as (select * from horario union all select * from diario)
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
    p_limite      int  default 10,
    p_org         uuid default null
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
    with a as (select org_em_foco(p_org) as org_id, fuso_da_org(p_org) as fuso)
    select
        d.alvo,
        max(d.tipo),
        sum(d.minutos)::bigint,
        count(distinct d.employee_id)::bigint
      from resumo_app_diario d
      join employees e on e.id = d.employee_id
     cross join a
     where d.org_id = a.org_id
       and d.dia between (p_inicio at time zone a.fuso)::date
                     and ((p_fim - interval '1 second') at time zone a.fuso)::date
       and (p_equipe      is null or e.team_id     = p_equipe)
       and (p_colaborador is null or d.employee_id = p_colaborador)
     group by d.alvo
     order by sum(d.minutos) desc
     limit greatest(p_limite, 1);
$$;

-- ----------------------------------------------------------------------------
--  Ranking por equipe
-- ----------------------------------------------------------------------------
create or replace function painel_ranking_equipes(
    p_inicio timestamptz,
    p_fim    timestamptz,
    p_org    uuid default null
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
    with a as (select org_em_foco(p_org) as org_id, fuso_da_org(p_org) as fuso),
    base as (
        select r.*, e.team_id,
               jornada_efetiva(e.jornada_minutos_dia, o.jornada_padrao_minutos) as jornada
          from resumo_diario r
          join employees e on e.id = r.employee_id
          join organizations o on o.id = r.org_id
         cross join a
         where r.org_id = a.org_id
           and r.dia between (p_inicio at time zone a.fuso)::date
                         and ((p_fim - interval '1 second') at time zone a.fuso)::date
    ),
    jornada as (
        select team_id, sum(jornada) as esperado
          from (select distinct team_id, employee_id, dia, jornada from base) j
         group by team_id
    )
    select
        t.id, t.nome, t.cor,
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
     cross join a
      left join base b on b.team_id = t.id
      left join jornada j on j.team_id = t.id
     where t.ativa and t.org_id = a.org_id
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
    p_limite int  default 100,
    p_org    uuid default null
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
    with a as (select org_em_foco(p_org) as org_id, fuso_da_org(p_org) as fuso),
    base as (
        select r.*
          from resumo_diario r
         cross join a
         where r.org_id = a.org_id
           and r.dia between (p_inicio at time zone a.fuso)::date
                         and ((p_fim - interval '1 second') at time zone a.fuso)::date
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
                / (count(distinct b.dia)
                   * jornada_efetiva(e.jornada_minutos_dia, o.jornada_padrao_minutos)), 1)
        end
      from employees e
     cross join a
      join organizations o on o.id = e.org_id
      left join teams t on t.id = e.team_id
      left join base b on b.employee_id = e.id
     where e.ativo
       and e.org_id = a.org_id
       and (p_equipe is null or e.team_id = p_equipe)
     group by e.id, e.nome, e.os_user, e.cargo, e.jornada_minutos_dia,
              o.jornada_padrao_minutos, t.id, t.nome
     order by 7 desc
     limit greatest(p_limite, 1);
$$;

-- ----------------------------------------------------------------------------
--  Relatório dia a dia
-- ----------------------------------------------------------------------------
create or replace function painel_relatorio_diario(
    p_inicio      timestamptz,
    p_fim         timestamptz,
    p_equipe      uuid default null,
    p_colaborador uuid default null,
    p_org         uuid default null
)
returns table (
    dia                     date,
    equipe                  text,
    colaborador             text,
    cargo                   text,
    minutos_registrados     bigint,
    minutos_ativos          bigint,
    minutos_ociosos         bigint,
    minutos_produtivos      bigint,
    minutos_neutros         bigint,
    minutos_improdutivos    bigint,
    minutos_sem_classificar bigint,
    teclas                  bigint,
    cliques                 bigint,
    indice                  numeric,
    primeiro_sinal          timestamptz,
    ultimo_sinal            timestamptz
)
language sql
stable
as $$
    with a as (select org_em_foco(p_org) as org_id, fuso_da_org(p_org) as fuso)
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
     cross join a
     where r.org_id = a.org_id
       and r.dia between (p_inicio at time zone a.fuso)::date
                     and ((p_fim - interval '1 second') at time zone a.fuso)::date
       and (p_equipe      is null or e.team_id     = p_equipe)
       and (p_colaborador is null or r.employee_id = p_colaborador)
     group by r.dia, t.nome, e.nome, e.os_user, e.cargo
     order by r.dia, 3;
$$;

-- ----------------------------------------------------------------------------
--  Relatório por aplicativo
-- ----------------------------------------------------------------------------
create or replace function painel_relatorio_aplicativos(
    p_inicio      timestamptz,
    p_fim         timestamptz,
    p_equipe      uuid default null,
    p_colaborador uuid default null,
    p_org         uuid default null
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
    with a as (select org_em_foco(p_org) as org_id, fuso_da_org(p_org) as fuso)
    select
        d.alvo,
        case max(d.tipo)
            when 'PRODUCTIVE'   then 'Produtivo'
            when 'NEUTRAL'      then 'Neutro'
            when 'UNPRODUCTIVE' then 'Improdutivo'
            else 'Sem classificação'
        end,
        coalesce(t.nome, 'Sem equipe'),
        coalesce(e.nome, e.os_user),
        sum(d.minutos)::bigint,
        sum(d.teclas)::bigint,
        sum(d.cliques)::bigint
      from resumo_app_diario d
      join employees e on e.id = d.employee_id
      left join teams t on t.id = e.team_id
     cross join a
     where d.org_id = a.org_id
       and d.dia between (p_inicio at time zone a.fuso)::date
                     and ((p_fim - interval '1 second') at time zone a.fuso)::date
       and (p_equipe      is null or e.team_id     = p_equipe)
       and (p_colaborador is null or d.employee_id = p_colaborador)
     group by d.alvo, t.nome, e.nome, e.os_user
     order by 5 desc;
$$;

-- ----------------------------------------------------------------------------
--  Tempo real
-- ----------------------------------------------------------------------------
create or replace function painel_tempo_real(p_org uuid default null)
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
       and e.org_id = org_em_foco(p_org)
     order by e.id, l."timestamp" desc nulls last;
$$;
