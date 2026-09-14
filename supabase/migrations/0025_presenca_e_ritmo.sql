-- ============================================================================
--  0025 — Indicadores novos: Presença & pontualidade e Ritmo por hora
--
--  Ambos saem dos agregados que já existem, sem tocar no dado cru:
--    • Presença: resumo_diario.primeiro_sinal / ultimo_sinal (chegada/saída) e
--      os dias com registro (presença × faltas).
--    • Ritmo: resumo_horario, por hora do dia e por dia da semana (mapa de calor).
--
--  Sem SECURITY DEFINER: a RLS dos resumos (cada empresa vê o que é seu) vale.
--  org_em_foco/fuso_da_org resolvem empresa e fuso como nas demais RPCs.
-- ============================================================================

-- Minuto do dia (0..1439) de um instante, no fuso dado. Definido antes de quem
-- o usa: função SQL valida o corpo na criação e não acharia a referência depois.
create or replace function min_do_dia(p_ts timestamptz, p_fuso text)
returns int
language sql
immutable
as $$
    select case when p_ts is null then null
        else (extract(hour   from p_ts at time zone p_fuso)::int) * 60
           + (extract(minute from p_ts at time zone p_fuso)::int)
    end;
$$;

-- ----------------------------------------------------------------------------
--  Presença & pontualidade — uma linha por pessoa no recorte
-- ----------------------------------------------------------------------------
create or replace function painel_presenca(
    p_inicio      timestamptz,
    p_fim         timestamptz,
    p_org         uuid default null,
    p_equipe      uuid default null,
    p_colaborador uuid default null
)
returns table (
    colaborador_id  uuid,
    colaborador     text,
    equipe_id       uuid,
    equipe          text,
    dias_presentes  int,
    dias_uteis      int,
    faltas          int,
    -- Minuto do dia (0..1439) no fuso da empresa; NULL quando não há sinal.
    chegada_media   int,
    saida_media     int,
    chegada_cedo    int,
    saida_tarde     int
)
language sql
stable
as $$
    with a as (select org_em_foco(p_org) as org_id, fuso_da_org(p_org) as fuso),
    uteis as (
        select count(*) filter (where extract(isodow from g.d) < 6)::int as dias_uteis
          from a
          cross join lateral generate_series(
              (p_inicio at time zone a.fuso)::date,
              ((p_fim - interval '1 second') at time zone a.fuso)::date,
              interval '1 day'
          ) g(d)
    ),
    por_dia as (
        select r.employee_id,
               r.dia,
               min(r.primeiro_sinal) as primeiro,
               max(r.ultimo_sinal)   as ultimo,
               sum(r.minutos_registrados) as reg
          from resumo_diario r
          cross join a
         where r.org_id = a.org_id
           and r.dia between (p_inicio at time zone a.fuso)::date
                         and ((p_fim - interval '1 second') at time zone a.fuso)::date
         group by r.employee_id, r.dia
    )
    select
        e.id,
        coalesce(e.nome, e.os_user),
        t.id,
        t.nome,
        count(distinct pd.dia) filter (where pd.reg > 0)::int,
        (select dias_uteis from uteis),
        greatest(0, (select dias_uteis from uteis)
                      - count(distinct pd.dia) filter (where pd.reg > 0))::int,
        round(avg(min_do_dia(pd.primeiro, a.fuso)) filter (where pd.primeiro is not null))::int,
        round(avg(min_do_dia(pd.ultimo,   a.fuso)) filter (where pd.ultimo   is not null))::int,
        min(min_do_dia(pd.primeiro, a.fuso)),
        max(min_do_dia(pd.ultimo,   a.fuso))
      from por_dia pd
      join employees e on e.id = pd.employee_id
      left join teams t on t.id = e.team_id
      cross join a
     where (p_equipe is null or e.team_id = p_equipe)
       and (p_colaborador is null or e.id = p_colaborador)
     group by e.id, e.nome, e.os_user, t.id, t.nome
     order by count(distinct pd.dia) filter (where pd.reg > 0) desc,
              round(avg(min_do_dia(pd.primeiro, a.fuso))) asc nulls last;
$$;

comment on function painel_presenca is
    'Presença e pontualidade por pessoa: chegada/saída média (minuto do dia no fuso da empresa), primeira chegada, última saída, dias presentes e faltas (dias úteis do período menos dias com registro). Sai de resumo_diario.';

-- ----------------------------------------------------------------------------
--  Ritmo por hora — por hora do dia e dia da semana (curva + mapa de calor)
-- ----------------------------------------------------------------------------
create or replace function painel_ritmo_horario(
    p_inicio      timestamptz,
    p_fim         timestamptz,
    p_org         uuid default null,
    p_equipe      uuid default null,
    p_colaborador uuid default null
)
returns table (
    dia_semana         int,  -- 1=segunda ... 7=domingo (isodow)
    hora               int,  -- 0..23, no fuso da empresa
    minutos_ativos     bigint,
    minutos_produtivos bigint,
    minutos_registrados bigint
)
language sql
stable
as $$
    with a as (select org_em_foco(p_org) as org_id, fuso_da_org(p_org) as fuso)
    select
        extract(isodow from (r.hora at time zone a.fuso))::int,
        extract(hour   from (r.hora at time zone a.fuso))::int,
        coalesce(sum(r.minutos_ativos), 0)::bigint,
        coalesce(sum(r.minutos_produtivos), 0)::bigint,
        coalesce(sum(r.minutos_registrados), 0)::bigint
      from resumo_horario r
      cross join a
      join employees e on e.id = r.employee_id
     where r.org_id = a.org_id
       and r.hora >= p_inicio
       and r.hora <  p_fim
       and (p_equipe is null or e.team_id = p_equipe)
       and (p_colaborador is null or e.id = p_colaborador)
     group by 1, 2
     order by 1, 2;
$$;

comment on function painel_ritmo_horario is
    'Atividade por hora do dia e dia da semana (fuso da empresa), a partir de resumo_horario. Alimenta a curva de ritmo do dia e o mapa de calor semana × hora.';
