-- ============================================================================
--  0012 — Catálogo de aplicativos e sites detectados
--
--  Antes, classificar um app exigia digitar o processo/domínio de cabeça em
--  Administração > Classificação, às cegas — sem ver o que já apareceu nas
--  estações. Esta RPC lista o que já foi detectado (a partir de
--  resumo_app_diario, nunca activity_logs), cruzado com a regra existente
--  (se houver), para uma tela onde o administrador vê a lista e classifica
--  direto. O que ainda não tem regra volta com mapeamento_id nulo — é o sinal
--  que a tela usa para destacar "precisa classificar".
--
--  resumo_app_diario.alvo mistura domínio e processo num só campo de texto
--  (coalesce(domínio, processo) na consolidação). Não dá para distinguir os
--  dois lendo só o agregado — mas o agente sempre grava processo como
--  "nome.exe" (ver Telemetria.Coletor/Monitoramento/InspetorJanela.cs e o
--  catálogo padrão em 0007), então "termina em .exe" é um jeito confiável de
--  decidir, sem tocar activity_logs.
-- ============================================================================

create or replace function painel_catalogo_apps(p_org uuid default null)
returns table (
    alvo           text,
    eh_processo    boolean,
    mapeamento_id  uuid,
    category_id    uuid,
    categoria_nome text,
    categoria_tipo categoria_produtividade,
    primeiro_visto date,
    ultimo_visto   date,
    minutos_totais bigint
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
    )
    select
        u.alvo,
        u.eh_processo,
        m.id,
        m.category_id,
        c.name,
        c.type,
        u.primeiro_visto,
        u.ultimo_visto,
        u.minutos_totais
      from uso u
      cross join a
      left join app_mappings m
             on m.org_id = a.org_id
            and (
                  (u.eh_processo and lower(m.process_name) = lower(u.alvo))
               or (not u.eh_processo and lower(m.domain) = lower(u.alvo))
                )
      left join productivity_categories c on c.id = m.category_id
     order by (m.id is null) desc, u.ultimo_visto desc, u.minutos_totais desc;
$$;

comment on function painel_catalogo_apps is
    'Catálogo de tudo que já foi visto (resumo_app_diario) cruzado com a regra de classificação, se houver. mapeamento_id nulo = ainda sem classificação, é o que a tela destaca.';
