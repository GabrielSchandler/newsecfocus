-- ============================================================================
--  0004 — Modelo SaaS de revenda: plataforma, empresas, equipes e colaboradores
--
--  Hierarquia do produto:
--
--      Plataforma (revendedor)
--        └── Empresa cliente         (organizations)
--              └── Equipe            (teams)       — pertence a 1 empresa
--                    └── Colaborador (employees)   — pertence a 1 equipe
--                          └── Atividade           (activity_logs)
--
--  Regra de negócio: uma pessoa pertence a UMA equipe; uma equipe pertence a
--  UMA empresa. O vínculo do colaborador com a máquina é por usuário do SO
--  (os_user), resolvido na ingestão — a mesma pessoa em duas estações continua
--  sendo uma pessoa só.
--
--  Privacidade: o administrador da PLATAFORMA administra contas, não enxerga
--  telemetria. As políticas abaixo dão a ele acesso a organizations/profiles/
--  devices (gestão e cobrança) e nunca a activity_logs nem aos resumos.
-- ============================================================================

--  Pré-requisito: 0004_papel_lider_equipe.sql, que adiciona 'TEAM_LEAD' ao enum
--  papel_usuario numa transação separada — valor de enum novo não pode ser usado
--  na mesma transação em que foi criado.

-- ----------------------------------------------------------------------------
--  1. Administradores da plataforma (a revenda)
-- ----------------------------------------------------------------------------
create table if not exists plataforma_admins (
    user_id    uuid primary key references auth.users(id) on delete cascade,
    nome       text,
    created_at timestamptz not null default now()
);

alter table plataforma_admins enable row level security;

create or replace function eh_admin_plataforma()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (select 1 from plataforma_admins where user_id = auth.uid());
$$;

drop policy if exists plataforma_admins_select on plataforma_admins;
create policy plataforma_admins_select on plataforma_admins
    for select using (user_id = auth.uid() or eh_admin_plataforma());

-- ----------------------------------------------------------------------------
--  2. Empresa cliente ganha atributos de conta SaaS
-- ----------------------------------------------------------------------------
alter table organizations
    add column if not exists slug             text,
    add column if not exists status           text not null default 'TRIAL',
    add column if not exists plano            text not null default 'ESSENCIAL',
    add column if not exists max_dispositivos int  not null default 25,
    add column if not exists fuso             text not null default 'America/Sao_Paulo',
    add column if not exists retencao_dias    int  not null default 90,
    add column if not exists contato_email    text,
    add column if not exists trial_termina_em timestamptz,
    add column if not exists criada_por       uuid references auth.users(id) on delete set null;

do $$
begin
    if not exists (select 1 from pg_constraint where conname = 'chk_org_status') then
        alter table organizations add constraint chk_org_status
            check (status in ('TRIAL', 'ATIVA', 'SUSPENSA', 'CANCELADA'));
    end if;
    if not exists (select 1 from pg_constraint where conname = 'chk_org_retencao') then
        alter table organizations add constraint chk_org_retencao
            check (retencao_dias between 7 and 3650);
    end if;
end$$;

-- Slug legível para a URL do painel da plataforma (/plataforma/empresas/acme).
update organizations
   set slug = regexp_replace(lower(name), '[^a-z0-9]+', '-', 'g') || '-' || left(id::text, 4)
 where slug is null;

alter table organizations alter column slug set not null;
create unique index if not exists idx_org_slug on organizations(slug);

comment on column organizations.fuso is
    'Fuso IANA da empresa. Define a virada do dia em TODOS os relatórios e agregados.';
comment on column organizations.retencao_dias is
    'Dias que a atividade minuto-a-minuto fica guardada. Os resumos são permanentes.';

-- ----------------------------------------------------------------------------
--  3. Equipes
-- ----------------------------------------------------------------------------
create table if not exists teams (
    id         uuid primary key default gen_random_uuid(),
    org_id     uuid not null references organizations(id) on delete cascade,
    nome       text not null,
    descricao  text,
    cor        text,
    ativa      boolean not null default true,
    created_at timestamptz not null default now()
);

