-- ============================================================================
--  0037 — Consultas das telas do redesenho
--
--  Tudo o que as telas novas mostram e que as RPCs anteriores não entregavam
--  sem buscar tudo e filtrar no navegador: lista de pessoas paginada no banco,
--  catálogo de aplicativos do período com a regra vigente, jornada com primeiro
--  e último registro de verdade (minuto, não hora) e as sessões de um dia.
--
--  Nenhuma conta nova de expediente aqui: índice, cobertura e atividade fora da
--  escala vêm sempre de painel_produtividade_diaria (0036).
-- ============================================================================

-- ----------------------------------------------------------------------------
--  1. Pessoas: lista paginada e contagens do topo
-- ----------------------------------------------------------------------------
create or replace function painel_pessoas_lista(
    p_inicio       timestamptz,
    p_fim          timestamptz,
    p_org          uuid default null,
    p_equipe       uuid default null,
    p_busca        text default null,
    -- todas | com_registro | sem_registro | pendente | inativas
    p_situacao     text default 'todas',
    -- nome | equipe | indice | ativos | cobertura | ultimo
    p_ordem        text default 'nome',
    p_decrescente  boolean default false,
    p_limite       int  default 25,
    p_deslocamento int  default 0
)
returns table (
    colaborador_id      uuid,
    nome                text,
    os_user             text,
    cargo               text,
    email               text,
    equipe_id           uuid,
    equipe              text,
    ativo               boolean,
    perfil_completo     boolean,
    minutos_expediente  numeric,
    minutos_registrados numeric,
    minutos_ativos      numeric,
    minutos_ativos_fora numeric,
    indice              numeric,
    cobertura           numeric,
    aproximado          boolean,
    ultimo_registro     timestamptz,
    total               bigint
)
language sql
stable
as $$
    with a as (select org_em_foco(p_org) as org_id),
    prod as (
        select * from painel_produtividade(p_inicio, p_fim, p_org, p_equipe, null)
    ),
    base as (
        select
            e.id, coalesce(e.nome, e.os_user) as nome, e.os_user, e.cargo, e.email,
            e.team_id, t.nome as equipe, e.ativo, e.perfil_completo,
            p.minutos_expediente, p.minutos_registrados, p.minutos_ativos, p.minutos_ativos_fora,
            p.indice, p.aderencia as cobertura, coalesce(p.aproximado, false) as aproximado,
            coalesce(
                (select max(l."timestamp") from activity_logs l where l.employee_id = e.id),
                (select max(b.inicio + make_interval(mins => b.duracao_min))
                   from resumo_pessoa_15min b where b.employee_id = e.id)
            ) as ultimo_registro,
            (coalesce(p.minutos_registrados, 0) + coalesce(p.minutos_ativos_fora, 0)) > 0 as tem_registro
          from employees e
          cross join a
          left join teams t on t.id = e.team_id
          left join prod p on p.colaborador_id = e.id
         where e.org_id = a.org_id
           and (p_equipe is null or e.team_id = p_equipe)
           and (
                p_busca is null or p_busca = ''
             or coalesce(e.nome, '') ilike '%' || p_busca || '%'
             or e.os_user ilike '%' || p_busca || '%'
             or coalesce(e.email, '') ilike '%' || p_busca || '%'
           )
    ),
    filtrado as (
        select * from base
         where case coalesce(p_situacao, 'todas')
                 when 'inativas'     then not ativo
                 when 'com_registro' then ativo and tem_registro
                 when 'sem_registro' then ativo and not tem_registro
                 when 'pendente'     then ativo and (not perfil_completo or team_id is null)
                 else ativo
               end
    )
    select id, nome, os_user, cargo, email, team_id, equipe, ativo, perfil_completo,
           minutos_expediente, minutos_registrados, minutos_ativos, minutos_ativos_fora,
           indice, cobertura, aproximado, ultimo_registro,
           count(*) over ()
      from filtrado
     order by
        case when not p_decrescente then
            case p_ordem when 'equipe' then coalesce(equipe, '') else null end end asc nulls last,
        case when p_decrescente then
            case p_ordem when 'equipe' then coalesce(equipe, '') else null end end desc nulls last,
        case when not p_decrescente then
            case p_ordem when 'indice' then indice when 'ativos' then minutos_ativos
                         when 'cobertura' then cobertura else null end end asc nulls last,
        case when p_decrescente then
            case p_ordem when 'indice' then indice when 'ativos' then minutos_ativos
                         when 'cobertura' then cobertura else null end end desc nulls last,
        case when not p_decrescente and p_ordem = 'ultimo' then ultimo_registro end asc nulls last,
        case when p_decrescente and p_ordem = 'ultimo' then ultimo_registro end desc nulls last,
        nome
     limit greatest(1, least(p_limite, 200))
    offset greatest(p_deslocamento, 0);
