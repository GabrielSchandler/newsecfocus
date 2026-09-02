-- ============================================================================
--  0007 — Visão master, jornada configurável, catálogo padrão e registros brutos
--
--  Quatro mudanças pedidas depois do primeiro teste real:
--
--  1. VISÃO MASTER — a operação da NewSec passa a enxergar as empresas clientes
--     e os dados delas. Login de empresa continua vendo só o próprio: quem não
--     está em plataforma_admins não ganha nada com esta migration.
--
--     ⚠️ Isto REVERTE a decisão da 0004, que proibia a plataforma de ler
--     telemetria. Mudança consciente do dono do produto. Consequência prática:
--     a NewSec passa a tratar dado de funcionário de empresa terceira, o que a
--     coloca como operadora perante a LGPD e deve estar no contrato.
--
--  2. JORNADA — deixa de ser fixa por pessoa. A empresa define o padrão e cada
--     colaborador pode ter exceção; NULL em employees significa "usa o padrão".
--
--  3. CATÁLOGO PADRÃO — empresa nova nascia sem nenhuma classificação, então o
--     índice aparecia como "sem classificação" na primeira demonstração. Agora
--     nasce com um catálogo que a empresa ajusta depois.
--
--  4. REGISTROS BRUTOS — o painel só mostrava consolidado. Agora dá para abrir
--     a atividade minuto a minuto por dispositivo e por pessoa.
-- ============================================================================

-- ----------------------------------------------------------------------------
--  1. Jornada de trabalho: padrão da empresa + exceção por pessoa
-- ----------------------------------------------------------------------------
alter table organizations
    add column if not exists jornada_padrao_minutos int not null default 480;

do $$
begin
    if not exists (select 1 from pg_constraint where conname = 'chk_org_jornada') then
        alter table organizations add constraint chk_org_jornada
            check (jornada_padrao_minutos between 60 and 1440);
    end if;
end$$;

-- NULL passa a significar "herda o padrão da empresa".
alter table employees alter column jornada_minutos_dia drop not null;
alter table employees alter column jornada_minutos_dia drop default;

comment on column organizations.jornada_padrao_minutos is
    'Jornada diária padrão da empresa, em minutos. Base do indicador de aderência.';
comment on column employees.jornada_minutos_dia is
    'Exceção de jornada desta pessoa. NULL = usa organizations.jornada_padrao_minutos.';

-- Jornada efetiva de um colaborador. Centralizada para o painel e os relatórios
-- não divergirem entre si.
create or replace function jornada_efetiva(p_pessoal int, p_padrao int)
returns int
language sql
immutable
as $$
    select greatest(coalesce(p_pessoal, p_padrao, 480), 1);
$$;

-- ----------------------------------------------------------------------------
--  2. Empresa em foco
--
--  Usuário comum só enxerga a própria empresa. Admin da plataforma escolhe qual
--  empresa está olhando; sem escolha, cai na própria. Devolver NULL quando não
--  há permissão faz a consulta voltar vazia em vez de vazar dado.
-- ----------------------------------------------------------------------------
create or replace function org_em_foco(p_org uuid default null)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
    select case
        when p_org is null            then auth_org_id()
        when p_org = auth_org_id()    then p_org
        when eh_admin_plataforma()    then p_org
        else null
    end;
$$;

create or replace function fuso_da_org(p_org uuid default null)
returns text
language sql
stable
security definer
set search_path = public
as $$
    select coalesce(
        (select o.fuso from organizations o where o.id = org_em_foco(p_org)),
        'America/Sao_Paulo'
    );
$$;

-- ----------------------------------------------------------------------------
--  3. RLS: a plataforma passa a ler os dados das empresas clientes
-- ----------------------------------------------------------------------------
drop policy if exists logs_select on activity_logs;
create policy logs_select on activity_logs
    for select using (
        eh_admin_plataforma()
        or (
            org_id = auth_org_id()
            and (
                auth_escopo_equipe() is null
                or employee_id in (select id from employees where team_id = auth_escopo_equipe())
            )
        )
    );

