-- ============================================================================
--  0036 — Métricas coerentes: uma pessoa, um minuto, uma régua
--
--  Revisão das métricas feita junto com o redesenho do painel (16/09/2026).
--  Seis defeitos, todos reproduzidos em teste (supabase/testes/metricas.test.mjs)
--  antes de corrigir:
--
--  1. HORA EM ANDAMENTO DESCONTADA DUAS VEZES. painel_produtividade rateava o
--     agregado da hora pela fração da hora que caía no expediente, SEMPRE sobre
--     60 minutos. Às 10h30, com expediente começando às 10h, a hora 10–11 tem
--     só 30 minutos de dado — e eles eram divididos por dois de novo.
--     30 minutos produtivos em 30 de expediente davam 50%, não 100%.
--     Agora o rateio é sobre a parte do bloco que já PODIA ter dado.
--
--  2. FRONTEIRA DE MEIA HORA. Com blocos de hora, uma escala que começa às
--     08:30 obriga a adivinhar de que lado da fronteira caíram os minutos.
--     O resumo por pessoa passa a ser de 15 em 15 minutos: escalas em :00, :15,
--     :30 e :45 ficam exatas. Horário fora disso continua rateado — e a linha
--     sai marcada como "aproximado", para a tela poder dizer.
--
--  3. DUAS ESTAÇÕES, O DOBRO DE TEMPO. resumo_horario é por estação, e o índice
--     somava as estações da pessoa. Quem tinha notebook e desktop ligados juntos
--     ganhava 120 minutos numa hora. O resumo por pessoa resolve o minuto antes
--     de somar: um minuto da pessoa vale um, com prioridade para o estado ativo
--     e classificado (a mesma da linha do tempo, 0024). Os minutos em que houve
--     mais de uma estação ficam contados à parte, para aparecer como aviso.
--
--  4. APLICATIVOS PERDENDO HORAS. A consolidação incremental apagava o dia
--     inteiro de resumo_app_diario e repunha só as horas da janela recente
--     (últimas 3h). Cada rodada jogava fora o uso da manhã.
--
--  5. INDICADOR POR CAMINHOS DIFERENTES. Índice, horas fora da escala e série
--     faziam contas parecidas em lugares diferentes. Agora existe UMA função por
--     pessoa e por dia (painel_produtividade_diaria) e as outras agregam a partir
--     dela — inclusive o relatório exportado.
--
--  6. ATRASO DE ENVIO COM NÚMERO FIXO. O aviso de estação parada usava 24h para
--     toda empresa, e o painel chegou a sugerir 15 min. O limiar agora é o mesmo
--     que derruba a estação para offline (0015): 2,5 × o intervalo de envio da
--     empresa, com piso de 10 minutos — definido numa função só.
-- ============================================================================

