-- ============================================================================
--  Agendamentos e manutenção automática (pg_cron)
--  Refresh periódico do agregado e marcação de dispositivos offline.
--  pg_cron está disponível nos projetos Supabase; se o seu plano não tiver,
--  chame refresh_daily_summary() por uma rotina externa (ex.: cron de CI).
-- ============================================================================

create extension if not exists pg_cron;

-- Marca como offline quem não sincroniza há mais de 15 minutos.
create or replace function marcar_dispositivos_offline()
returns void
language sql
security definer
set search_path = public
as $$
    update devices
       set status_online = false
     where status_online = true
       and (last_sync_at is null or last_sync_at < now() - interval '15 minutes');
$$;

-- Refresh do resumo diário a cada 10 minutos.
select cron.schedule(
    'refresh-daily-summary',
    '*/10 * * * *',
    $$ select refresh_daily_summary(); $$
);

-- Verificação de dispositivos offline a cada 5 minutos.
select cron.schedule(
    'marcar-offline',
    '*/5 * * * *',
    $$ select marcar_dispositivos_offline(); $$
);