drop policy if exists resumo_horario_select on resumo_horario;
create policy resumo_horario_select on resumo_horario
    for select using (
        eh_admin_plataforma()
        or (
            org_id = auth_org_id()
            and (
                auth_escopo_equipe() is null
                or employee_id in (select id from employees where team_id = auth_escopo_equipe())
            )
        )
    );

drop policy if exists resumo_diario_select on resumo_diario;
create policy resumo_diario_select on resumo_diario
    for select using (
        eh_admin_plataforma()
        or (
            org_id = auth_org_id()
            and (
                auth_escopo_equipe() is null
                or employee_id in (select id from employees where team_id = auth_escopo_equipe())
            )
        )
    );

drop policy if exists resumo_app_select on resumo_app_diario;
create policy resumo_app_select on resumo_app_diario
    for select using (
        eh_admin_plataforma()
        or (
            org_id = auth_org_id()
            and (
                auth_escopo_equipe() is null
                or employee_id in (select id from employees where team_id = auth_escopo_equipe())
            )
        )
    );

drop policy if exists teams_select on teams;
create policy teams_select on teams
    for select using (
        eh_admin_plataforma()
        or (org_id = auth_org_id()
            and (auth_escopo_equipe() is null or id = auth_escopo_equipe()))
    );

drop policy if exists employees_select on employees;
create policy employees_select on employees
    for select using (
        eh_admin_plataforma()
        or (org_id = auth_org_id()
            and (auth_escopo_equipe() is null or team_id = auth_escopo_equipe()))
    );

drop policy if exists categories_select on productivity_categories;
create policy categories_select on productivity_categories
    for select using (org_id = auth_org_id() or eh_admin_plataforma());

drop policy if exists mappings_select on app_mappings;
create policy mappings_select on app_mappings
    for select using (org_id = auth_org_id() or eh_admin_plataforma());

drop policy if exists devices_select on devices;
create policy devices_select on devices
    for select using (
        eh_admin_plataforma()
        or (
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
        )
    );

comment on function eh_admin_plataforma() is
    'Operação da revenda (NewSec). Desde a migration 0007 também LÊ os dados das empresas clientes, por decisão do dono do produto — antes administrava apenas contas. Escrita de cadastro continua restrita à própria empresa.';

-- ----------------------------------------------------------------------------
--  4. Catálogo de produtividade padrão
--
--  Cobre o que aparece na maioria das operações administrativas brasileiras. É
--  ponto de partida, não verdade: a empresa ajusta em Administração, e o que
--  ela mudar não é sobrescrito (o insert ignora conflito).
-- ----------------------------------------------------------------------------
create or replace function aplicar_classificacao_padrao(p_org uuid)
returns table (categorias_criadas int, regras_criadas int)
language plpgsql
security definer
set search_path = public
as $$
declare
    v_produtivo uuid;
    v_comunicacao uuid;
    v_distracao uuid;
    v_cat int := 0;
    v_reg int := 0;
