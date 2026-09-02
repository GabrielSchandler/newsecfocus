-- ============================================================================
--  Seed de exemplo. Cria uma empresa cliente de demonstração com equipes,
--  categorias e mapeamentos padrão. Rode ao subir o ambiente local:
--      supabase db reset   (aplica migrations + seed)
--
--  Anote a enrollment_key gerada — é o que vai no appsettings.json do agente.
-- ============================================================================

insert into organizations (id, name, slug, status, plano, max_dispositivos, contato_email)
values (
    '00000000-0000-0000-0000-000000000001',
    'Empresa Demonstração',
    'empresa-demonstracao',
    'TRIAL',
    'ESSENCIAL',
    25,
    'contato@demonstracao.com.br'
)
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
--  Equipes
-- ----------------------------------------------------------------------------
insert into teams (id, org_id, nome, descricao, cor) values
    ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000001',
     'Comercial',    'Prospecção, propostas e fechamento',        '#22d3ee'),
    ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-000000000001',
     'Operações',    'Execução e atendimento ao cliente',         '#a78bfa'),
    ('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-000000000001',
     'Administrativo', 'Financeiro, RH e suporte interno',        '#34d399')
on conflict do nothing;

-- ----------------------------------------------------------------------------
--  Categorias de produtividade padrão
-- ----------------------------------------------------------------------------
insert into productivity_categories (org_id, name, type, color) values
    ('00000000-0000-0000-0000-000000000001', 'Trabalho / Produção', 'PRODUCTIVE',   '#22d3ee'),
    ('00000000-0000-0000-0000-000000000001', 'Comunicação',         'NEUTRAL',      '#a78bfa'),
    ('00000000-0000-0000-0000-000000000001', 'Distração',           'UNPRODUCTIVE', '#fb7185')
on conflict (org_id, name) do nothing;

-- ----------------------------------------------------------------------------
--  Mapeamentos de exemplo (processo/domínio -> categoria)
-- ----------------------------------------------------------------------------
do $$
declare
    v_org       uuid := '00000000-0000-0000-0000-000000000001';
    v_produtivo uuid;
    v_neutro    uuid;
    v_improd    uuid;
begin
    select id into v_produtivo from productivity_categories
        where org_id = v_org and name = 'Trabalho / Produção';
    select id into v_neutro from productivity_categories
        where org_id = v_org and name = 'Comunicação';
    select id into v_improd from productivity_categories
        where org_id = v_org and name = 'Distração';

    insert into app_mappings (org_id, process_name, domain, category_id) values
        (v_org, 'code.exe',     null,             v_produtivo),
        (v_org, 'excel.exe',    null,             v_produtivo),
        (v_org, 'winword.exe',  null,             v_produtivo),
        (v_org, 'powerpnt.exe', null,             v_produtivo),
        (v_org, null,           'github.com',     v_produtivo),
        (v_org, null,           'docs.google.com',v_produtivo),
        (v_org, 'outlook.exe',  null,             v_neutro),
        (v_org, 'teams.exe',    null,             v_neutro),
        (v_org, 'whatsapp.exe', null,             v_neutro),
        (v_org, null,           'youtube.com',    v_improd),
        (v_org, null,           'instagram.com',  v_improd),
        (v_org, null,           'facebook.com',   v_improd)
    on conflict do nothing;
end$$;

-- ----------------------------------------------------------------------------
--  Depois de criar o usuário gestor no Authentication, ligue-o à empresa:
--
--      insert into profiles (id, org_id, full_name, role)
--      values ('<uuid-do-usuario>', '00000000-0000-0000-0000-000000000001',
--              'Gestor', 'OWNER');
--
--  Para um líder que só enxerga uma equipe, use role = 'TEAM_LEAD' e informe
--  o team_id correspondente.
--
--  E para liberar o painel da revenda (/plataforma) ao seu próprio usuário:
--
--      insert into plataforma_admins (user_id, nome)
--      values ('<uuid-do-seu-usuario>', 'Operação');
-- ----------------------------------------------------------------------------

select 'Enrollment key da empresa demo:' as aviso, enrollment_key
from organizations where id = '00000000-0000-0000-0000-000000000001';