$$;

comment on function painel_pessoas_lista is
    'Pessoas da empresa com as métricas do período (fonte única), último registro recebido e situação do cadastro. Busca, filtro, ordenação e paginação no banco.';

create or replace function painel_pessoas_contagem(
    p_inicio timestamptz,
    p_fim    timestamptz,
    p_org    uuid default null,
    p_equipe uuid default null
)
returns table (
    cadastradas  bigint,
    com_registro bigint,
    sem_registro bigint,
    pendentes    bigint,
    sem_equipe   bigint,
    inativas     bigint
)
language sql
stable
as $$
    with a as (select org_em_foco(p_org) as org_id),
    prod as (
        select colaborador_id,
               (minutos_registrados + minutos_ativos_fora) > 0 as tem_registro
          from painel_produtividade(p_inicio, p_fim, p_org, p_equipe, null)
    )
    select
        count(*) filter (where e.ativo),
        count(*) filter (where e.ativo and coalesce(p.tem_registro, false)),
        count(*) filter (where e.ativo and not coalesce(p.tem_registro, false)),
        count(*) filter (where e.ativo and (not e.perfil_completo or e.team_id is null)),
        count(*) filter (where e.ativo and e.team_id is null),
        count(*) filter (where not e.ativo)
      from employees e
      cross join a
      left join prod p on p.colaborador_id = e.id
     where e.org_id = a.org_id
       and (p_equipe is null or e.team_id = p_equipe);
$$;

-- ----------------------------------------------------------------------------
--  2. Aplicativos e sites do período
-- ----------------------------------------------------------------------------
create or replace function eh_site(p_alvo text)
returns boolean
language sql
immutable
as $$
    -- Mesma heurística de painel_dominios (0026): site tem ponto e não é .exe.
    select p_alvo like '%.%' and p_alvo not ilike '%.exe';
$$;

create or replace function painel_aplicativos_lista(
    p_inicio       timestamptz,
    p_fim          timestamptz,
    p_org          uuid default null,
    p_equipe       uuid default null,
    p_colaborador  uuid default null,
    -- todos | aplicativos | sites | sem
    p_filtro       text default 'todos',
    p_busca        text default null,
    p_limite       int  default 25,
    p_deslocamento int  default 0
)
returns table (
    alvo            text,
    eh_site         boolean,
    tipo            categoria_produtividade,
    mapeamento_id   uuid,
    categoria_id    uuid,
    categoria_nome  text,
    regra_por       text,
    minutos         bigint,
    pessoas         bigint,
    dias            bigint,
    total           bigint
)
language sql
stable
as $$
    with a as (select org_em_foco(p_org) as org_id, fuso_da_org(p_org) as fuso),
    uso as (
        select r.alvo,
               max(r.tipo) as tipo,
               sum(r.minutos)::bigint as minutos,
               count(distinct r.employee_id)::bigint as pessoas,
               count(distinct r.dia)::bigint as dias
          from resumo_app_diario r
          cross join a
          join employees e on e.id = r.employee_id
         where r.org_id = a.org_id
           and r.dia between (p_inicio at time zone a.fuso)::date
                         and ((p_fim - interval '1 second') at time zone a.fuso)::date
           and (p_equipe is null or e.team_id = p_equipe)
           and (p_colaborador is null or e.id = p_colaborador)
         group by r.alvo
        having sum(r.minutos) > 0
    ),
    filtrado as (
        select u.*, eh_site(u.alvo) as site
          from uso u
         where case coalesce(p_filtro, 'todos')
                 when 'aplicativos' then not eh_site(u.alvo)
                 when 'sites'       then eh_site(u.alvo)
                 when 'sem'         then u.tipo is null
                 else true
               end
           and (p_busca is null or p_busca = '' or u.alvo ilike '%' || p_busca || '%')
    )
    select f.alvo, f.site, f.tipo, regra.id, regra.category_id, c.name,
           case when regra.id is null then null
                when regra.domain is not null then 'dominio' else 'processo' end,
           f.minutos, f.pessoas, f.dias,
           count(*) over ()
      from filtrado f
      cross join a
      -- Regra própria deste alvo, se houver (domínio antes de processo).
      left join lateral (
          select m.id, m.category_id, m.domain
            from app_mappings m
           where m.org_id = a.org_id
             and (lower(m.domain) = lower(f.alvo) or lower(m.process_name) = lower(f.alvo))
           order by (m.domain is not null) desc, m.created_at, m.id
           limit 1
      ) regra on true
      left join productivity_categories c on c.id = regra.category_id
     order by f.minutos desc, f.alvo
     limit greatest(1, least(p_limite, 500))
    offset greatest(p_deslocamento, 0);
