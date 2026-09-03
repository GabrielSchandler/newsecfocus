-- ============================================================================
--  0011 — Sinalizador de "aguardando configuração" e horas extras
--
--  Dois pedidos depois do primeiro teste real.
--
--  1. PENDÊNCIA DE CONFIGURAÇÃO
--     Sem isso, saber se uma instalação nova deu certo dependia de esperar o
--     ciclo de sincronização e ir olhar a lista de colaboradores. Agora cada
--     colaborador nasce com perfil_completo = false; a tela de Administração
--     marca true ao salvar. O painel consulta essa contagem com frequência
--     (poucos segundos) enquanto está aberto — não é notificação push de
--     verdade (decisão consciente: Realtime do Supabase exige habilitar
--     replicação manualmente no painel do projeto, um passo que já foi
--     removido deste produto antes por ser frágil — ver
--     components/painel/timeline-atividade.tsx), mas dá a sensação de
--     imediato sem esperar a próxima hora cheia.
--
--  2. HORAS EXTRAS
--     A empresa (e cada colaborador, como exceção) ganha uma janela de
--     horário esperado — início e fim. Atividade registrada FORA dessa
--     janela conta como hora extra. É a base para medir sobrecarga e risco
--     de esgotamento, não só presença.
--
--     Precisão: calculado a partir de resumo_horario, que tem granularidade
--     de HORA — nenhuma consulta do painel toca activity_logs (princípio
--     mantido desde o desenho original). Uma janela que comece ou termine no
--     meio da hora (ex.: 09:30) é arredondada para a hora cheia mais próxima
--     nessa conta; para precisão exata, configure a janela em horas cheias.
-- ============================================================================

-- ----------------------------------------------------------------------------
--  1. Pendência de configuração
-- ----------------------------------------------------------------------------
alter table employees
    add column if not exists perfil_completo boolean not null default false;

comment on column employees.perfil_completo is
    'Falso até um administrador salvar esta pessoa em Administração — é o sinal de "instalação nova, aguardando configurar equipe/cargo/jornada".';

-- ----------------------------------------------------------------------------
--  2. Janela de jornada — empresa (padrão) e colaborador (exceção)
-- ----------------------------------------------------------------------------
alter table organizations
    add column if not exists jornada_padrao_hora_inicio text,
    add column if not exists jornada_padrao_hora_fim    text;

alter table employees
    add column if not exists jornada_hora_inicio text,
    add column if not exists jornada_hora_fim    text;