begin
    if not (p_org = auth_org_id() or eh_admin_plataforma()) then
        raise exception 'Sem permissão para configurar esta empresa.'
            using errcode = 'insufficient_privilege';
    end if;

    insert into productivity_categories (org_id, name, type, color) values
        (p_org, 'Trabalho / Produção', 'PRODUCTIVE',   '#22d3ee'),
        (p_org, 'Comunicação',         'NEUTRAL',      '#a78bfa'),
        (p_org, 'Distração',           'UNPRODUCTIVE', '#fb7185')
    on conflict (org_id, name) do nothing;

    select id into v_produtivo from productivity_categories
        where org_id = p_org and name = 'Trabalho / Produção';
    select id into v_comunicacao from productivity_categories
        where org_id = p_org and name = 'Comunicação';
    select id into v_distracao from productivity_categories
        where org_id = p_org and name = 'Distração';

    -- Processos produtivos: pacote Office, edição, engenharia e ERPs comuns.
    insert into app_mappings (org_id, process_name, domain, category_id)
    select p_org, processo, null, v_produtivo
      from unnest(array[
        'excel.exe', 'winword.exe', 'powerpnt.exe', 'onenote.exe', 'msaccess.exe',
        'visio.exe', 'project.exe', 'acrobat.exe', 'acrord32.exe',
        'code.exe', 'devenv.exe', 'notepad++.exe', 'sublime_text.exe', 'pycharm64.exe',
        'photoshop.exe', 'illustrator.exe', 'indesign.exe', 'coreldrw.exe',
        'acad.exe', 'revit.exe', 'sketchup.exe',
        'saplogon.exe', 'protheus.exe', 'winthor.exe'
      ]) as processo
     where not exists (
        select 1 from app_mappings m
         where m.org_id = p_org and lower(m.process_name) = lower(processo));

    -- Domínios produtivos: suítes de trabalho, gestão e portais de governo.
    insert into app_mappings (org_id, process_name, domain, category_id)
    select p_org, null, dominio, v_produtivo
      from unnest(array[
        'docs.google.com', 'sheets.google.com', 'drive.google.com', 'slides.google.com',
        'office.com', 'sharepoint.com', 'onedrive.live.com',
        'github.com', 'gitlab.com', 'atlassian.net', 'bitbucket.org',
        'trello.com', 'asana.com', 'monday.com', 'notion.so', 'clickup.com',
        'figma.com', 'canva.com', 'miro.com',
        'salesforce.com', 'rdstation.com.br', 'hubspot.com', 'pipedrive.com',
        'contaazul.com', 'omie.com.br', 'bling.com.br', 'tiny.com.br',
        'gov.br', 'receita.fazenda.gov.br', 'nfe.fazenda.gov.br',
        'esaj.tjsp.jus.br', 'pje.jus.br', 'stj.jus.br'
      ]) as dominio
     where not exists (
        select 1 from app_mappings m
         where m.org_id = p_org and lower(m.domain) = lower(dominio));

    -- Comunicação: neutro por padrão porque no Brasil também é canal de trabalho.
    insert into app_mappings (org_id, process_name, domain, category_id)
    select p_org, processo, null, v_comunicacao
      from unnest(array[
        'outlook.exe', 'teams.exe', 'ms-teams.exe', 'zoom.exe', 'slack.exe',
        'whatsapp.exe', 'telegram.exe'
      ]) as processo
     where not exists (
        select 1 from app_mappings m
         where m.org_id = p_org and lower(m.process_name) = lower(processo));

    insert into app_mappings (org_id, process_name, domain, category_id)
    select p_org, null, dominio, v_comunicacao
      from unnest(array[
        'mail.google.com', 'outlook.live.com', 'meet.google.com',
        'web.whatsapp.com', 'teams.microsoft.com', 'zoom.us',
        'chatgpt.com', 'claude.ai', 'gemini.google.com',
        'linkedin.com'
      ]) as dominio
     where not exists (
        select 1 from app_mappings m
         where m.org_id = p_org and lower(m.domain) = lower(dominio));

    -- Distração: entretenimento, redes sociais, compras e apostas.
    insert into app_mappings (org_id, process_name, domain, category_id)
    select p_org, processo, null, v_distracao
      from unnest(array['steam.exe', 'epicgameslauncher.exe', 'spotify.exe']) as processo
     where not exists (
        select 1 from app_mappings m
         where m.org_id = p_org and lower(m.process_name) = lower(processo));

    insert into app_mappings (org_id, process_name, domain, category_id)
    select p_org, null, dominio, v_distracao
      from unnest(array[
        'youtube.com', 'instagram.com', 'facebook.com', 'tiktok.com',
        'x.com', 'twitter.com', 'reddit.com', 'pinterest.com',
        'netflix.com', 'primevideo.com', 'globoplay.globo.com', 'disneyplus.com',
        'twitch.tv', 'kwai.com',
        'mercadolivre.com.br', 'shopee.com.br', 'amazon.com.br', 'aliexpress.com',
        'magazineluiza.com.br', 'americanas.com.br', 'shein.com',
        'bet365.com', 'betano.com', 'blaze.com'
      ]) as dominio
     where not exists (
        select 1 from app_mappings m
         where m.org_id = p_org and lower(m.domain) = lower(dominio));

    select count(*)::int into v_reg from app_mappings where org_id = p_org;
    select count(*)::int into v_cat from productivity_categories where org_id = p_org;

    return query select v_cat, v_reg;