$$;

comment on function painel_aplicativos_lista is
    'Aplicativos e sites usados no período com tempo, pessoas e dias. tipo é a categoria efetiva na consolidação; regra_por diz se o alvo tem regra própria. Paginado no banco.';

create or replace function painel_aplicativos_resumo(
    p_inicio      timestamptz,
    p_fim         timestamptz,
    p_org         uuid default null,
    p_equipe      uuid default null,
    p_colaborador uuid default null
)
returns table (
    identificados         bigint,
    classificados         bigint,
    sem_classificacao     bigint,
    aplicativos           bigint,
    sites                 bigint,
    qtd_produtivo         bigint,
    qtd_neutro            bigint,
    qtd_improdutivo       bigint,
    minutos_total         bigint,
    minutos_produtivo     bigint,
    minutos_neutro        bigint,
    minutos_improdutivo   bigint,
    minutos_sem           bigint
)
language sql
stable
as $$
    with u as (
        select * from painel_aplicativos_lista(p_inicio, p_fim, p_org, p_equipe, p_colaborador, 'todos', null, 500, 0)
    )
    select
        count(*), count(*) filter (where tipo is not null), count(*) filter (where tipo is null),
        count(*) filter (where not eh_site), count(*) filter (where eh_site),
        count(*) filter (where tipo = 'PRODUCTIVE'), count(*) filter (where tipo = 'NEUTRAL'),
        count(*) filter (where tipo = 'UNPRODUCTIVE'),
        coalesce(sum(minutos), 0)::bigint,
        coalesce(sum(minutos) filter (where tipo = 'PRODUCTIVE'), 0)::bigint,
        coalesce(sum(minutos) filter (where tipo = 'NEUTRAL'), 0)::bigint,
        coalesce(sum(minutos) filter (where tipo = 'UNPRODUCTIVE'), 0)::bigint,
        coalesce(sum(minutos) filter (where tipo is null), 0)::bigint
      from u;
$$;