do $$
begin
    if not exists (select 1 from pg_constraint where conname = 'chk_org_jornada_horario') then
        alter table organizations add constraint chk_org_jornada_horario check (
            (jornada_padrao_hora_inicio is null or jornada_padrao_hora_inicio ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
            and (jornada_padrao_hora_fim is null or jornada_padrao_hora_fim ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
            and ((jornada_padrao_hora_inicio is null) = (jornada_padrao_hora_fim is null))
        );
    end if;
    if not exists (select 1 from pg_constraint where conname = 'chk_emp_jornada_horario') then
        alter table employees add constraint chk_emp_jornada_horario check (
            (jornada_hora_inicio is null or jornada_hora_inicio ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
            and (jornada_hora_fim is null or jornada_hora_fim ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
            and ((jornada_hora_inicio is null) = (jornada_hora_fim is null))
        );
    end if;
end$$;

comment on column organizations.jornada_padrao_hora_inicio is
    'Início esperado do expediente (HH:MM). NULL = sem controle de horas extras para quem não tem exceção própria.';
comment on column employees.jornada_hora_inicio is
    'Exceção de horário desta pessoa. NULL = herda o padrão da empresa.';

-- ----------------------------------------------------------------------------
--  3. Classificação: uma hora do dia está dentro da janela esperada?
--     Não trata janela que atravessa a meia-noite (ex.: turno 22h–06h) —
--     cobre o caso comum de expediente diurno.
-- ----------------------------------------------------------------------------
create or replace function hora_dentro_da_janela(p_hora_local int, p_inicio text, p_fim text)
returns boolean
language sql
immutable
as $$
    select case
        when p_inicio is null or p_fim is null then null
        else p_hora_local >= split_part(p_inicio, ':', 1)::int
         and p_hora_local <  split_part(p_fim, ':', 1)::int
    end;
$$;

-- ----------------------------------------------------------------------------
--  4. RPC: horas extras por colaborador no período
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
    with a as (select org_em_foco(p_org) as org_id, fuso_da_org(p_org) as fuso),
    config as (
        select
            e.id as employee_id,
            coalesce(e.jornada_hora_inicio, o.jornada_padrao_hora_inicio) as hora_inicio,
            coalesce(e.jornada_hora_fim, o.jornada_padrao_hora_fim) as hora_fim
          from employees e
          join organizations o on o.id = e.org_id
         cross join a
         where e.org_id = a.org_id
    ),
    horas as (
        select
            r.employee_id,
            r.hora,
            r.minutos_ativos,
            extract(hour from (r.hora at time zone a.fuso))::int as hora_local
          from resumo_horario r
          cross join a
         where r.org_id = a.org_id
           and r.hora >= p_inicio and r.hora < p_fim
    ),
    classificado as (
        select
            h.employee_id,
            h.hora,
            h.minutos_ativos,
            hora_dentro_da_janela(h.hora_local, c.hora_inicio, c.hora_fim) as dentro
          from horas h
          join config c on c.employee_id = h.employee_id
    )
    select
        e.id,
        coalesce(e.nome, e.os_user),
        e.cargo,
        t.id,
        t.nome,
        (c.hora_inicio is not null),
        coalesce(sum(cl.minutos_ativos) filter (where cl.dentro = false), 0)::bigint,
        count(distinct (cl.hora at time zone a.fuso)::date)
            filter (where cl.dentro = false)::bigint,
        coalesce(sum(cl.minutos_ativos), 0)::bigint,
        case
            when coalesce(sum(cl.minutos_ativos), 0) = 0 or c.hora_inicio is null then null
            else round(
                coalesce(sum(cl.minutos_ativos) filter (where cl.dentro = false), 0) * 100.0
                / sum(cl.minutos_ativos), 1)
        end,
        case when c.hora_inicio is not null then c.hora_inicio || '–' || c.hora_fim else null end
      from employees e
     cross join a
      join config c on c.employee_id = e.id
      left join teams t on t.id = e.team_id
      left join classificado cl on cl.employee_id = e.id
     where e.org_id = a.org_id
       and e.ativo
       and (p_equipe is null or e.team_id = p_equipe)
       and (p_colaborador is null or e.id = p_colaborador)
     group by e.id, e.nome, e.os_user, e.cargo, t.id, t.nome, c.hora_inicio, c.hora_fim
     order by 7 desc;
$$;

comment on function painel_horas_extras is
    'Minutos ativos fora da janela de jornada esperada, por colaborador. Quem não tem janela configurada (nem própria nem herdada da empresa) volta com tem_janela_definida = false e percentual_extra nulo — não é tratado como zero, que seria mentiroso.';

-- ----------------------------------------------------------------------------
--  5. Contagem rápida para o banner de pendências
--
--  Consulta leve de propósito: o painel chama isto a cada poucos segundos
--  enquanto está aberto, para dar a sensação de "sei que instalou" sem
--  esperar a próxima sincronização de hora em hora.
-- ----------------------------------------------------------------------------
create or replace function contar_pendencias(p_org uuid default null)
returns table (colaboradores_pendentes bigint, ultima_estacao text, ultima_estacao_em timestamptz)
language sql
stable
as $$
    with a as (select org_em_foco(p_org) as org_id)
    select
        (select count(*) from employees e cross join a
          where e.org_id = a.org_id and e.ativo and not e.perfil_completo),
        (select d.machine_name from devices d cross join a
          where d.org_id = a.org_id order by d.last_sync_at desc nulls last limit 1),
        (select d.last_sync_at from devices d cross join a
          where d.org_id = a.org_id order by d.last_sync_at desc nulls last limit 1);
$$;