create unique index if not exists idx_teams_org_nome on teams(org_id, lower(nome));
create index if not exists idx_teams_org on teams(org_id);

-- ----------------------------------------------------------------------------
--  4. Colaboradores (as pessoas monitoradas)
--
--  Identidade técnica: (org_id, os_user). O agente manda o usuário do Windows;
--  a ingestão resolve ou cria o colaborador. O gestor depois complementa nome,
--  cargo e equipe pela tela de administração.
-- ----------------------------------------------------------------------------
create table if not exists employees (
    id         uuid primary key default gen_random_uuid(),
    org_id     uuid not null references organizations(id) on delete cascade,
    team_id    uuid references teams(id) on delete set null,
    os_user    text not null,
    nome       text,
    cargo      text,
    email      text,
    ativo      boolean not null default true,
    -- Jornada esperada: base do indicador de aderência (% da jornada com atividade).
    jornada_minutos_dia int not null default 480,
    created_at timestamptz not null default now()
);

create unique index if not exists idx_employees_org_osuser on employees(org_id, lower(os_user));
create index if not exists idx_employees_org on employees(org_id);
create index if not exists idx_employees_team on employees(team_id);

comment on table employees is
    'Pessoa monitorada. Uma pessoa pertence a no máximo uma equipe (team_id).';

-- ----------------------------------------------------------------------------
--  5. Atividade passa a apontar para a pessoa, não só para a máquina
-- ----------------------------------------------------------------------------
alter table activity_logs
    add column if not exists employee_id uuid references employees(id) on delete cascade;

create index if not exists idx_logs_employee_timestamp
    on activity_logs(employee_id, "timestamp" desc);

-- ----------------------------------------------------------------------------
--  6. Perfis de acesso ganham escopo de equipe
-- ----------------------------------------------------------------------------
alter table profiles
    add column if not exists team_id uuid references teams(id) on delete set null,
    add column if not exists ativo   boolean not null default true;

comment on column profiles.team_id is
    'Obrigatório para o papel TEAM_LEAD: delimita a equipe que esse gestor enxerga.';

-- ----------------------------------------------------------------------------
--  7. Resolução de colaborador na ingestão
--
--  SECURITY DEFINER: chamada pela Edge Function ao gravar o lote do agente.
--  Normaliza o os_user (tira DOMINIO\ e caixa) e devolve o id, criando o
--  colaborador na primeira vez que aquela pessoa aparece.
-- ----------------------------------------------------------------------------
create or replace function normalizar_os_user(p_os_user text)
returns text
language sql
immutable
as $$
    select nullif(
        btrim(
            case
                when p_os_user is null then ''
                -- "EMPRESA\joao.silva" e "joao@empresa.local" viram "joao.silva" / "joao".
                when position(chr(92) in p_os_user) > 0 then split_part(p_os_user, chr(92), 2)
                when position('@' in p_os_user) > 0 then split_part(p_os_user, '@', 1)
                else p_os_user
            end
        ),
        ''
    );
$$;