-- ----------------------------------------------------------------------------
--  3. Jornada: escala prevista x telemetria
-- ----------------------------------------------------------------------------
create or replace function painel_jornada_pessoas(
    p_inicio      timestamptz,
    p_fim         timestamptz,
    p_org         uuid default null,
    p_equipe      uuid default null,
    p_colaborador uuid default null
)
returns table (
    colaborador_id          uuid,
    colaborador             text,
    equipe_id               uuid,
    equipe                  text,
    escala                  text,
    dias_com_expediente     int,
    dias_com_registro       int,
    minutos_expediente      numeric,
    minutos_registrados     numeric,
    minutos_ativos_fora     numeric,
    cobertura               numeric,
    primeiro_registro_medio numeric,
    ultimo_registro_medio   numeric,
    horarios_por_bloco      boolean,
    aproximado              boolean
)
language sql
stable
as $$
    with a as (select org_em_foco(p_org) as org_id, fuso_da_org(p_org) as fuso),
    diaria as (
        select * from painel_produtividade_diaria(p_inicio, p_fim, p_org, p_equipe, p_colaborador)
    ),
    -- Primeiro e último minuto registrados, do dado cru (exato).
    cru as (
        select l.employee_id, (l."timestamp" at time zone a.fuso)::date as dia,
               min(l."timestamp") as primeiro, max(l."timestamp") as ultimo
          from activity_logs l
          cross join a
         where l.org_id = a.org_id
           and l."timestamp" >= p_inicio and l."timestamp" < p_fim
           and l.employee_id in (select distinct colaborador_id from diaria)
         group by 1, 2
    ),
    -- Onde o dado cru já saiu pela retenção, o bloco de 15 min dá a faixa.
    blocos as (
        select b.employee_id, (b.inicio at time zone a.fuso)::date as dia,
               min(b.inicio) as primeiro,
               max(b.inicio + make_interval(mins => b.duracao_min)) as ultimo
          from resumo_pessoa_15min b
          cross join a
         where b.org_id = a.org_id
           and b.inicio >= p_inicio and b.inicio < p_fim
           and b.employee_id in (select distinct colaborador_id from diaria)
         group by 1, 2
    ),
    dias as (
        select d.*,
               coalesce(c.primeiro, bl.primeiro) as primeiro,
               coalesce(c.ultimo, bl.ultimo) as ultimo,
               c.primeiro is null and bl.primeiro is not null as por_bloco
          from diaria d
          left join cru c on c.employee_id = d.colaborador_id and c.dia = d.dia
          left join blocos bl on bl.employee_id = d.colaborador_id and bl.dia = d.dia
    ),
    escala_frequente as (
        select distinct on (colaborador_id) colaborador_id,
               to_char(escala_inicio, 'HH24:MI') || '–' || to_char(escala_fim, 'HH24:MI')
               || coalesce(' · intervalo ' || to_char(intervalo_inicio, 'HH24:MI') || '–'
                                           || to_char(intervalo_fim, 'HH24:MI'), '') as texto
          from diaria
         where trabalha
         group by colaborador_id, escala_inicio, escala_fim, intervalo_inicio, intervalo_fim
         order by colaborador_id, count(*) desc
    )
    select
        d.colaborador_id, d.colaborador, d.equipe_id, d.equipe,
        coalesce(ef.texto, 'Sem expediente no período'),
        (count(*) filter (where d.minutos_expediente > 0))::int,
        (count(*) filter (where d.primeiro is not null))::int,
        sum(d.minutos_expediente),
        sum(d.minutos_registrados),
        sum(d.minutos_ativos_fora),
        case when sum(d.minutos_expediente) > 0
             then round(least(sum(d.minutos_registrados), sum(d.minutos_expediente)) * 100.0
                        / sum(d.minutos_expediente), 1) end,
        round(avg(extract(epoch from (d.primeiro at time zone a.fuso)::time) / 60)
              filter (where d.primeiro is not null), 0),
        round(avg(extract(epoch from (d.ultimo at time zone a.fuso)::time) / 60)
              filter (where d.ultimo is not null), 0),
        coalesce(bool_or(d.por_bloco), false),
        bool_or(d.aproximado)
      from dias d
      cross join a
      left join escala_frequente ef on ef.colaborador_id = d.colaborador_id
     group by d.colaborador_id, d.colaborador, d.equipe_id, d.equipe, ef.texto
     order by d.colaborador;
$$;

comment on function painel_jornada_pessoas is
    'Jornada por pessoa: escala mais frequente, expediente previsto, tempo registrado dentro dele, atividade fora da escala e horário médio do primeiro e do último registro. Registro não é marcação de ponto.';

