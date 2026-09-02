-- ============================================================================
--  Telemetria de Produtividade — Schema principal
--  PostgreSQL / Supabase
--
--  Modelo multi-tenant: cada organização enxerga apenas os próprios dados,
--  garantido por Row Level Security ancorada na tabela profiles (auth.uid -> org).
--  A ingestão dos agentes NÃO passa por este RLS: entra por uma Edge Function
--  que valida o token do dispositivo com a service_role e insere já com o org_id
--  correto. O RLS abaixo protege a leitura pelo Dashboard.
-- ============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
--  Tipos
-- ----------------------------------------------------------------------------
do $$
begin
    if not exists (select 1 from pg_type where typname = 'categoria_produtividade') then
        create type categoria_produtividade as enum ('PRODUCTIVE', 'NEUTRAL', 'UNPRODUCTIVE');
    end if;
    if not exists (select 1 from pg_type where typname = 'papel_usuario') then
        create type papel_usuario as enum ('OWNER', 'MANAGER', 'VIEWER');
    end if;
end$$;

-- ----------------------------------------------------------------------------
--  Organizações
-- ----------------------------------------------------------------------------
create table if not exists organizations (
    id             uuid primary key default gen_random_uuid(),
    name           text not null,
    -- Chave que os agentes usam UMA vez para se matricular. Rotacionável.
    enrollment_key text not null unique default encode(gen_random_bytes(24), 'hex'),
    -- Intervalo de sincronização imposto aos agentes (remote config). NULL = usa o do agente.
    sync_interval_minutes int,
    created_at     timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
--  Perfis — liga auth.users à organização e ao papel
-- ----------------------------------------------------------------------------
create table if not exists profiles (
    id         uuid primary key references auth.users(id) on delete cascade,
    org_id     uuid not null references organizations(id) on delete cascade,
    full_name  text,
    role       papel_usuario not null default 'VIEWER',
    created_at timestamptz not null default now()
);

create index if not exists idx_profiles_org on profiles(org_id);

-- ----------------------------------------------------------------------------
--  Dispositivos (estações monitoradas)
-- ----------------------------------------------------------------------------
create table if not exists devices (
    id            uuid primary key default gen_random_uuid(),
    org_id        uuid not null references organizations(id) on delete cascade,
    machine_name  text not null,
    os_user       text,
    hardware_id   text not null,
    -- Autenticação do agente: guardamos só o hash do token; o texto vive na máquina.
    token_hash    text,
    token_prefix  text,
    agent_version text,
    status_online boolean not null default false,
    last_sync_at  timestamptz,
    created_at    timestamptz not null default now(),
    unique (org_id, hardware_id)
);

create index if not exists idx_devices_org on devices(org_id);

-- ----------------------------------------------------------------------------
--  Categorias de produtividade e mapeamento de app/domínio -> categoria
-- ----------------------------------------------------------------------------
create table if not exists productivity_categories (
    id         uuid primary key default gen_random_uuid(),
    org_id     uuid not null references organizations(id) on delete cascade,
    name       text not null,
    type       categoria_produtividade not null default 'NEUTRAL',
    color      text,
    created_at timestamptz not null default now(),
    unique (org_id, name)
);

create index if not exists idx_categories_org on productivity_categories(org_id);

create table if not exists app_mappings (
    id           uuid primary key default gen_random_uuid(),
    org_id       uuid not null references organizations(id) on delete cascade,
    process_name text,
    domain       text,
    category_id  uuid references productivity_categories(id) on delete set null,
    created_at   timestamptz not null default now(),
    -- Um mapeamento é por processo OU por domínio, não os dois vazios.
    constraint chk_mapping_alvo check (process_name is not null or domain is not null)
);

create index if not exists idx_mappings_org on app_mappings(org_id);
create index if not exists idx_mappings_process on app_mappings(org_id, lower(process_name));
create index if not exists idx_mappings_domain on app_mappings(org_id, lower(domain));

-- ----------------------------------------------------------------------------
--  Logs de atividade (fato principal, alto volume: 1 linha/minuto/estação)
-- ----------------------------------------------------------------------------
create table if not exists activity_logs (
    id                 bigint generated always as identity primary key,
    device_id          uuid not null references devices(id) on delete cascade,
    org_id             uuid not null references organizations(id) on delete cascade,
    "timestamp"        timestamptz not null,
    process_name       text not null,
    window_title       text not null default '',
    domain             text,
    is_idle            boolean not null default false,
    is_locked          boolean not null default false,
    keystrokes_count   int not null default 0,
    mouse_clicks_count int not null default 0,
    scroll_count       int not null default 0,
    active_seconds     int not null default 0,
    foreground_seconds int not null default 0,
    os_user            text,
    created_at         timestamptz not null default now(),
    -- Deduplicação: o mesmo minuto do mesmo dispositivo entra uma vez só.
    -- Reenvios após queda de rede são absorvidos sem duplicar dado.
    unique (device_id, "timestamp", process_name)
);

-- Índice B-Tree composto: acelera os recortes por estação + período do Dashboard.
create index if not exists idx_logs_device_timestamp on activity_logs(device_id, "timestamp" desc);
-- Recorte por organização + período (visões agregadas do time).
create index if not exists idx_logs_org_timestamp on activity_logs(org_id, "timestamp" desc);
-- Distribuição por app/domínio.
create index if not exists idx_logs_org_process on activity_logs(org_id, process_name);

-- ============================================================================
--  Agregado: resumo diário de produtividade (Materialized View)
--  Acelera os gráficos de tendência. Atualizada por refresh_daily_summary().
-- ============================================================================
drop materialized view if exists daily_productivity_summary;
create materialized view daily_productivity_summary as
select
    l.org_id,
    l.device_id,
    d.machine_name,
    d.os_user,
    date_trunc('day', l."timestamp") as dia,
    count(*)                                            as minutos_registrados,
    count(*) filter (where l.is_idle)                   as minutos_ociosos,
    count(*) filter (where l.is_locked)                 as minutos_bloqueado,
    count(*) filter (where not l.is_idle and not l.is_locked) as minutos_ativos,
    coalesce(sum(l.active_seconds), 0)                  as segundos_ativos,
    coalesce(sum(l.keystrokes_count), 0)                as total_teclas,
    coalesce(sum(l.mouse_clicks_count), 0)              as total_cliques,
    coalesce(sum(l.scroll_count), 0)                    as total_rolagens,
    count(*) filter (where c.type = 'PRODUCTIVE')       as minutos_produtivos,
    count(*) filter (where c.type = 'NEUTRAL')          as minutos_neutros,
    count(*) filter (where c.type = 'UNPRODUCTIVE')     as minutos_improdutivos
from activity_logs l
join devices d on d.id = l.device_id
left join app_mappings m
       on m.org_id = l.org_id
      and (
            (m.process_name is not null and lower(m.process_name) = lower(l.process_name))
         or (m.domain is not null and l.domain is not null and lower(m.domain) = lower(l.domain))
          )
left join productivity_categories c on c.id = m.category_id
group by l.org_id, l.device_id, d.machine_name, d.os_user, date_trunc('day', l."timestamp");

-- Índice único obrigatório para permitir REFRESH ... CONCURRENTLY.
create unique index if not exists idx_daily_summary_unico
    on daily_productivity_summary(org_id, device_id, dia);
create index if not exists idx_daily_summary_org_dia
    on daily_productivity_summary(org_id, dia desc);

create or replace function refresh_daily_summary()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    refresh materialized view concurrently daily_productivity_summary;
end;
$$;

-- ============================================================================
--  Segurança: Row Level Security (leitura pelo Dashboard)
-- ============================================================================

-- org_id do usuário autenticado. STABLE para o planner cachear na query.
create or replace function auth_org_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
    select org_id from profiles where id = auth.uid();
$$;

create or replace function auth_papel()
returns papel_usuario
language sql
stable
security definer
set search_path = public
as $$
    select role from profiles where id = auth.uid();
$$;

alter table organizations           enable row level security;
alter table profiles                enable row level security;
alter table devices                 enable row level security;
alter table productivity_categories enable row level security;
alter table app_mappings            enable row level security;
alter table activity_logs           enable row level security;

-- Organização: cada um enxerga só a sua.
drop policy if exists org_select on organizations;
create policy org_select on organizations
    for select using (id = auth_org_id());

drop policy if exists org_update on organizations;
create policy org_update on organizations
    for update using (id = auth_org_id() and auth_papel() = 'OWNER');

-- Profiles: vê os colegas da mesma org; só OWNER/MANAGER administram.
drop policy if exists profiles_select on profiles;
create policy profiles_select on profiles
    for select using (org_id = auth_org_id());

drop policy if exists profiles_admin on profiles;
create policy profiles_admin on profiles
    for all using (org_id = auth_org_id() and auth_papel() in ('OWNER', 'MANAGER'))
    with check (org_id = auth_org_id() and auth_papel() in ('OWNER', 'MANAGER'));

-- Devices: leitura por toda a org; escrita administrativa por OWNER/MANAGER.
drop policy if exists devices_select on devices;
create policy devices_select on devices
    for select using (org_id = auth_org_id());

drop policy if exists devices_admin on devices;
create policy devices_admin on devices
    for all using (org_id = auth_org_id() and auth_papel() in ('OWNER', 'MANAGER'))
    with check (org_id = auth_org_id() and auth_papel() in ('OWNER', 'MANAGER'));

-- Categorias e mapeamentos: leitura pela org; escrita por OWNER/MANAGER.
drop policy if exists categories_select on productivity_categories;
create policy categories_select on productivity_categories
    for select using (org_id = auth_org_id());
drop policy if exists categories_admin on productivity_categories;
create policy categories_admin on productivity_categories
    for all using (org_id = auth_org_id() and auth_papel() in ('OWNER', 'MANAGER'))
    with check (org_id = auth_org_id() and auth_papel() in ('OWNER', 'MANAGER'));

drop policy if exists mappings_select on app_mappings;
create policy mappings_select on app_mappings
    for select using (org_id = auth_org_id());
drop policy if exists mappings_admin on app_mappings;
create policy mappings_admin on app_mappings
    for all using (org_id = auth_org_id() and auth_papel() in ('OWNER', 'MANAGER'))
    with check (org_id = auth_org_id() and auth_papel() in ('OWNER', 'MANAGER'));

-- Logs de atividade: SOMENTE leitura, e só da própria org. A escrita é feita
-- pela Edge Function com service_role (que ignora RLS por definição).
drop policy if exists logs_select on activity_logs;
create policy logs_select on activity_logs
    for select using (org_id = auth_org_id());

-- ============================================================================
--  Índice auxiliar para marcar dispositivos online (última sincronização recente)
-- ============================================================================
create index if not exists idx_devices_last_sync on devices(org_id, last_sync_at desc);

comment on table activity_logs is
    'Metadados de atividade por minuto. Nao contem conteudo digitado, telas ou mensagens (LGPD).';
comment on column activity_logs.keystrokes_count is
    'Apenas a QUANTIDADE de teclas pressionadas no minuto. Nenhuma tecla especifica e registrada.';
