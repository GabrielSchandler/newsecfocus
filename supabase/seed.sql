-- ============================================================================
--  Seed de exemplo. Cria uma organização de demonstração e categorias/mapeamentos
--  padrão. Rode manualmente ao subir o ambiente local:
--      supabase db reset   (aplica migrations + seed)
--
--  Anote a enrollment_key gerada — é o que vai no appsettings.json do agente.
-- ============================================================================

insert into organizations (id, name)
values ('00000000-0000-0000-0000-000000000001', 'Organização Demonstração')
on conflict (id) do nothing;

-- Categorias de produtividade padrão.
insert into productivity_categories (org_id, name, type, color) values
    ('00000000-0000-0000-0000-000000000001', 'Trabalho / Produção', 'PRODUCTIVE',   '#22d3ee'),
    ('00000000-0000-0000-0000-000000000001', 'Comunicação',         'NEUTRAL',      '#a78bfa'),
    ('00000000-0000-0000-0000-000000000001', 'Distração',           'UNPRODUCTIVE', '#fb7185')
on conflict (org_id, name) do nothing;

-- Mapeamentos de exemplo (processo/domínio -> categoria).
do $$
declare
    v_produtivo uuid;
    v_neutro    uuid;
    v_improd    uuid;
begin
    select id into v_produtivo from productivity_categories
        where org_id = '00000000-0000-0000-0000-000000000001' and name = 'Trabalho / Produção';
    select id into v_neutro from productivity_categories
        where org_id = '00000000-0000-0000-0000-000000000001' and name = 'Comunicação';
    select id into v_improd from productivity_categories
        where org_id = '00000000-0000-0000-0000-000000000001' and name = 'Distração';

    insert into app_mappings (org_id, process_name, domain, category_id) values
        ('00000000-0000-0000-0000-000000000001', 'code.exe',    null,            v_produtivo),
        ('00000000-0000-0000-0000-000000000001', 'excel.exe',   null,            v_produtivo),
        ('00000000-0000-0000-0000-000000000001', 'winword.exe', null,            v_produtivo),
        ('00000000-0000-0000-0000-000000000001', null,          'github.com',    v_produtivo),
        ('00000000-0000-0000-0000-000000000001', 'outlook.exe', null,            v_neutro),
        ('00000000-0000-0000-0000-000000000001', 'whatsapp.exe',null,            v_neutro),
        ('00000000-0000-0000-0000-000000000001', null,          'youtube.com',   v_improd),
        ('00000000-0000-0000-0000-000000000001', null,          'instagram.com', v_improd)
    on conflict do nothing;
end$$;

select 'Enrollment key da organização demo:' as aviso, enrollment_key
from organizations where id = '00000000-0000-0000-0000-000000000001';
