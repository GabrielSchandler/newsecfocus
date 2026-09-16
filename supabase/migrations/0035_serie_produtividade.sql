-- ============================================================================
--  0035 — Índice do expediente ao longo do tempo
--
--  A Visão geral ganhou o gráfico "Evolução do tempo produtivo": uma linha do
--  índice dia a dia (ou mês a mês) com o período anterior ao lado. A série que
--  existia (painel_serie) ainda mede o índice ANTIGO, produtivo ÷ tempo
--  classificado — usá-la ali poria duas réguas na mesma tela, o erro que a
--  0033 corrigiu na evolução por pessoa.
--
--  Mesma solução da 0033: nada de repetir a conta. Cada balde (dia, semana ou
--  mês) vira uma janela, e a função CHAMA painel_produtividade nela. O índice
--  do balde é a média simples do índice das pessoas, igual ao número grande do
--  topo da tela — cada pessoa pesa igual.
--
--  Balde sem expediente para ninguém (fim de semana, feriado na escala) não
--  volta: o gráfico pula o dia em vez de desenhar um zero que não aconteceu.
-- ============================================================================

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
    with a as (
        select fuso_da_org(p_org) as fuso,
               case p_bucket when 'month' then 'month' when 'week' then 'week' else 'day' end as unidade
    ),
    baldes as (
        select distinct date_trunc(a.unidade, d)::date as balde
          from a, generate_series(
              (p_inicio at time zone a.fuso)::date,
              ((p_fim - interval '1 second') at time zone a.fuso)::date,
              interval '1 day'
          ) d
    ),
    -- O primeiro e o último balde são cortados no recorte pedido: um mês que
    -- começa no dia 15 não pode trazer o expediente do dia 1.
    janelas as (
        select b.balde,
               greatest(p_inicio, b.balde::timestamp at time zone a.fuso) as inicio,
               least(p_fim, (b.balde + ('1 ' || a.unidade)::interval) at time zone a.fuso) as fim
          from baldes b, a
    )
    select j.balde,
           count(*) filter (where p.minutos_expediente > 0)::int,
           round(avg(p.indice), 1),
           round(avg(p.aderencia), 1)
      from janelas j
      cross join lateral painel_produtividade(j.inicio, j.fim, p_org, p_equipe, p_colaborador) p
     where j.inicio < j.fim
     group by j.balde
    having count(*) filter (where p.minutos_expediente > 0) > 0
     order by j.balde;
$$;

comment on function painel_produtividade_serie is
    'Índice do expediente por balde (dia, semana ou mês): média simples do índice das pessoas, calculada chamando painel_produtividade em cada janela — a mesma régua do resto do painel. Balde sem expediente não volta.';