end;
$$;

comment on function aplicar_classificacao_padrao(uuid) is
    'Preenche categorias e regras padrão. Idempotente: não sobrescreve o que a empresa já configurou.';

-- Empresas que já existiam também ganham o catálogo.
do $$
declare
    v_org uuid;
begin
    for v_org in select id from organizations loop
        perform aplicar_classificacao_padrao(v_org);
    end loop;
exception when insufficient_privilege then
    null; -- rodando como usuário sem permissão: ignora.
end$$;

-- ----------------------------------------------------------------------------
--  5. Registros brutos — a "visão operador", por dispositivo e por pessoa
--
--  Lê activity_logs direto, com paginação. O total vem na própria linha
--  (count over) para o painel montar a paginação sem uma segunda consulta.
--  Limitado pela retenção da empresa: fora dela, só existe o consolidado.
-- ----------------------------------------------------------------------------
create or replace function painel_registros(
    p_inicio      timestamptz,
    p_fim         timestamptz,
    p_org         uuid default null,
    p_colaborador uuid default null,
    p_dispositivo uuid default null,
    p_equipe      uuid default null,
    p_estado      text default null,   -- ATIVO | OCIOSO | BLOQUEADO
    p_busca       text default null,   -- processo, domínio ou título
    p_limite      int  default 100,
    p_deslocamento int default 0
)
returns table (
    momento        timestamptz,
    colaborador    text,
    equipe         text,
    maquina        text,
    processo       text,
    dominio        text,
    titulo         text,
    estado         text,
    teclas         int,
    cliques        int,
    rolagens       int,
    segundos_ativos int,
    total          bigint
)
language sql
stable
as $$
    select
        l."timestamp",
        coalesce(e.nome, e.os_user),
        coalesce(t.nome, 'Sem equipe'),
        d.machine_name,
        l.process_name,
        l.domain,
        l.window_title,
        case
            when l.is_locked then 'BLOQUEADO'
            when l.is_idle   then 'OCIOSO'
            else 'ATIVO'
        end,
        l.keystrokes_count,
        l.mouse_clicks_count,
        l.scroll_count,
        l.active_seconds,
        count(*) over ()
      from activity_logs l
      join employees e on e.id = l.employee_id
      left join teams t on t.id = e.team_id
      left join devices d on d.id = l.device_id
     where l.org_id = org_em_foco(p_org)
       and l."timestamp" >= p_inicio
       and l."timestamp" <  p_fim
       and (p_colaborador is null or l.employee_id = p_colaborador)
       and (p_dispositivo is null or l.device_id   = p_dispositivo)
       and (p_equipe      is null or e.team_id     = p_equipe)
       and (p_estado is null or p_estado = case
              when l.is_locked then 'BLOQUEADO'
              when l.is_idle   then 'OCIOSO'
              else 'ATIVO' end)
       and (
            p_busca is null or p_busca = ''
            or l.process_name ilike '%' || p_busca || '%'
            or l.domain       ilike '%' || p_busca || '%'
            or l.window_title ilike '%' || p_busca || '%'
       )
     order by l."timestamp" desc
     limit greatest(least(p_limite, 500), 1)
    offset greatest(p_deslocamento, 0);
$$;

comment on function painel_registros is
    'Atividade minuto a minuto, paginada. É o detalhe por trás do consolidado; existe só dentro da janela de retenção da empresa.';
