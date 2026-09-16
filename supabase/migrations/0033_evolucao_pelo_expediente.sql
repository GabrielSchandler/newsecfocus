-- ============================================================================
--  0033 — Evolução passa a usar o índice do expediente
--
--  A seção "Evolução vs. período anterior" ainda comparava o índice ANTIGO
--  (produtivo ÷ tempo classificado), enquanto o resto do painel já mostra o
--  índice contra o expediente. Duas réguas diferentes na mesma tela: alguém
--  podia aparecer "subindo" na evolução e caindo no número principal.
--
--  Em vez de repetir a conta, a função agora CHAMA painel_produtividade nas duas
--  janelas. Assim existe uma fonte só para "índice", e mudar a regra de cálculo
--  muda tudo junto.
-- ============================================================================

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
        coalesce(a.minutos_registrados, 0),
        coalesce(b.minutos_registrados, 0),
        coalesce(a.dias_com_expediente, 0),
        coalesce(b.dias_com_expediente, 0)
      from atual a
      full outer join anterior b on b.colaborador_id = a.colaborador_id;
$$;

comment on function painel_evolucao is
    'Produtividade da pessoa no período contra o período anterior de mesma duração, usando o MESMO índice do resto do painel (produtivo ÷ expediente). Chama painel_produtividade nas duas janelas para não existir segunda régua.';
