-- ============================================================================
--  0034 — Horas extras passam a sair da escala de expediente
--
--  Até aqui existiam DUAS definições de expediente no produto: a escala nova
--  (0027), que manda no índice e na aderência, e a janela antiga de jornada
--  (jornada_hora_inicio/fim), que mandava nas horas extras. Com isso um sábado
--  trabalhado podia contar como expediente normal para o índice e como hora
--  extra ali — ou o contrário, conforme quem tinha configurado o quê.
--
--  Agora existe uma régua só. Hora extra é o tempo ATIVO que cai fora do
--  expediente daquele dia, incluindo o dia inteiro quando a escala diz que não
--  se trabalha (sábado, domingo, folga) — que é justamente o caso mais caro e
--  que a versão antiga não enxergava, por só olhar hora do dia.
-- ============================================================================

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
    pessoas as (
        select e.id, coalesce(e.nome, e.os_user) as nome, e.cargo, e.team_id, t.nome as equipe
          from employees e
          cross join a
          left join teams t on t.id = e.team_id
         where e.org_id = a.org_id
           and (p_equipe is null or e.team_id = p_equipe)
           and (p_colaborador is null or e.id = p_colaborador)
    ),
    horas as (
        select
            r.employee_id,
            (r.hora at time zone a.fuso)::date as dia,
            minutos_time((r.hora at time zone a.fuso)::time) as h_ini,
            r.minutos_ativos
          from resumo_horario r
          cross join a
         where r.org_id = a.org_id
           and r.hora >= p_inicio
           and r.hora <  p_fim
           and r.employee_id in (select id from pessoas)
           and r.minutos_ativos > 0
    ),
    -- Para cada hora com atividade, quanto dela cai DENTRO do expediente do dia.
    medido as (
        select
            h.employee_id,
            h.dia,
            h.minutos_ativos,
            case when x.trabalha then
                greatest(0,
                    sobreposicao_min(h.h_ini, h.h_ini + 60, minutos_time(x.inicio), minutos_time(x.fim))
                  - sobreposicao_min(
                        greatest(h.h_ini, minutos_time(x.inicio)),
                        least(h.h_ini + 60, minutos_time(x.fim)),
                        minutos_time(x.intervalo_inicio), minutos_time(x.intervalo_fim))
                )
            else 0 end as minutos_dentro_da_hora
          from horas h
          cross join lateral expediente_do_dia(h.employee_id, h.dia) x
    ),
    -- Rateia o tempo ativo da hora entre dentro e fora do expediente.
    extras as (
        select
            employee_id,
            dia,
            sum(minutos_ativos) as ativos,
            sum(minutos_ativos * (1 - (minutos_dentro_da_hora::numeric / 60))) as extras
          from medido
         group by employee_id, dia
    )
    select
        p.id,
        p.nome,
        p.cargo,
        p.team_id,
        p.equipe,
        -- Sempre há régua agora: a escala tem padrão quando nada foi configurado.
        true,
        round(coalesce(sum(x.extras), 0))::bigint,
        count(*) filter (where x.extras >= 1)::bigint,
        coalesce(sum(x.ativos), 0)::bigint,
        case when coalesce(sum(x.ativos), 0) > 0
             then round((coalesce(sum(x.extras), 0) * 100.0) / sum(x.ativos), 1)
             else 0 end,
        'escala do expediente'::text
      from pessoas p
      left join extras x on x.employee_id = p.id
     group by p.id, p.nome, p.cargo, p.team_id, p.equipe
    having coalesce(sum(x.ativos), 0) > 0
     order by round(coalesce(sum(x.extras), 0)) desc;
$$;

comment on function painel_horas_extras is
    'Tempo ativo fora do expediente da pessoa, usando a MESMA escala do índice (0027). Dia sem expediente na escala conta inteiro como hora extra — é o caso que a versão antiga, baseada só em hora do dia, não enxergava.';
