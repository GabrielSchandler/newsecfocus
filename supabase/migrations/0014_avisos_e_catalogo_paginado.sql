-- ============================================================================
--  0014 — Aviso de estação parada e catálogo que aguenta escala
--
--  1. ESTAÇÃO PARADA
--     O painel avisava quando uma estação NOVA chegava, mas não quando uma
--     existente parava de enviar. É o pior tipo de falha deste produto: a tela
--     continua bonita, os números do passado seguem lá, e ninguém percebe que
--     uma máquina saiu do ar — foi exatamente o que aconteceu na primeira
--     instalação real, que passou horas falhando em silêncio.
--
--     Corte de 24h de propósito: menos que isso e todo fim de semana ou
--     máquina desligada à noite viraria alarme falso. Estação recém-matriculada
--     ganha o mesmo prazo (coalesce com created_at) para não nascer "parada".
--
--  2. CATÁLOGO PAGINADO
--     painel_catalogo_apps devolvia TUDO que já foi visto. Com uma máquina são
--     19 linhas; com trinta, cada domínio visitado vira uma linha e isso passa
--     fácil de mil. A tela monta um formulário por linha — ela travaria. Agora
--     há limite, e a ordenação garante que o que importa (sem classificação, e
--     com mais tempo acumulado) esteja sempre dentro dele. O total volta junto
--     para a tela poder dizer quanto ficou de fora.
-- ============================================================================

-- ----------------------------------------------------------------------------
--  1. Pendências: colaborador a configurar + estação que parou de enviar
-- ----------------------------------------------------------------------------
drop function if exists contar_pendencias(uuid);

create or replace function contar_pendencias(p_org uuid default null)
returns table (
    colaboradores_pendentes bigint,
    ultima_estacao          text,
    ultima_estacao_em       timestamptz,
    estacoes_paradas        bigint,
    estacao_parada          text,
    estacao_parada_em       timestamptz
)
language sql
stable
as $$
    with a as (select org_em_foco(p_org) as org_id),
    paradas as (
        select d.machine_name, d.last_sync_at
          from devices d cross join a
         where d.org_id = a.org_id
           and coalesce(d.last_sync_at, d.created_at) < now() - interval '24 hours'
    )
    select
        (select count(*) from employees e cross join a
          where e.org_id = a.org_id and e.ativo and not e.perfil_completo),
        (select d.machine_name from devices d cross join a
          where d.org_id = a.org_id order by d.last_sync_at desc nulls last limit 1),
        (select d.last_sync_at from devices d cross join a
          where d.org_id = a.org_id order by d.last_sync_at desc nulls last limit 1),
        (select count(*) from paradas),
        (select machine_name from paradas order by last_sync_at asc nulls first limit 1),
        (select last_sync_at from paradas order by last_sync_at asc nulls first limit 1);
$$;

comment on function contar_pendencias is
    'O que precisa de atenção agora: colaboradores sem configurar e estações sem sincronizar há mais de 24h. Consulta leve — o painel chama a cada poucos segundos.';

-- ----------------------------------------------------------------------------
--  2. Catálogo com limite e total
-- ----------------------------------------------------------------------------
drop function if exists painel_catalogo_apps(uuid);

create or replace function painel_catalogo_apps(
    p_org    uuid default null,
    p_limite int  default 300
)
returns table (
    alvo           text,
    eh_processo    boolean,
    mapeamento_id  uuid,
    category_id    uuid,
    categoria_nome text,
    categoria_tipo categoria_produtividade,
    primeiro_visto date,
    ultimo_visto   date,
    minutos_totais bigint,
    total          bigint
)
language sql
stable
as $$
    with a as (select org_em_foco(p_org) as org_id),
    uso as (
        select
            r.alvo,
            (lower(r.alvo) like '%.exe') as eh_processo,
            min(r.dia) as primeiro_visto,
            max(r.dia) as ultimo_visto,
            sum(r.minutos)::bigint as minutos_totais
          from resumo_app_diario r
          cross join a
         where r.org_id = a.org_id
         group by r.alvo
    ),
    cruzado as (
        select
            u.*,
            m.id as mapeamento_id,
            m.category_id,
            c.name as categoria_nome,
            c.type as categoria_tipo
          from uso u
          cross join a
          left join app_mappings m
                 on m.org_id = a.org_id
                and (
                      (u.eh_processo and lower(m.process_name) = lower(u.alvo))
                   or (not u.eh_processo and lower(m.domain) = lower(u.alvo))
                    )
          left join productivity_categories c on c.id = m.category_id
    )
    select
        alvo, eh_processo, mapeamento_id, category_id, categoria_nome, categoria_tipo,
        primeiro_visto, ultimo_visto, minutos_totais,
        count(*) over () as total
      from cruzado
     -- Sem classificação primeiro, e dentro de cada grupo o que consumiu mais
     -- tempo: assim o limite nunca corta fora o que realmente importa.
     order by (mapeamento_id is null) desc, minutos_totais desc, ultimo_visto desc
     limit greatest(1, coalesce(p_limite, 300));
$$;

comment on function painel_catalogo_apps is
    'Catálogo do que já foi detectado, cruzado com a regra de classificação. mapeamento_id nulo = sem classificação, e vem primeiro. total = quantos existem no total, antes do limite.';
