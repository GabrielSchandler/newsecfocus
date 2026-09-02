-- ============================================================================
--  0009 — Configuração remota do agente
--
--  Problema: mudar como o agente coleta ou envia exigia ir de máquina em
--  máquina. Numa frota de 30 estações isso inviabiliza qualquer ajuste.
--
--  Agora a configuração mora na empresa, no banco. O agente pergunta a cada
--  sincronização e passa a obedecer sem ninguém tocar no computador.
--
--  Isto cobre MUDANÇA DE PARÂMETRO (janela de coleta, intervalo de envio,
--  limiar de ócio, quais apps têm o título omitido). Trocar o BINÁRIO — corrigir
--  um bug, coletar um campo novo — é outra coisa, exige o instalador assinado e
--  ainda não existe.
-- ============================================================================

alter table organizations
    add column if not exists agente_segundos_ocioso   int     not null default 180,
    add column if not exists agente_janela_inicio     text,
    add column if not exists agente_janela_fim        text,
    add column if not exists agente_extrair_dominio   boolean not null default true,
    add column if not exists agente_mostrar_bandeja   boolean not null default true,
    add column if not exists agente_redigir_numeros   boolean not null default true,
    add column if not exists agente_tamanho_lote      int     not null default 120,
    add column if not exists agente_dias_buffer       int     not null default 14,
    add column if not exists agente_processos_sigilosos text[] not null default array[
        'whatsapp.exe', 'telegram.exe', 'signal.exe', 'discord.exe',
        'slack.exe', 'keepass.exe', 'keepassxc.exe', '1password.exe', 'bitwarden.exe'
    ];

do $$
begin
    if not exists (select 1 from pg_constraint where conname = 'chk_agente_ocioso') then
        alter table organizations add constraint chk_agente_ocioso
            check (agente_segundos_ocioso between 30 and 3600);
    end if;
    if not exists (select 1 from pg_constraint where conname = 'chk_agente_lote') then
        alter table organizations add constraint chk_agente_lote
            check (agente_tamanho_lote between 10 and 500);
    end if;
    if not exists (select 1 from pg_constraint where conname = 'chk_agente_buffer') then
        alter table organizations add constraint chk_agente_buffer
            check (agente_dias_buffer between 1 and 90);
    end if;
    -- Janela de coleta: vazio (24h) ou HH:MM.
    if not exists (select 1 from pg_constraint where conname = 'chk_agente_janela') then
        alter table organizations add constraint chk_agente_janela check (
            (agente_janela_inicio is null or agente_janela_inicio ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
            and (agente_janela_fim is null or agente_janela_fim ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
        );
    end if;
end$$;

comment on column organizations.agente_janela_inicio is
    'Coleta só a partir deste horário (HH:MM). Vazio nos dois = 24 horas.';
comment on column organizations.agente_processos_sigilosos is
    'Executáveis cujo título de janela nunca é registrado — mensageria e cofres de senha.';

-- ----------------------------------------------------------------------------
--  Bloco entregue ao agente na resposta de cada sincronização.
--
--  SECURITY DEFINER porque quem chama é a Edge Function de ingestão, com
--  service_role, já tendo autenticado a máquina pelo token do dispositivo.
-- ----------------------------------------------------------------------------
create or replace function configuracao_agente(p_org uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
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
        -- Muda a cada alteração: o agente só regrava o arquivo local quando
        -- este valor difere do que ele já aplicou.
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

revoke execute on function configuracao_agente(uuid) from public, anon, authenticated;
grant execute on function configuracao_agente(uuid) to service_role;