create or replace function resolver_colaborador(p_org uuid, p_os_user text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    v_usuario text := coalesce(normalizar_os_user(p_os_user), '(não identificado)');
    v_id      uuid;
begin
    select id into v_id
      from employees
     where org_id = p_org and lower(os_user) = lower(v_usuario);

    if v_id is not null then
        return v_id;
    end if;

    insert into employees (org_id, os_user, nome)
    values (p_org, v_usuario, initcap(replace(replace(v_usuario, '.', ' '), '_', ' ')))
    on conflict (org_id, lower(os_user)) do update set os_user = excluded.os_user
    returning id into v_id;

    return v_id;
end;
$$;

-- Preenche os registros que já existiam antes desta migration.
update activity_logs l
   set employee_id = resolver_colaborador(l.org_id, l.os_user)
 where l.employee_id is null;

-- ----------------------------------------------------------------------------
--  8. Row Level Security das entidades novas
-- ----------------------------------------------------------------------------

-- Equipe que delimita o usuário logado: NULL = enxerga a empresa inteira.
create or replace function auth_escopo_equipe()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
    select case when role = 'TEAM_LEAD' then team_id else null end
      from profiles
     where id = auth.uid();
$$;

-- Papéis que podem administrar cadastros da empresa.
create or replace function auth_pode_administrar()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select coalesce(
        (select role in ('OWNER', 'MANAGER') from profiles where id = auth.uid()),
        false
    );
$$;

alter table teams     enable row level security;
alter table employees enable row level security;

drop policy if exists teams_select on teams;
create policy teams_select on teams
    for select using (
        org_id = auth_org_id()
        and (auth_escopo_equipe() is null or id = auth_escopo_equipe())
    );

drop policy if exists teams_admin on teams;
create policy teams_admin on teams
    for all using (org_id = auth_org_id() and auth_pode_administrar())
    with check (org_id = auth_org_id() and auth_pode_administrar());

drop policy if exists employees_select on employees;
create policy employees_select on employees
    for select using (
        org_id = auth_org_id()
        and (auth_escopo_equipe() is null or team_id = auth_escopo_equipe())
    );

drop policy if exists employees_admin on employees;
create policy employees_admin on employees
    for all using (org_id = auth_org_id() and auth_pode_administrar())
    with check (org_id = auth_org_id() and auth_pode_administrar());

-- Atividade: além da empresa, respeita o escopo de equipe do líder.
drop policy if exists logs_select on activity_logs;
create policy logs_select on activity_logs
    for select using (
        org_id = auth_org_id()
        and (
            auth_escopo_equipe() is null
            or employee_id in (select id from employees where team_id = auth_escopo_equipe())
        )
    );

-- Dispositivos: o líder de equipe só vê as máquinas onde a equipe dele trabalhou.
drop policy if exists devices_select on devices;
create policy devices_select on devices
    for select using (
        org_id = auth_org_id()
        and (
            auth_escopo_equipe() is null
            or exists (
                select 1
                  from activity_logs l
                  join employees e on e.id = l.employee_id
                 where l.device_id = devices.id
                   and e.team_id = auth_escopo_equipe()
            )
        )
    );

-- ----------------------------------------------------------------------------
--  9. Acesso do administrador da PLATAFORMA — contas, nunca telemetria
-- ----------------------------------------------------------------------------
drop policy if exists org_select on organizations;
create policy org_select on organizations
    for select using (id = auth_org_id() or eh_admin_plataforma());

drop policy if exists org_admin_plataforma on organizations;
create policy org_admin_plataforma on organizations
    for all using (eh_admin_plataforma())
    with check (eh_admin_plataforma());

drop policy if exists profiles_select on profiles;
create policy profiles_select on profiles
    for select using (org_id = auth_org_id() or eh_admin_plataforma());

drop policy if exists devices_plataforma on devices;
create policy devices_plataforma on devices
    for select using (eh_admin_plataforma());

comment on function eh_admin_plataforma() is
    'Operador da revenda. Administra contas de empresas; NÃO tem política de leitura em activity_logs nem nos resumos — a telemetria pertence à empresa cliente (LGPD).';

-- ----------------------------------------------------------------------------
--  10. Trava de contratação: não matricular mais estações que o plano permite
-- ----------------------------------------------------------------------------
create or replace function checar_limite_dispositivos()
returns trigger
language plpgsql
as $$
declare
    v_limite int;
    v_atual  int;
begin
    select max_dispositivos into v_limite from organizations where id = new.org_id;
    select count(*) into v_atual from devices where org_id = new.org_id;

    if v_atual >= v_limite then
        raise exception 'Limite de % dispositivos do plano atingido para esta empresa.', v_limite
            using errcode = 'check_violation';
    end if;

    return new;
end;
$$;

drop trigger if exists trg_limite_dispositivos on devices;
create trigger trg_limite_dispositivos
    before insert on devices
    for each row execute function checar_limite_dispositivos();