-- ----------------------------------------------------------------------------
--  1. Classificação minuto a minuto (fonte única, agora com o minuto exposto)
-- ----------------------------------------------------------------------------
create or replace function classificar_minutos(p_inicio timestamptz, p_fim timestamptz)
returns table (
    org_id             uuid,
    employee_id        uuid,
    device_id          uuid,
    minuto             timestamptz,
    alvo               text,
    tipo               categoria_produtividade,
    estado             text,
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
        date_trunc('minute', l."timestamp"),
        coalesce(nullif(l.domain, ''), l.process_name),
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
      -- Mesma regra da 0019: uma regra por minuto, domínio antes de processo.
      left join lateral (
          select m.category_id
            from app_mappings m
           where m.org_id = l.org_id
             and (
                   (m.domain is not null and l.domain is not null
                        and lower(m.domain) = lower(l.domain))
                or (m.process_name is not null
                        and lower(m.process_name) = lower(l.process_name))
                 )
           order by
               (m.domain is not null and l.domain is not null
                    and lower(m.domain) = lower(l.domain)) desc,
               m.created_at,
               m.id
           limit 1
      ) regra on true
      left join productivity_categories c on c.id = regra.category_id
     where l."timestamp" >= p_inicio
       and l."timestamp" <  p_fim
       and l.employee_id is not null;
$$;

comment on function classificar_minutos is
    'Fonte única da classificação: uma linha por registro de atividade (estação × minuto), com a regra mais específica (domínio vence processo).';

-- classificar_atividade continua existindo com a mesma saída, só que em cima da
-- fonte única — nada de segunda cópia da regra de classificação.
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
    select c.org_id, c.employee_id, c.device_id,
           date_trunc('hour', c.minuto at time zone o.fuso) at time zone o.fuso,
           c.alvo, c.tipo, c.estado,
           c.keystrokes_count, c.mouse_clicks_count, c.scroll_count, c.active_seconds
      from classificar_minutos(p_inicio, p_fim) c
      join organizations o on o.id = c.org_id;
$$;

-- ----------------------------------------------------------------------------
--  2. O minuto da PESSOA: estações resolvidas antes de somar
-- ----------------------------------------------------------------------------
create or replace function minutos_pessoa(p_inicio timestamptz, p_fim timestamptz)
returns table (
    org_id             uuid,
    employee_id        uuid,
    minuto             timestamptz,
    alvo               text,
    tipo               categoria_produtividade,
    estado             text,
    keystrokes_count   int,
    mouse_clicks_count int,
    estacoes           int
)
language sql
stable
as $$
    select distinct on (c.employee_id, c.minuto)
           c.org_id, c.employee_id, c.minuto, c.alvo, c.tipo, c.estado,
           c.keystrokes_count, c.mouse_clicks_count,
           (count(*) over (partition by c.employee_id, c.minuto))::int
      from classificar_minutos(p_inicio, p_fim) c
     order by c.employee_id, c.minuto,
              -- Quem está ativo numa máquina está ativo: o ocioso da outra não
              -- apaga o trabalho. Depois, minuto classificado antes de não
              -- classificado; o resto é desempate estável.
              (c.estado = 'ATIVO') desc,
              (c.estado = 'OCIOSO') desc,
              (c.tipo is null) asc,
              c.active_seconds desc,
              c.device_id,
              c.alvo;
$$;

comment on function minutos_pessoa is
    'Uma linha por pessoa × minuto. Com duas estações no mesmo minuto vale a que estava ativa (e classificada); estacoes conta quantas enviaram.';

-- ----------------------------------------------------------------------------
--  3. Resumo por pessoa em blocos de 15 minutos
-- ----------------------------------------------------------------------------
create table if not exists resumo_pessoa_15min (
    org_id      uuid not null references organizations(id) on delete cascade,
    employee_id uuid not null references employees(id) on delete cascade,
    -- Início do bloco. Alinhado em 15 min UTC, que é quarto de hora em qualquer
    -- fuso real (inclusive os de meia hora).
    inicio      timestamptz not null,
    -- 15 para blocos montados do dado cru; 60 para horas antigas reconstruídas
    -- de resumo_horario, quando o dado cru já tinha saído pela retenção.
    duracao_min smallint not null default 15 check (duracao_min in (15, 60)),

    minutos_registrados     numeric not null default 0,
    minutos_ativos          numeric not null default 0,
    minutos_ociosos         numeric not null default 0,
    minutos_bloqueado       numeric not null default 0,
    minutos_produtivos      numeric not null default 0,
    minutos_neutros         numeric not null default 0,
    minutos_improdutivos    numeric not null default 0,
    minutos_sem_classificar numeric not null default 0,
    -- Minutos em que mais de uma estação da pessoa mandou registro.
    minutos_sobrepostos     numeric not null default 0,

    atualizado_em timestamptz not null default now(),
    primary key (org_id, employee_id, inicio)
);

create index if not exists idx_resumo_pessoa_emp_inicio on resumo_pessoa_15min(employee_id, inicio desc);
create index if not exists idx_resumo_pessoa_org_inicio on resumo_pessoa_15min(org_id, inicio desc);

alter table resumo_pessoa_15min enable row level security;

drop policy if exists resumo_pessoa_select on resumo_pessoa_15min;
create policy resumo_pessoa_select on resumo_pessoa_15min
    for select using (
        eh_admin_plataforma()
        or (
            org_id = auth_org_id()
            and (
                auth_escopo_equipe() is null
                or employee_id in (select id from employees where team_id = auth_escopo_equipe())
            )
        )
    );

comment on table resumo_pessoa_15min is
    'Tempo da pessoa (estações já resolvidas) em blocos de 15 min. Base do índice, da cobertura e da atividade fora da escala.';

create or replace function bloco_15min(p_ts timestamptz)
returns timestamptz
language sql
immutable
as $$
    select date_bin('15 minutes', p_ts, timestamptz '2000-01-01 00:00:00+00');
$$;

-- Monta os blocos a partir do dado cru. Quem chama decide quais blocos refazer
-- (via _blocos_alvo) e já apagou os antigos.
create or replace function montar_blocos_pessoa(p_inicio timestamptz, p_fim timestamptz)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
    v_linhas bigint;
begin
    insert into resumo_pessoa_15min (
        org_id, employee_id, inicio, duracao_min,
        minutos_registrados, minutos_ativos, minutos_ociosos, minutos_bloqueado,
        minutos_produtivos, minutos_neutros, minutos_improdutivos, minutos_sem_classificar,
        minutos_sobrepostos
    )
    select
        m.org_id, m.employee_id, bloco_15min(m.minuto), 15,
        count(*),
        count(*) filter (where m.estado = 'ATIVO'),
        count(*) filter (where m.estado = 'OCIOSO'),
        count(*) filter (where m.estado = 'BLOQUEADO'),
        count(*) filter (where m.estado = 'ATIVO' and m.tipo = 'PRODUCTIVE'),
        count(*) filter (where m.estado = 'ATIVO' and m.tipo = 'NEUTRAL'),
        count(*) filter (where m.estado = 'ATIVO' and m.tipo = 'UNPRODUCTIVE'),
        count(*) filter (where m.estado = 'ATIVO' and m.tipo is null),
        count(*) filter (where m.estacoes > 1)
      from minutos_pessoa(p_inicio, p_fim) m
      join _blocos_alvo b
        on b.employee_id = m.employee_id
       and b.inicio = bloco_15min(m.minuto)
     group by m.org_id, m.employee_id, bloco_15min(m.minuto);

    get diagnostics v_linhas = row_count;
    return v_linhas;
end;
$$;

-- ----------------------------------------------------------------------------
--  4. Consolidação incremental (reescrita)
-- ----------------------------------------------------------------------------
create table if not exists estado_consolidacao (
    id           boolean primary key default true check (id),
    executado_em timestamptz not null
);

alter table estado_consolidacao enable row level security;
drop policy if exists estado_consolidacao_select on estado_consolidacao;
-- Um horário só, sem dado de empresa nenhuma: qualquer usuário logado lê.
create policy estado_consolidacao_select on estado_consolidacao
    for select to authenticated using (true);

comment on table estado_consolidacao is
    'Quando os resumos foram atualizados pela última vez. O painel mostra isso para não confundir "último envio da estação" com "números atualizados".';

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
    drop table if exists _blocos_alvo;
    drop table if exists _dias_pessoa;

    -- 4.1 Baldes de hora por estação tocados por registros recém-chegados.
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

    insert into estado_consolidacao (id, executado_em) values (true, now())
        on conflict (id) do update set executado_em = excluded.executado_em;

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

    -- 4.2 Dias por estação (resumo_diario sai inteiro de resumo_horario).
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

    -- 4.3 Blocos de 15 min da pessoa tocados pelos registros novos.
    create temp table _blocos_alvo on commit drop as
    select distinct l.org_id, l.employee_id, bloco_15min(l."timestamp") as inicio
      from activity_logs l
     where l.created_at >= v_desde
       and l.employee_id is not null;

    create index on _blocos_alvo (employee_id, inicio);

    delete from resumo_pessoa_15min r
     using _blocos_alvo b
     where r.org_id = b.org_id
       and r.employee_id = b.employee_id
       and r.inicio = b.inicio;

    perform montar_blocos_pessoa(
        (select min(inicio) from _blocos_alvo),
        (select max(inicio) + interval '15 minutes' from _blocos_alvo)
    );

    -- 4.4 Aplicativos: o DIA INTEIRO sai do dado cru, não só a janela recente.
    --     Antes, apagava-se o dia e repunham-se só as últimas horas.
    create temp table _dias_pessoa on commit drop as
    select distinct d.org_id, d.employee_id, d.dia,
           d.dia::timestamp at time zone o.fuso as dia_inicio,
           (d.dia + 1)::timestamp at time zone o.fuso as dia_fim
      from _baldes_dia d
      join organizations o on o.id = d.org_id
     -- Dia que começou antes da retenção não pode ser refeito do dado cru: a
     -- manhã já foi apagada. Fica como estava, em vez de perder o que tinha.
     where d.dia::timestamp at time zone o.fuso >= now() - make_interval(days => o.retencao_dias);

    delete from resumo_app_diario r
     using _dias_pessoa b
     where r.org_id = b.org_id
       and r.employee_id = b.employee_id
       and r.dia = b.dia;

    insert into resumo_app_diario (org_id, employee_id, dia, alvo, tipo, minutos, teclas, cliques)
    select
        m.org_id, m.employee_id, d.dia, m.alvo,
        max(m.tipo), count(*),
        coalesce(sum(m.keystrokes_count), 0),
        coalesce(sum(m.mouse_clicks_count), 0)
      from minutos_pessoa(
               (select min(dia_inicio) from _dias_pessoa),
               (select max(dia_fim) from _dias_pessoa)
           ) m
      join _dias_pessoa d
        on d.employee_id = m.employee_id
       and m.minuto >= d.dia_inicio
       and m.minuto <  d.dia_fim
     where m.estado = 'ATIVO'
     group by m.org_id, m.employee_id, d.dia, m.alvo;

    return query select v_horas, v_dias;
end;
$$;

-- ----------------------------------------------------------------------------
--  5. Reconsolidação sob demanda (classificação mudou) — mesmas regras
-- ----------------------------------------------------------------------------
create or replace function reconsolidar_org(p_org uuid, p_dias int default 90)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
    v_inicio timestamptz;
    v_linhas bigint;
begin
    if not (p_org = auth_org_id() and auth_pode_administrar()) then
        raise exception 'Sem permissão para reconsolidar esta empresa.'
            using errcode = 'insufficient_privilege';
    end if;

    return reconstruir_resumos_org(p_org, p_dias);
end;
$$;

create or replace function reconstruir_resumos_org(p_org uuid, p_dias int default 90)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
    v_fuso   text;
    v_retencao int;
    v_inicio timestamptz;
    v_linhas bigint;
begin
    select fuso, retencao_dias into v_fuso, v_retencao from organizations where id = p_org;
    if v_fuso is null then
        return 0;
    end if;

    -- Não recua além do dado cru disponível: apagar resumo de um dia cujo dado
    -- cru já saiu pela retenção seria perder histórico de vez.
    v_inicio := greatest(
        (date_trunc('day', (now() - make_interval(days => greatest(p_dias, 1))) at time zone v_fuso)
            + interval '1 day') at time zone v_fuso,
        (date_trunc('day', (now() - make_interval(days => v_retencao)) at time zone v_fuso)
            + interval '1 day') at time zone v_fuso
    );

    delete from resumo_horario    where org_id = p_org and hora >= v_inicio;
    delete from resumo_diario     where org_id = p_org and dia  >= (v_inicio at time zone v_fuso)::date;
    delete from resumo_app_diario where org_id = p_org and dia  >= (v_inicio at time zone v_fuso)::date;
    delete from resumo_pessoa_15min where org_id = p_org and inicio >= v_inicio;

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
        h.org_id, h.employee_id, h.device_id, (h.hora at time zone v_fuso)::date,
        sum(h.minutos_registrados), sum(h.minutos_ativos), sum(h.minutos_ociosos),
        sum(h.minutos_bloqueado), sum(h.minutos_produtivos), sum(h.minutos_neutros),
        sum(h.minutos_improdutivos), sum(h.minutos_sem_classificar),
        sum(h.teclas), sum(h.cliques), sum(h.rolagens), sum(h.segundos_ativos),
        min(h.hora), max(h.hora)
      from resumo_horario h
     where h.org_id = p_org and h.hora >= v_inicio
     group by h.org_id, h.employee_id, h.device_id, (h.hora at time zone v_fuso)::date;

    insert into resumo_app_diario (org_id, employee_id, dia, alvo, tipo, minutos, teclas, cliques)
    select
        m.org_id, m.employee_id, (m.minuto at time zone v_fuso)::date, m.alvo,
        max(m.tipo), count(*),
        coalesce(sum(m.keystrokes_count), 0),
        coalesce(sum(m.mouse_clicks_count), 0)
      from minutos_pessoa(v_inicio, now() + interval '1 hour') m
     where m.org_id = p_org
       and m.estado = 'ATIVO'
     group by m.org_id, m.employee_id, (m.minuto at time zone v_fuso)::date, m.alvo;

    drop table if exists _blocos_alvo;
    create temp table _blocos_alvo on commit drop as
    select distinct l.org_id, l.employee_id, bloco_15min(l."timestamp") as inicio
      from activity_logs l
     where l.org_id = p_org
       and l.employee_id is not null
       and l."timestamp" >= v_inicio;

    perform montar_blocos_pessoa(v_inicio, now() + interval '1 hour');

    return v_linhas;
end;
$$;

revoke execute on function reconstruir_resumos_org(uuid, int) from public, anon, authenticated;
revoke execute on function montar_blocos_pessoa(timestamptz, timestamptz) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
--  6. Carga inicial do resumo por pessoa
--
--  Onde ainda há dado cru, os blocos saem dele (15 min, exatos). Horas mais
--  antigas que a retenção só existem em resumo_horario, por estação: viram
--  blocos de 60 min, e se as estações somarem mais de 60 minutos na hora o
--  bloco é reduzido na proporção — a tela marca esse período como aproximado.
-- ----------------------------------------------------------------------------
create or replace function carregar_resumo_pessoa()
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
    v_org   record;
    v_cru   timestamptz;
    v_total bigint := 0;
    v_qtd   bigint;
begin
    for v_org in select id, fuso from organizations loop
        select min("timestamp") into v_cru
          from activity_logs where org_id = v_org.id and employee_id is not null;

        delete from resumo_pessoa_15min where org_id = v_org.id;

        if v_cru is not null then
            drop table if exists _blocos_alvo;
            create temp table _blocos_alvo on commit drop as
            select distinct l.org_id, l.employee_id, bloco_15min(l."timestamp") as inicio
              from activity_logs l
             where l.org_id = v_org.id and l.employee_id is not null;

            v_qtd := montar_blocos_pessoa(bloco_15min(v_cru), now() + interval '1 hour');
            v_total := v_total + v_qtd;
        end if;

        insert into resumo_pessoa_15min (
            org_id, employee_id, inicio, duracao_min,
            minutos_registrados, minutos_ativos, minutos_ociosos, minutos_bloqueado,
            minutos_produtivos, minutos_neutros, minutos_improdutivos, minutos_sem_classificar,
            minutos_sobrepostos
        )
        select
            h.org_id, h.employee_id, h.hora, 60,
            sum(h.minutos_registrados)     * f.escala,
            sum(h.minutos_ativos)          * f.escala,
            sum(h.minutos_ociosos)         * f.escala,
            sum(h.minutos_bloqueado)       * f.escala,
            sum(h.minutos_produtivos)      * f.escala,
            sum(h.minutos_neutros)         * f.escala,
            sum(h.minutos_improdutivos)    * f.escala,
            sum(h.minutos_sem_classificar) * f.escala,
            greatest(0, sum(h.minutos_registrados) - 60)
          from resumo_horario h
          cross join lateral (
              select case when sum(h2.minutos_registrados) > 60
                          then 60.0 / sum(h2.minutos_registrados) else 1.0 end as escala
                from resumo_horario h2
               where h2.org_id = h.org_id and h2.employee_id = h.employee_id and h2.hora = h.hora
          ) f
         where h.org_id = v_org.id
           and (v_cru is null or h.hora < date_trunc('hour', v_cru at time zone v_org.fuso) at time zone v_org.fuso)
         group by h.org_id, h.employee_id, h.hora, f.escala;

        get diagnostics v_qtd = row_count;
        v_total := v_total + v_qtd;

        -- Aplicativos: refaz do dado cru os dias que ele cobre inteiros — conserta
        -- o que a consolidação antiga tinha perdido. Dias mais antigos ficam.
        if v_cru is not null then
            delete from resumo_app_diario
             where org_id = v_org.id
               and dia > (v_cru at time zone v_org.fuso)::date;

            insert into resumo_app_diario (org_id, employee_id, dia, alvo, tipo, minutos, teclas, cliques)
            select m.org_id, m.employee_id, (m.minuto at time zone v_org.fuso)::date, m.alvo,
                   max(m.tipo), count(*),
                   coalesce(sum(m.keystrokes_count), 0), coalesce(sum(m.mouse_clicks_count), 0)
              from minutos_pessoa(
                       ((v_cru at time zone v_org.fuso)::date + 1)::timestamp at time zone v_org.fuso,
                       now() + interval '1 hour') m
             where m.org_id = v_org.id and m.estado = 'ATIVO'
             group by m.org_id, m.employee_id, (m.minuto at time zone v_org.fuso)::date, m.alvo;
        end if;
    end loop;

    return v_total;
end;
$$;

revoke execute on function carregar_resumo_pessoa() from public, anon, authenticated;

-- ----------------------------------------------------------------------------
--  7. Interseção de uma faixa do dia com o expediente (descontando intervalo)
-- ----------------------------------------------------------------------------
create or replace function minutos_no_expediente(
    c0 numeric, c1 numeric,
    ini int, fim int, int_ini int, int_fim int
)
returns numeric
language sql
immutable
as $$
    select case
        when c0 is null or c1 is null or ini is null or fim is null or c1 <= c0 then 0
        else greatest(0, least(c1, fim) - greatest(c0, ini))
           - case when int_ini is null or int_fim is null then 0
                  else greatest(0, least(c1, fim, int_fim) - greatest(c0, ini, int_ini)) end
    end;
$$;

comment on function minutos_no_expediente is
    'Minutos da faixa [c0, c1] (minutos do dia, podem ser fracionários) que caem dentro de [ini, fim] fora do intervalo [int_ini, int_fim].';

-- ----------------------------------------------------------------------------
--  8. A FONTE ÚNICA: produtividade por pessoa e por dia
-- ----------------------------------------------------------------------------
drop function if exists painel_produtividade_diaria(timestamptz, timestamptz, uuid, uuid, uuid);

create or replace function painel_produtividade_diaria(
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
    dia                     date,
    trabalha                boolean,
    escala_inicio           time,
    escala_fim              time,
    intervalo_inicio        time,
    intervalo_fim           time,
    minutos_expediente      numeric,
    minutos_registrados     numeric,
    minutos_ativos          numeric,
    minutos_produtivos      numeric,
    minutos_neutros         numeric,
    minutos_improdutivos    numeric,
    minutos_sem_classificar numeric,
    minutos_ociosos         numeric,
    minutos_bloqueado       numeric,
    minutos_sem_dados       numeric,
    minutos_ativos_fora     numeric,
    minutos_sobrepostos     numeric,
    aproximado              boolean,
    indice                  numeric,
    cobertura               numeric
)
language sql
stable
as $$
    with a as (
        select org_em_foco(p_org) as org_id,
               fuso_da_org(p_org) as fuso,
               -- O presente é o corte: expediente futuro não conta.
               least(now(), p_fim) as corte
    ),
    pessoas as (
        select e.id, coalesce(e.nome, e.os_user) as nome, e.team_id, t.nome as equipe,
               -- Expediente só conta a partir de quando a pessoa passou a existir
               -- para o painel: o cadastro ou o primeiro dado, o que vier antes.
               -- Sem isso, quem foi instalado ontem teria o mês inteiro de "sem
               -- dados" e um índice que não diz nada sobre ela.
               (least(e.created_at,
                      coalesce((select min(b.inicio) from resumo_pessoa_15min b
                                 where b.employee_id = e.id), e.created_at))
                  at time zone a.fuso)::date as inicio_historico
          from employees e
          cross join a
          left join teams t on t.id = e.team_id
         where e.org_id = a.org_id
           and (p_equipe is null or e.team_id = p_equipe)
           and (p_colaborador is null or e.id = p_colaborador)
    ),
    dias as (
        select d::date as dia
          from a, generate_series(
              (p_inicio at time zone a.fuso)::date,
              ((p_fim - interval '1 second') at time zone a.fuso)::date,
              interval '1 day'
          ) d
    ),
    -- Escala efetiva de cada pessoa em cada dia, e a faixa do dia que o recorte
    -- cobre ([j0, j1] em minutos locais).
    escala as (
        select p.id as employee_id, d.dia,
               x.trabalha, x.inicio, x.fim, x.intervalo_inicio, x.intervalo_fim,
               minutos_time(x.inicio) as ini,
               minutos_time(x.fim) as fim_m,
               minutos_time(x.intervalo_inicio) as int_ini,
               minutos_time(x.intervalo_fim) as int_fim,
               case when (p_inicio at time zone a.fuso)::date < d.dia then 0::numeric
                    else extract(epoch from (p_inicio at time zone a.fuso)::time)::numeric / 60 end as j0,
               case when (a.corte at time zone a.fuso)::date > d.dia then 1440::numeric
                    when (a.corte at time zone a.fuso)::date < d.dia then 0::numeric
                    else extract(epoch from (a.corte at time zone a.fuso)::time)::numeric / 60 end as j1
          from pessoas p
          cross join dias d
          cross join a
          cross join lateral expediente_do_dia(p.id, d.dia) x
         where d.dia >= p.inicio_historico
    ),
    expediente as (
        select e.*,
               case when e.trabalha
                    then minutos_no_expediente(e.j0, e.j1, e.ini, e.fim_m, e.int_ini, e.int_fim)
                    else 0 end as minutos
          from escala e
    ),
    blocos as (
        select b.employee_id,
               (b.inicio at time zone a.fuso)::date as dia,
               extract(epoch from (b.inicio at time zone a.fuso)::time)::numeric / 60 as b0,
               -- Parte do bloco que já PODIA ter dado. No bloco em andamento é o
               -- tempo decorrido — dividir sempre por 15 (ou 60) era o bug 1.
               least(b.duracao_min::numeric, extract(epoch from (now() - b.inicio))::numeric / 60) as obs,
               b.minutos_registrados, b.minutos_ativos, b.minutos_ociosos, b.minutos_bloqueado,
               b.minutos_produtivos, b.minutos_neutros, b.minutos_improdutivos,
               b.minutos_sem_classificar, b.minutos_sobrepostos
          from resumo_pessoa_15min b
          cross join a
         where b.org_id = a.org_id
           and b.inicio >= p_inicio - interval '1 hour'
           and b.inicio <  p_fim
           and b.employee_id in (select id from pessoas)
    ),
    rateado as (
        select b.*, x.c0, x.c1, x.janela, x.dentro,
               x.dentro / b.obs as f_dentro,
               (x.janela - x.dentro) / b.obs as f_fora
          from blocos b
          join expediente e on e.employee_id = b.employee_id and e.dia = b.dia
          cross join lateral (
              select greatest(b.b0, e.j0) as c0,
                     least(b.b0 + b.obs, e.j1) as c1,
                     greatest(0, least(b.b0 + b.obs, e.j1) - greatest(b.b0, e.j0)) as janela,
                     case when e.trabalha
                          then minutos_no_expediente(greatest(b.b0, e.j0), least(b.b0 + b.obs, e.j1),
                                                     e.ini, e.fim_m, e.int_ini, e.int_fim)
                          else 0 end as dentro
          ) x
         where b.obs > 0
    ),
    somas as (
        select employee_id, dia,
               sum(minutos_registrados * f_dentro)     as registrados,
               sum(minutos_ativos * f_dentro)          as ativos,
               sum(minutos_produtivos * f_dentro)      as produtivos,
               sum(minutos_neutros * f_dentro)         as neutros,
               sum(minutos_improdutivos * f_dentro)    as improdutivos,
               sum(minutos_sem_classificar * f_dentro) as sem_classificar,
               sum(minutos_ociosos * f_dentro)         as ociosos,
               sum(minutos_bloqueado * f_dentro)       as bloqueado,
               sum(minutos_ativos * f_fora)            as ativos_fora,
               sum(minutos_sobrepostos * (f_dentro + f_fora)) as sobrepostos,
               -- Rateio de verdade só quando o corte cai NO MEIO de um bloco
               -- com dado: aí não dá para saber de que lado os minutos caíram.
               bool_or(minutos_registrados > 0 and (
                         (f_dentro > 0.0001 and f_dentro < 0.9999)
                      or (f_fora   > 0.0001 and f_fora   < 0.9999))) as aproximado
          from rateado
         group by employee_id, dia
    )
    select
        p.id, p.nome, p.team_id, p.equipe, e.dia,
        e.trabalha, e.inicio, e.fim, e.intervalo_inicio, e.intervalo_fim,
        round(e.minutos, 2),
        round(coalesce(s.registrados, 0), 2),
        round(coalesce(s.ativos, 0), 2),
        round(coalesce(s.produtivos, 0), 2),
        round(coalesce(s.neutros, 0), 2),
        round(coalesce(s.improdutivos, 0), 2),
        round(coalesce(s.sem_classificar, 0), 2),
        round(coalesce(s.ociosos, 0), 2),
        round(coalesce(s.bloqueado, 0), 2),
        round(greatest(0, e.minutos - coalesce(s.registrados, 0)), 2),
        round(coalesce(s.ativos_fora, 0), 2),
        round(coalesce(s.sobrepostos, 0), 2),
        coalesce(s.aproximado, false),
        case when e.minutos > 0
             then round(coalesce(s.produtivos, 0) * 100.0 / e.minutos, 1) end,
        case when e.minutos > 0
             then round(least(coalesce(s.registrados, 0), e.minutos) * 100.0 / e.minutos, 1) end
      from expediente e
      join pessoas p on p.id = e.employee_id
      left join somas s on s.employee_id = e.employee_id and s.dia = e.dia
     where e.minutos > 0
        or coalesce(s.registrados, 0) > 0
        or coalesce(s.ativos_fora, 0) > 0
     order by p.nome, e.dia;
$$;

comment on function painel_produtividade_diaria is
    'FONTE ÚNICA das métricas de expediente, por pessoa e dia: expediente decorrido (escala efetiva, sem intervalo, cortado no presente), tempo registrado/ativo/produtivo dentro dele, sem dados, atividade fora da escala e índice. Índice, cobertura, horas fora da escala, série e relatórios agregam a partir daqui.';

-- ----------------------------------------------------------------------------
--  9. Por pessoa no período (agrega a diária)
-- ----------------------------------------------------------------------------
drop function if exists painel_evolucao(timestamptz, timestamptz, uuid, uuid, uuid);
drop function if exists painel_produtividade(timestamptz, timestamptz, uuid, uuid, uuid);

create or replace function painel_produtividade(
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
    minutos_expediente      numeric,
    minutos_registrados     numeric,
    minutos_ativos          numeric,
    minutos_produtivos      numeric,
    minutos_neutros         numeric,
    minutos_improdutivos    numeric,
    minutos_sem_classificar numeric,
    minutos_ociosos         numeric,
    minutos_bloqueado       numeric,
    minutos_sem_dados       numeric,
    minutos_ativos_fora     numeric,
    minutos_sobrepostos     numeric,
    dias_com_expediente     int,
    dias_com_registro       int,
    aproximado              boolean,
    indice                  numeric,
    aderencia               numeric
)
language sql
stable
as $$
    select
        d.colaborador_id, d.colaborador, d.equipe_id, d.equipe,
        sum(d.minutos_expediente),
        sum(d.minutos_registrados),
        sum(d.minutos_ativos),
        sum(d.minutos_produtivos),
        sum(d.minutos_neutros),
        sum(d.minutos_improdutivos),
        sum(d.minutos_sem_classificar),
        sum(d.minutos_ociosos),
        sum(d.minutos_bloqueado),
        sum(d.minutos_sem_dados),
        sum(d.minutos_ativos_fora),
        sum(d.minutos_sobrepostos),
        (count(*) filter (where d.minutos_expediente > 0))::int,
        (count(*) filter (where d.minutos_registrados > 0 or d.minutos_ativos_fora > 0))::int,
        bool_or(d.aproximado),
        case when sum(d.minutos_expediente) > 0
             then round(sum(d.minutos_produtivos) * 100.0 / sum(d.minutos_expediente), 1) end,
        case when sum(d.minutos_expediente) > 0
             then round(least(sum(d.minutos_registrados), sum(d.minutos_expediente)) * 100.0
                        / sum(d.minutos_expediente), 1) end
      from painel_produtividade_diaria(p_inicio, p_fim, p_org, p_equipe, p_colaborador) d
     group by d.colaborador_id, d.colaborador, d.equipe_id, d.equipe
     order by d.colaborador;
$$;

comment on function painel_produtividade is
    'Métricas de expediente por pessoa no período, somadas de painel_produtividade_diaria. Índice = produtivo ÷ expediente decorrido; aderência (cobertura) = registrado dentro do expediente ÷ expediente. O painel tira a média simples dos % entre pessoas.';

create or replace function painel_evolucao(
    p_inicio      timestamptz,
    p_fim         timestamptz,
    p_org         uuid default null,
    p_equipe      uuid default null,
    p_colaborador uuid default null
)
returns table (
    colaborador_id          uuid,
    colaborador             text,
    equipe                  text,
    indice_atual            numeric,
    indice_anterior         numeric,
    minutos_ativos_atual    bigint,
    minutos_ativos_anterior bigint,
    dias_atual              int,
    dias_anterior           int
)
language sql
stable
as $$
    with atual as (
        select * from painel_produtividade(p_inicio, p_fim, p_org, p_equipe, p_colaborador)
    ),
    anterior as (
        select * from painel_produtividade(
            p_inicio - (p_fim - p_inicio), p_inicio, p_org, p_equipe, p_colaborador
        )
    )
    select
        coalesce(a.colaborador_id, b.colaborador_id),
        coalesce(a.colaborador, b.colaborador),
        coalesce(a.equipe, b.equipe),
        a.indice,
        b.indice,
        round(coalesce(a.minutos_registrados, 0))::bigint,
        round(coalesce(b.minutos_registrados, 0))::bigint,
        coalesce(a.dias_com_expediente, 0),
        coalesce(b.dias_com_expediente, 0)
      from atual a
      full outer join anterior b on b.colaborador_id = a.colaborador_id;
$$;

-- ----------------------------------------------------------------------------
--  10. Atividade fora da escala (agrega a diária)
-- ----------------------------------------------------------------------------
create or replace function painel_horas_extras(
    p_inicio      timestamptz,
    p_fim         timestamptz,
    p_equipe      uuid default null,
    p_colaborador uuid default null,
    p_org         uuid default null
)
returns table (
    colaborador_id        uuid,
    colaborador           text,
    cargo                 text,
    equipe_id             uuid,
    equipe                text,
    tem_janela_definida    boolean,
    minutos_extras         bigint,
    dias_com_hora_extra     bigint,
    minutos_ativos_totais   bigint,
    percentual_extra        numeric,
    janela                 text
)
language sql
stable
as $$
    select
        d.colaborador_id, d.colaborador, e.cargo, d.equipe_id, d.equipe,
        true,
        round(sum(d.minutos_ativos_fora))::bigint,
        count(*) filter (where d.minutos_ativos_fora >= 1),
        round(sum(d.minutos_ativos + d.minutos_ativos_fora))::bigint,
        case when sum(d.minutos_ativos + d.minutos_ativos_fora) > 0
             then round(sum(d.minutos_ativos_fora) * 100.0
                        / sum(d.minutos_ativos + d.minutos_ativos_fora), 1)
             else 0 end,
        'escala do expediente'::text
      from painel_produtividade_diaria(p_inicio, p_fim, p_org, p_equipe, p_colaborador) d
      join employees e on e.id = d.colaborador_id
     group by d.colaborador_id, d.colaborador, e.cargo, d.equipe_id, d.equipe
    having sum(d.minutos_ativos + d.minutos_ativos_fora) > 0
     order by round(sum(d.minutos_ativos_fora)) desc;
$$;

comment on function painel_horas_extras is
    'Tempo ativo fora da escala efetiva (inclusive dias sem expediente), da fonte única painel_produtividade_diaria. É leitura de uso, não marcação de ponto nem banco de horas.';

-- ----------------------------------------------------------------------------
--  11. Série do índice (agrega a diária por balde)
-- ----------------------------------------------------------------------------
create or replace function painel_produtividade_serie(
    p_inicio      timestamptz,
    p_fim         timestamptz,
    p_bucket      text default 'day',
    p_org         uuid default null,
    p_equipe      uuid default null,
    p_colaborador uuid default null
)
returns table (
    balde           date,
    pessoas         int,
    indice_medio    numeric,
    aderencia_media numeric
)
language sql
stable
as $$
    with por_pessoa as (
        select date_trunc(
                   case p_bucket when 'month' then 'month' when 'week' then 'week' else 'day' end,
                   d.dia::timestamp
               )::date as balde,
               d.colaborador_id,
               sum(d.minutos_expediente) as expediente,
               sum(d.minutos_produtivos) as produtivos,
               sum(d.minutos_registrados) as registrados
          from painel_produtividade_diaria(p_inicio, p_fim, p_org, p_equipe, p_colaborador) d
         group by 1, 2
    )
    select balde,
           (count(*) filter (where expediente > 0))::int,
           round(avg(produtivos * 100.0 / nullif(expediente, 0)), 1),
           round(avg(least(registrados, expediente) * 100.0 / nullif(expediente, 0)), 1)
      from por_pessoa
     group by balde
    having count(*) filter (where expediente > 0) > 0
     order by balde;
$$;

-- ----------------------------------------------------------------------------
--  12. Atraso de envio: um limiar, derivado do intervalo da empresa
-- ----------------------------------------------------------------------------
create or replace function limiar_atraso_envio(p_org uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
    select greatest(
        10,
        -- 5 = padrão compilado no agente (OpcoesAgente.cs).
        ceil(coalesce((select sync_interval_minutes from organizations where id = p_org), 5) * 2.5)::int
    );
$$;

comment on function limiar_atraso_envio is
    'Minutos sem envio a partir dos quais a estação conta como atrasada: 2,5 × intervalo de envio da empresa, piso de 10. Única definição — offline, avisos e tela de dispositivos usam esta.';

create or replace function marcar_dispositivos_offline()
returns void
language sql
security definer
set search_path = public
as $$
    update devices d
       set status_online = false
     where d.status_online = true
       and (
             d.last_sync_at is null
          or d.last_sync_at < now() - make_interval(mins => limiar_atraso_envio(d.org_id))
           );
$$;

-- Estações com a situação de envio, a pessoa que mais usou cada uma e se essa
-- pessoa deveria estar trabalhando agora.
create or replace function painel_estacoes(p_org uuid default null)
returns table (
    dispositivo_id      uuid,
    maquina             text,
    usuario_windows     text,
    versao              text,
    ultimo_envio        timestamptz,
    ultimo_registro     timestamptz,
    minutos_sem_envio   numeric,
    limiar_minutos      int,
    situacao            text,
    colaborador_id      uuid,
    colaborador         text,
    equipe_id           uuid,
    equipe              text,
    em_expediente_agora boolean
)
language sql
stable
as $$
    with a as (
        select org_em_foco(p_org) as org_id,
               fuso_da_org(p_org) as fuso,
               limiar_atraso_envio(org_em_foco(p_org)) as limiar
    ),
    uso as (
        -- Quem mais apareceu na estação nos últimos 30 dias.
        select distinct on (h.device_id) h.device_id, h.employee_id
          from resumo_diario h cross join a
         where h.org_id = a.org_id and h.dia >= current_date - 30
         group by h.device_id, h.employee_id
         order by h.device_id, sum(h.minutos_registrados) desc
    )
    select
        d.id, d.machine_name, d.os_user, d.agent_version, d.last_sync_at,
        (select max(l."timestamp") from activity_logs l where l.device_id = d.id),
        case when d.last_sync_at is null then null
             else round(extract(epoch from (now() - d.last_sync_at))::numeric / 60, 1) end,
        a.limiar,
        case when d.last_sync_at is null then 'SEM_ENVIO'
             when d.last_sync_at < now() - make_interval(mins => a.limiar) then 'ATRASADA'
             else 'RECENTE' end,
        e.id, coalesce(e.nome, e.os_user), e.team_id, t.nome,
        coalesce((
            select x.trabalha
               and minutos_no_expediente(
                     extract(epoch from (now() at time zone a.fuso)::time)::numeric / 60,
                     extract(epoch from (now() at time zone a.fuso)::time)::numeric / 60 + 1,
                     minutos_time(x.inicio), minutos_time(x.fim),
                     minutos_time(x.intervalo_inicio), minutos_time(x.intervalo_fim)) > 0
              from expediente_do_dia(e.id, (now() at time zone a.fuso)::date) x
        ), false)
      from devices d
      cross join a
      left join uso u on u.device_id = d.id
      left join employees e on e.id = u.employee_id
      left join teams t on t.id = e.team_id
     where d.org_id = a.org_id
     order by d.machine_name;
$$;

comment on function painel_estacoes is
    'Estações com situação de envio (RECENTE, ATRASADA, SEM_ENVIO) pelo limiar da empresa. Atraso de envio não prova máquina desligada: o agente pode estar parado, sem rede ou sem permissão.';

-- Pendências do topo: estação atrasada só conta quando a pessoa dela deveria
-- estar trabalhando agora. De madrugada toda a frota está "sem enviar", e um
-- aviso que acende todo dia é um aviso que ninguém lê.
drop function if exists contar_pendencias(uuid);

create or replace function contar_pendencias(p_org uuid default null)
returns table (
    colaboradores_pendentes bigint,
    ultima_estacao          text,
    ultima_estacao_em       timestamptz,
    estacoes_paradas        bigint,
    estacao_parada          text,
    estacao_parada_em       timestamptz,
    limiar_minutos          int
)
language sql
stable
as $$
    with a as (select org_em_foco(p_org) as org_id),
    paradas as (
        select maquina, ultimo_envio
          from painel_estacoes(p_org)
         where situacao <> 'RECENTE' and em_expediente_agora
    )
    select
        (select count(*) from employees e cross join a
          where e.org_id = a.org_id and e.ativo and not e.perfil_completo),
        (select d.machine_name from devices d cross join a
          where d.org_id = a.org_id order by d.last_sync_at desc nulls last limit 1),
        (select d.last_sync_at from devices d cross join a
          where d.org_id = a.org_id order by d.last_sync_at desc nulls last limit 1),
        (select count(*) from paradas),
        (select maquina from paradas order by ultimo_envio asc nulls first limit 1),
        (select ultimo_envio from paradas order by ultimo_envio asc nulls first limit 1),
        (select limiar_atraso_envio(a.org_id) from a);
$$;

comment on function contar_pendencias is
    'O que precisa de atenção agora: colaboradores sem configurar e estações atrasadas (limiar da empresa) cuja pessoa está dentro do expediente.';

-- ----------------------------------------------------------------------------
--  13. Carga inicial
-- ----------------------------------------------------------------------------
select carregar_resumo_pessoa();
