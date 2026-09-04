-- ============================================================================
--  0016 — Catálogo de versões do agente (base da atualização automática)
--
--  Sem isto, atualizar trinta máquinas é trinta visitas. O plano é a estação
--  descobrir sozinha que existe versão nova, baixar, conferir e trocar — e
--  esta tabela é a fonte da verdade sobre QUAL versão ela deve rodar.
--
--  ⚠️ Isto é, por construção, um canal de execução remota de código em toda
--  máquina de cliente. É o preço de gerenciar frota, mas impõe duas regras que
--  não são opcionais:
--
--    1. O sha256 aqui é a âncora de confiança. O agente só instala um pacote
--       cujo hash bate com este campo. Sem assinatura de código, é isto que
--       separa "atualização" de "porta dos fundos": quem consegue escrever
--       nesta tabela manda código para as estações. Por isso a escrita é
--       restrita à operação da plataforma (RLS abaixo) e nunca ao cliente.
--
--    2. Uma versão publicada é imutável. Corrigiu algo? Publica 1.2.1, não
--       reaproveita a 1.2.0 com outro arquivo — senão máquinas que já baixaram
--       ficam com um binário diferente do que a tabela descreve.
--
--  Distribuição em fases: organizations.versao_agente_fixada prende UMA empresa
--  numa versão específica. É o freio de mão — subiu algo ruim, fixa as
--  empresas grandes na anterior enquanto se corrige.
-- ============================================================================

create table if not exists versoes_agente (
    versao        text primary key,
    url           text not null,
    sha256        text not null check (sha256 ~ '^[0-9a-f]{64}$'),
    tamanho_bytes bigint,
    notas         text,
    -- A versão que a frota deve rodar quando a empresa não fixou nenhuma.
    -- Só uma fica verdadeira; garantido pelo índice único parcial abaixo.
    vigente       boolean not null default false,
    publicada_em  timestamptz not null default now()
);

create unique index if not exists idx_versao_vigente_unica
    on versoes_agente ((vigente)) where vigente;

comment on table versoes_agente is
    'Versões publicadas do agente. O sha256 é a âncora de confiança: quem escreve aqui manda código para as estações.';

-- Freio de mão por empresa.
alter table organizations
    add column if not exists versao_agente_fixada text references versoes_agente(versao);

comment on column organizations.versao_agente_fixada is
    'Prende esta empresa numa versão específica do agente. NULL = segue a vigente. Usado para segurar a frota quando uma versão sai ruim.';

-- ----------------------------------------------------------------------------
--  RLS: todo mundo lê (a estação precisa saber para onde ir), só a plataforma escreve
-- ----------------------------------------------------------------------------
alter table versoes_agente enable row level security;

drop policy if exists versoes_leitura on versoes_agente;
create policy versoes_leitura on versoes_agente
    for select using (true);

drop policy if exists versoes_escrita on versoes_agente;
create policy versoes_escrita on versoes_agente
    for all using (eh_admin_plataforma()) with check (eh_admin_plataforma());

-- ----------------------------------------------------------------------------
--  Publicar: marca a nova como vigente e desmarca a anterior, numa transação
-- ----------------------------------------------------------------------------
create or replace function publicar_versao_agente(
    p_versao  text,
    p_url     text,
    p_sha256  text,
    p_tamanho bigint default null,
    p_notas   text default null,
    p_vigente boolean default true
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    if not eh_admin_plataforma() then
        raise exception 'Só a operação da plataforma publica versão do agente.';
    end if;

    -- Imutável de propósito: republicar a mesma versão com outro arquivo faria
    -- as estações que já baixaram divergirem do que a tabela descreve.
    if exists (select 1 from versoes_agente v where v.versao = p_versao) then
        raise exception 'A versão % já foi publicada. Publique uma nova (ex.: %.1).', p_versao, p_versao;
    end if;

    if p_vigente then
        update versoes_agente set vigente = false where vigente;
    end if;

    insert into versoes_agente (versao, url, sha256, tamanho_bytes, notas, vigente)
    values (p_versao, p_url, lower(p_sha256), p_tamanho, p_notas, p_vigente);
end;
$$;

-- ----------------------------------------------------------------------------
--  A configuração que a estação recebe passa a carregar o alvo de atualização
-- ----------------------------------------------------------------------------
create or replace function configuracao_agente(p_org uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
    with alvo as (
        -- A versão fixada da empresa manda; sem ela, a vigente.
        select v.*
          from organizations o
          left join versoes_agente v
                 on v.versao = coalesce(
                        o.versao_agente_fixada,
                        (select v2.versao from versoes_agente v2 where v2.vigente limit 1))
         where o.id = p_org
    )
    select jsonb_build_object(
        'minutos_entre_sincronizacoes', o.sync_interval_minutes,
        'segundos_para_ocioso',         o.agente_segundos_ocioso,
        'janela_coleta_inicio',         coalesce(o.agente_janela_inicio, ''),
        'janela_coleta_fim',            coalesce(o.agente_janela_fim, ''),
        'extrair_dominio_navegador',    o.agente_extrair_dominio,
        'mostrar_icone_bandeja',        o.agente_mostrar_bandeja,
        'redigir_numeros_longos',       o.agente_redigir_numeros,
        'tamanho_lote',                 o.agente_tamanho_lote,
        'dias_retencao_local',          o.agente_dias_buffer,
        'processos_sigilosos',          to_jsonb(o.agente_processos_sigilosos),
        -- Alvo de atualização. Nulo quando nenhuma versão foi publicada ainda —
        -- e aí o agente simplesmente não tem para onde ir, que é o correto.
        'atualizacao', (
            select case when a.versao is null then null else jsonb_build_object(
                'versao', a.versao,
                'url',    a.url,
                'sha256', a.sha256,
                'tamanho_bytes', a.tamanho_bytes
            ) end from alvo a
        ),
        'assinatura',                   md5(
            coalesce(o.sync_interval_minutes::text, '') ||
            o.agente_segundos_ocioso::text ||
            coalesce(o.agente_janela_inicio, '') ||
            coalesce(o.agente_janela_fim, '') ||
            o.agente_extrair_dominio::text ||
            o.agente_mostrar_bandeja::text ||
            o.agente_redigir_numeros::text ||
            o.agente_tamanho_lote::text ||
            o.agente_dias_buffer::text ||
            array_to_string(o.agente_processos_sigilosos, ',')
        )
    )
      from organizations o
     where o.id = p_org;
$$;

comment on function configuracao_agente is
    'Configuração entregue à estação a cada sincronização, incluindo o alvo de atualização (versão, url e sha256). A assinatura cobre só a configuração de coleta: a atualização é decidida comparando versões, não pela assinatura.';
