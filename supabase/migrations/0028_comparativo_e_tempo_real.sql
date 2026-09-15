-- ============================================================================
--  0028 — Comparativo alinhado e "Atividade agora" ordenada pelo silêncio
--
--  1) dia_expediente_anterior: o "vs ontem" tem de comparar com o último dia em
--     que se trabalha. Segunda-feira comparada com domingo mostraria uma alta
--     absurda contra quase zero. Usa a escala da EMPRESA (0027), que é o nível
--     certo para um número do painel inteiro.
--
--  2) painel_tempo_real: o DISTINCT ON obriga a ordenar por e.id, então a ordem
--     que chegava ao painel não significava nada. Agora a lista sai pelo que o
--     gestor quer ver primeiro: quem está há mais tempo sem enviar (e quem nunca
--     enviou vem antes de todos).
-- ============================================================================

create or replace function dia_expediente_anterior(
    p_org uuid,
    p_dia date,
    p_limite_busca int default 14
)
returns date
language sql
stable
as $$
    with a as (select org_em_foco(p_org) as org_id),
    candidatos as (
        select (p_dia - n)::date as dia
          from generate_series(1, greatest(1, p_limite_busca)) n
    )
    select c.dia
      from candidatos c
      cross join a
      join escalas_expediente x
        on x.org_id = a.org_id
       and x.escopo = 'EMPRESA'
       and x.dia_semana = extract(isodow from c.dia)::smallint
       and x.trabalha
     order by c.dia desc
     limit 1;
$$;

comment on function dia_expediente_anterior is
    'Último dia ANTES de p_dia em que a escala da empresa prevê expediente. Base do comparativo "vs ontem" — segunda compara com sexta, não com domingo. NULL quando a empresa não tem escala com dia útil nas últimas duas semanas.';

-- ----------------------------------------------------------------------------
--  Atividade agora, ordenada por quem está em silêncio há mais tempo
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
    select *
      from (
        select distinct on (e.id)
            e.id                          as colaborador_id,
            coalesce(e.nome, e.os_user)   as colaborador,
            coalesce(t.nome, 'Sem equipe') as equipe,
            d.machine_name                as machine_name,
            d.id                          as device_id,
            l.process_name                as process_name,
            l.domain                      as domain,
            l.window_title                as window_title,
            l.is_idle                     as is_idle,
            l.is_locked                   as is_locked,
            l."timestamp"                 as momento,
            l.keystrokes_count            as teclas,
            l.mouse_clicks_count          as cliques,
            l.scroll_count                as rolagens,
            coalesce(d.status_online, false) as status_online,
            d.last_sync_at                as last_sync_at
          from employees e
          left join teams t on t.id = e.team_id
          left join activity_logs l on l.employee_id = e.id
          left join devices d on d.id = l.device_id
         where e.ativo
           and e.org_id = org_em_foco(p_org)
         order by e.id, l."timestamp" desc nulls last
      ) ultimo
     -- Quem nunca enviou (momento nulo) primeiro; depois do mais antigo ao mais
     -- recente. É a leitura de "quem sumiu", que é o que se procura aqui.
     order by ultimo.momento asc nulls first;
$$;

comment on function painel_tempo_real is
    'Último sinal de cada pessoa, ordenado por quem está há mais tempo sem enviar (nunca enviou vem primeiro).';
