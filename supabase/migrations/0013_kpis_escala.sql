-- ============================================================================
--  0013 — Índice separado por escala e hora extra
--
--  O índice de produtividade responde "do tempo que deu para classificar,
--  quanto foi produtivo". Ele não distingue o que aconteceu dentro do
--  expediente do que aconteceu fora dele — e isso distorce a leitura: quem
--  varre a caixa de e-mail às 22h aparece igual a quem faz o mesmo às 14h.
--
--  Esta RPC devolve o mesmo cálculo, mas cortado em dois: dentro da escala
--  (a janela de jornada da 0011) e fora dela (hora extra). O painel mostra o
--  índice da escala ao lado do geral, para a avaliação de desempenho olhar só
--  o horário contratado.
--
--  Granularidade de HORA, vinda de resumo_horario — nenhuma consulta do painel
--  toca activity_logs. Janela que começa no meio da hora é arredondada, mesma
--  ressalva da 0011.
--
--  tem_janela = false quando ninguém do recorte tem janela (nem própria, nem
--  padrão da empresa). Nesse caso o painel esconde o corte em vez de mostrar
--  zero, que seria mentiroso.
-- ============================================================================

create or replace function painel_kpis_escala(
    p_inicio      timestamptz,
    p_fim         timestamptz,
    p_equipe      uuid default null,
    p_colaborador uuid default null,
    p_dispositivo uuid default null,
    p_org         uuid default null
)
returns table (
    tem_janela                  boolean,
    minutos_ativos_escala       bigint,
    minutos_produtivos_escala   bigint,
    minutos_neutros_escala      bigint,
    minutos_improdutivos_escala bigint,
    indice_escala               numeric,
    minutos_ativos_extra        bigint,
    minutos_produtivos_extra    bigint,
    indice_extra                numeric,
    pessoas_com_extra           bigint
)
language sql
stable
as $$
    with a as (select org_em_foco(p_org) as org_id, fuso_da_org(p_org) as fuso),
    config as (
        select
            e.id as employee_id,
            coalesce(e.jornada_hora_inicio, o.jornada_padrao_hora_inicio) as hora_inicio,
            coalesce(e.jornada_hora_fim,    o.jornada_padrao_hora_fim)    as hora_fim
          from employees e
          join organizations o on o.id = e.org_id
         cross join a
         where e.org_id = a.org_id
           and (p_equipe      is null or e.team_id = p_equipe)
           and (p_colaborador is null or e.id      = p_colaborador)
    ),
    classificado as (
        select
            r.employee_id,
            r.minutos_ativos,
            r.minutos_produtivos,
            r.minutos_neutros,
            r.minutos_improdutivos,
            hora_dentro_da_janela(
                extract(hour from (r.hora at time zone a.fuso))::int,
                c.hora_inicio,
                c.hora_fim
            ) as dentro
          from resumo_horario r
          cross join a
          join config c on c.employee_id = r.employee_id
         where r.org_id = a.org_id
           and r.hora >= p_inicio and r.hora < p_fim
           and (p_dispositivo is null or r.device_id = p_dispositivo)
    )
    select
        (select bool_or(hora_inicio is not null) from config),

        coalesce(sum(minutos_ativos)       filter (where dentro), 0)::bigint,
        coalesce(sum(minutos_produtivos)   filter (where dentro), 0)::bigint,
        coalesce(sum(minutos_neutros)      filter (where dentro), 0)::bigint,
        coalesce(sum(minutos_improdutivos) filter (where dentro), 0)::bigint,
        calcular_indice(
            coalesce(sum(minutos_produtivos)   filter (where dentro), 0),
            coalesce(sum(minutos_neutros)      filter (where dentro), 0),
            coalesce(sum(minutos_improdutivos) filter (where dentro), 0)
        ),

        coalesce(sum(minutos_ativos)     filter (where dentro = false), 0)::bigint,
        coalesce(sum(minutos_produtivos) filter (where dentro = false), 0)::bigint,
        calcular_indice(
            coalesce(sum(minutos_produtivos)   filter (where dentro = false), 0),
            coalesce(sum(minutos_neutros)      filter (where dentro = false), 0),
            coalesce(sum(minutos_improdutivos) filter (where dentro = false), 0)
        ),
        count(distinct employee_id) filter (where dentro = false and minutos_ativos > 0)::bigint
      from classificado;
$$;

comment on function painel_kpis_escala is
    'Índice de produtividade cortado entre dentro da escala e hora extra, a partir de resumo_horario. tem_janela = false quando ninguém do recorte tem janela configurada — o painel esconde o corte nesse caso.';