create or replace function painel_jornada_dia(
    p_dia         date,
    p_org         uuid default null,
    p_equipe      uuid default null,
    p_colaborador uuid default null
)
returns table (
    colaborador_id      uuid,
    colaborador         text,
    equipe              text,
    trabalha            boolean,
    escala_inicio       time,
    escala_fim          time,
    intervalo_inicio    time,
    intervalo_fim       time,
    minutos_expediente  numeric,
    minutos_registrados numeric,
    minutos_ativos_fora numeric,
    primeiro_registro   timestamptz,
    ultimo_registro     timestamptz,
    -- [[minuto_do_dia, minutos_registrados, minutos_ativos], ...] em blocos de 15 min
    blocos              jsonb
)
language sql
stable
as $$
    with a as (select org_em_foco(p_org) as org_id, fuso_da_org(p_org) as fuso),
    janela as (
        select (p_dia::timestamp at time zone a.fuso) as inicio,
               ((p_dia + 1)::timestamp at time zone a.fuso) as fim
          from a
    ),
    diaria as (
        select d.* from janela j
        cross join lateral painel_produtividade_diaria(j.inicio, j.fim, p_org, p_equipe, p_colaborador) d
    )
    select
        d.colaborador_id, d.colaborador, d.equipe, d.trabalha,
        d.escala_inicio, d.escala_fim, d.intervalo_inicio, d.intervalo_fim,
        d.minutos_expediente, d.minutos_registrados, d.minutos_ativos_fora,
        (select min(l."timestamp") from activity_logs l, janela j
          where l.employee_id = d.colaborador_id and l."timestamp" >= j.inicio and l."timestamp" < j.fim),
        (select max(l."timestamp") from activity_logs l, janela j
          where l.employee_id = d.colaborador_id and l."timestamp" >= j.inicio and l."timestamp" < j.fim),
        coalesce((
            select jsonb_agg(jsonb_build_array(
                       round(extract(epoch from (b.inicio at time zone a.fuso)::time) / 60),
                       b.minutos_registrados, b.minutos_ativos) order by b.inicio)
              from resumo_pessoa_15min b, janela j
             where b.employee_id = d.colaborador_id and b.inicio >= j.inicio and b.inicio < j.fim
        ), '[]'::jsonb)
      from diaria d
      cross join a
     order by d.colaborador;
$$;

comment on function painel_jornada_dia is
    'Um dia de jornada por pessoa: escala do dia, blocos de 15 min com registro e primeiro/último registro do dado cru. Alimenta o comparativo visual de jornada.';

-- ----------------------------------------------------------------------------
--  4. Sessões de um dia: minutos consecutivos do mesmo aplicativo e estado
-- ----------------------------------------------------------------------------
create or replace function painel_sessoes(
    p_colaborador uuid,
    p_inicio      timestamptz,
    p_fim         timestamptz,
    p_dispositivo uuid default null,
    p_limite      int  default 200
)
returns table (
    inicio  timestamptz,
    fim     timestamptz,
    alvo    text,
    tipo    categoria_produtividade,
    estado  text,
    minutos int,
    maquina text
)
language sql
stable
as $$
    with m as (
        select c.minuto, c.alvo, c.tipo, c.estado, c.device_id
          from classificar_minutos(p_inicio, p_fim) c
         where c.employee_id = p_colaborador
           and (p_dispositivo is null or c.device_id = p_dispositivo)
    ),
    -- Com duas estações no mesmo minuto vale a ativa (mesma regra de minutos_pessoa).
    unico as (
        select distinct on (minuto) *
          from m
         order by minuto, (estado = 'ATIVO') desc, (estado = 'OCIOSO') desc, (tipo is null) asc, device_id
    ),
    marcado as (
        select *,
               case when lag(alvo) over w = alvo
                     and lag(estado) over w = estado
                     and lag(minuto) over w = minuto - interval '1 minute'
                    then 0 else 1 end as novo
          from unico
        window w as (order by minuto)
    ),
    grupos as (
        select *, sum(novo) over (order by minuto) as grupo from marcado
    )
    select min(g.minuto), max(g.minuto) + interval '1 minute', g.alvo, max(g.tipo), g.estado,
           count(*)::int, max(d.machine_name)
      from grupos g
      left join devices d on d.id = g.device_id
     group by g.grupo, g.alvo, g.estado
     order by min(g.minuto)
     limit greatest(1, least(p_limite, 1000));
$$;

comment on function painel_sessoes is
    'Atividade de uma pessoa agrupada em sessões (mesmo aplicativo e estado em minutos seguidos). Só existe dentro da retenção do dado cru.';
