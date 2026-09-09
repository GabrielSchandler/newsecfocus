-- ============================================================================
--  0020 — Nome e departamento escolhidos na hora de instalar
--
--  Hoje quem instala digita o código e pronto: a máquina aparece no painel com
--  o nome do Windows (PLANEJAMENTO, DESKTOP-4F2K9A1) e a pessoa nasce sem
--  equipe. Alguém precisa depois abrir o painel, achar aquela estação no meio
--  das outras e arrumar — e é justamente quem instalou que sabe de qual sala,
--  de qual setor e de quem é aquela máquina.
--
--  Passa a ser decidido na instalação: o instalador mostra o nome que vai
--  aparecer no site, deixa trocar, e oferece a lista de departamentos da
--  empresa.
--
--  O departamento fica no DISPOSITIVO, não na pessoa. Parece indireto, mas é o
--  que corresponde à realidade: quem instala conhece a máquina ("este é o
--  computador do balcão"), e a pessoa que vai usá-la só aparece na primeira
--  sincronização. Guardar a intenção no dispositivo permite aplicá-la quando o
--  colaborador finalmente nascer.
-- ============================================================================

alter table devices
    add column if not exists equipe_padrao_id uuid references teams(id) on delete set null;

comment on column devices.equipe_padrao_id is
    'Departamento escolhido na instalação. Aplicado ao colaborador na primeira sincronização, quando ele é criado. NULL = quem instalou não escolheu.';

-- ----------------------------------------------------------------------------
--  resolver_colaborador passa a aceitar a equipe pretendida
--
--  Só vale para colaborador NOVO. Quem já existe mantém a equipe que tem: a
--  escolha feita no painel é decisão de gestor e não pode ser desfeita por uma
--  reinstalação de máquina.
-- ----------------------------------------------------------------------------
-- A assinatura antiga (2 parâmetros) precisa sair, senão o novo parâmetro com
-- valor padrão cria uma SOBRECARGA: as duas versões passariam a existir e toda
-- chamada com dois argumentos viraria ambígua, derrubando a ingestão.
drop function if exists resolver_colaborador(uuid, text);

create or replace function resolver_colaborador(
    p_org     uuid,
    p_os_user text,
    p_equipe  uuid default null
)
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

    -- Equipe só é aceita se for da mesma empresa. Sem esta checagem, um código
    -- vazado permitiria jogar uma máquina dentro da equipe de outro cliente.
    if p_equipe is not null
       and not exists (select 1 from teams t where t.id = p_equipe and t.org_id = p_org) then
        p_equipe := null;
    end if;

    insert into employees (org_id, os_user, nome, team_id)
    values (p_org, v_usuario,
            initcap(replace(replace(v_usuario, '.', ' '), '_', ' ')),
            p_equipe)
    on conflict (org_id, lower(os_user)) do update set os_user = excluded.os_user
    returning id into v_id;

    return v_id;
end;
$$;

comment on function resolver_colaborador(uuid, text, uuid) is
    'Acha ou cria o colaborador pelo usuário do Windows. A equipe só é aplicada na CRIAÇÃO: quem já existe mantém a equipe definida no painel, que é decisão de gestor.';

-- ----------------------------------------------------------------------------
--  Lista de departamentos para o instalador montar o menu
--
--  Devolve só id e nome, e exige o código da empresa — o mesmo segredo que já
--  autoriza matricular uma máquina ali. Nome de equipe é informação de baixa
--  sensibilidade perto do que o código já permite fazer.
-- ----------------------------------------------------------------------------
create or replace function equipes_por_chave(p_chave text)
returns table (id uuid, nome text)
language sql
stable
security definer
set search_path = public
as $$
    select t.id, t.nome
      from teams t
     where t.org_id = empresa_por_chave(p_chave)
       and t.ativa
     order by t.nome;
$$;

comment on function equipes_por_chave is
    'Departamentos da empresa dona do código, para o instalador oferecer a escolha. Exige o código — o mesmo segredo que já permite matricular máquina.';
