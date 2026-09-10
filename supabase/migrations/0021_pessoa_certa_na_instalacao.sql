-- ============================================================================
--  0021 — A pessoa certa, com o nome certo, e nenhuma máquina engolindo outra
--
--  TRÊS PROBLEMAS DA SEGUNDA INSTALAÇÃO REAL (10/09/2026)
--
--  1. Quem instalou digitou "Robson" na pergunta "nome desta máquina". O nome
--     foi para a ESTAÇÃO (devices.machine_name), mas o painel mostra quase
--     sempre a PESSOA — que nasceu com o nome da conta do Windows, "Usuario".
--     O instalador passa a perguntar pela pessoa, e o nome chega aqui por
--     devices.nome_colaborador_padrao, aplicado quando ela nasce.
--
--  2. O índice único (org_id, lower(os_user)) forçava UM colaborador por nome
--     de conta do Windows na empresa inteira. Em escritório onde toda máquina
--     usa a conta genérica "Usuario" — comum em empresa pequena —, a atividade
--     de dez pessoas diferentes se fundiria numa pessoa só, em silêncio. E o
--     nome escolhido na instalação da segunda máquina seria ignorado, porque
--     o colaborador "já existia".
--
--     A saída separa os dois tipos de conta que o Windows tem:
--       • conta LOCAL (GRS\Usuario na máquina GRS): pertence àquela máquina.
--         Mesmo nome em outra máquina é outra pessoa.
--       • conta de DOMÍNIO (EMPRESA\joao, AzureAD\Joao): é a mesma pessoa em
--         qualquer máquina que ela usar.
--     employees.device_id_origem guarda a máquina da conta local; nulo = domínio.
--
--  3. A estação levava ~7 minutos para aparecer. Isso é do agente (matrícula só
--     acontecia com registro pendente) e foi corrigido lá; aqui nada muda.
-- ============================================================================

-- ----------------------------------------------------------------------------
--  1. Nome da pessoa escolhido na instalação
-- ----------------------------------------------------------------------------
alter table devices
    add column if not exists nome_colaborador_padrao text;

comment on column devices.nome_colaborador_padrao is
    'Nome da pessoa que usa esta máquina, digitado na instalação. Aplicado ao colaborador quando ele nasce, ou enquanto nenhum gestor o revisou. NULL = quem instalou deixou para depois.';

-- ----------------------------------------------------------------------------
--  2. Conta local pertence a uma máquina
-- ----------------------------------------------------------------------------
alter table employees
    add column if not exists device_id_origem uuid references devices(id) on delete set null;

comment on column employees.device_id_origem is
    'Para conta LOCAL do Windows, a máquina onde ela existe — a mesma conta "Usuario" em outra máquina é outra pessoa. NULL = conta de domínio, que é a mesma pessoa em qualquer máquina.';

-- O índice antigo é exatamente o que forçava a fusão. O novo considera a
-- máquina de origem; conta de domínio (origem nula) cai toda no mesmo valor
-- e continua única por empresa, como antes.
drop index if exists idx_employees_org_osuser;

create unique index if not exists idx_employees_org_osuser_origem
    on employees (
        org_id,
        lower(os_user),
        coalesce(device_id_origem, '00000000-0000-0000-0000-000000000000'::uuid)
    );

-- ----------------------------------------------------------------------------
--  3. Amarra à sua máquina os colaboradores de conta local que já existem
--
--  Sem isto, a próxima máquina com conta "Usuario" ainda cairia em cima de uma
--  pessoa existente. Critério conservador: TODA a atividade do colaborador vem
--  de uma única estação, e o domínio da conta em cada registro é o nome do
--  computador daquela estação — que é o que caracteriza conta local.
--
--  O nome do computador sai de devices.os_user, que o serviço grava como a
--  conta de máquina (WORKGROUP\GRS$ → GRS). Quem não se encaixar fica sem
--  vínculo, ou seja, no comportamento antigo — nunca amarrado errado.
-- ----------------------------------------------------------------------------
with por_colaborador as (
    select
        l.employee_id,
        (array_agg(distinct l.device_id))[1] as device_id,
        count(distinct l.device_id)          as maquinas,
        bool_and(
            position(chr(92) in l.os_user) > 0
            and lower(split_part(l.os_user, chr(92), 1))
              = lower(regexp_replace(split_part(coalesce(d.os_user, ''), chr(92), 2), '\$$', ''))
        ) as sempre_conta_local
      from activity_logs l
      join devices d on d.id = l.device_id
     where l.employee_id is not null
     group by l.employee_id
)
update employees e
   set device_id_origem = p.device_id
  from por_colaborador p
 where p.employee_id = e.id
   and p.maquinas = 1
   and p.sempre_conta_local
   and e.device_id_origem is null;

-- ----------------------------------------------------------------------------
--  4. resolver_colaborador sabe a máquina, o tipo de conta e o nome escolhido
--
--  A assinatura anterior (3 parâmetros) precisa sair: o parâmetro novo com
--  valor padrão criaria uma SOBRECARGA, e toda chamada com três argumentos
--  viraria ambígua — derrubando a ingestão. É a mesma armadilha da 0020.
--
--  Chamada com os parâmetros antigos continua funcionando (os novos têm
--  padrão), então a Edge Function publicada hoje segue de pé até ser trocada.
-- ----------------------------------------------------------------------------
drop function if exists resolver_colaborador(uuid, text, uuid);

create or replace function resolver_colaborador(
    p_org         uuid,
    p_os_user     text,
    p_equipe      uuid    default null,
    p_nome        text    default null,
    p_device      uuid    default null,
    -- true = conta local, false = conta de domínio, NULL = não informado
    -- (agente anterior à 1.5, que não manda o nome do computador).
    p_conta_local boolean default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    v_usuario  text := coalesce(normalizar_os_user(p_os_user), '(não identificado)');
    v_nome     text := nullif(btrim(coalesce(p_nome, '')), '');
    v_id       uuid;
    v_revisado boolean;
begin
    -- Equipe só vale se for da mesma empresa. Sem esta checagem, um código
    -- vazado permitiria jogar uma máquina dentro da equipe de outro cliente.
    if p_equipe is not null
       and not exists (select 1 from teams t where t.id = p_equipe and t.org_id = p_org) then
        p_equipe := null;
    end if;

    if p_conta_local is true and p_device is not null then
        -- Conta local: é a pessoa DESTA máquina.
        select id, perfil_completo into v_id, v_revisado
          from employees
         where org_id = p_org
           and lower(os_user) = lower(v_usuario)
           and device_id_origem = p_device;

        -- Adoção: colaborador sem vínculo (criado por agente antigo) cuja
        -- atividade só vem desta máquina é desta máquina. Sem isso, a primeira
        -- sincronização do agente novo duplicaria a pessoa e partiria o
        -- histórico ao meio.
        if v_id is null then
            select e.id, e.perfil_completo into v_id, v_revisado
              from employees e
             where e.org_id = p_org
               and lower(e.os_user) = lower(v_usuario)
               and e.device_id_origem is null
               and not exists (select 1 from activity_logs l
                                where l.employee_id = e.id and l.device_id <> p_device)
             limit 1;

            if v_id is not null then
                update employees set device_id_origem = p_device where id = v_id;
            end if;
        end if;

    elsif p_conta_local is false then
        -- Conta de domínio: a mesma pessoa em qualquer máquina.
        select id, perfil_completo into v_id, v_revisado
          from employees
         where org_id = p_org
           and lower(os_user) = lower(v_usuario)
           and device_id_origem is null;

    else
        -- Não informado (agente antigo): comportamento anterior, mas sem cair
        -- em cima de pessoa amarrada a OUTRA máquina.
        select id, perfil_completo into v_id, v_revisado
          from employees
         where org_id = p_org
           and lower(os_user) = lower(v_usuario)
           and (device_id_origem is null or p_device is null or device_id_origem = p_device)
         order by (device_id_origem is not null) desc
         limit 1;
    end if;

    if v_id is not null then
        -- A escolha da instalação é sobre a pessoa DESTA máquina, então só vale
        -- para quem está amarrado a ela e é o único dela (numa estação
        -- compartilhada, o nome digitado é de uma pessoa, não de todas). E vale
        -- enquanto nenhum gestor revisou a pessoa (perfil_completo) — depois
        -- disso quem manda é o painel.
        --
        -- Conta de domínio fica de fora de propósito: João usando duas máquinas
        -- instaladas com nomes diferentes teria o nome trocado a cada lote,
        -- alternando entre um e outro. Para ela, o nome vale só ao nascer.
        if not coalesce(v_revisado, false)
           and p_device is not null
           and (v_nome is not null or p_equipe is not null)
           and exists (select 1 from employees x
                        where x.id = v_id and x.device_id_origem = p_device)
           and not exists (select 1 from employees x
                            where x.device_id_origem = p_device
                              and x.id <> v_id) then
            update employees
               set nome    = coalesce(v_nome, nome),
                   team_id = coalesce(p_equipe, team_id)
             where id = v_id
               and (nome    is distinct from coalesce(v_nome, nome)
                 or team_id is distinct from coalesce(p_equipe, team_id));
        end if;
        return v_id;
    end if;

    begin
        insert into employees (org_id, os_user, nome, team_id, device_id_origem)
        values (
            p_org,
            v_usuario,
            coalesce(
                -- Nome escolhido só para a PRIMEIRA pessoa da máquina. Conta de
                -- domínio não fica amarrada, por isso a atividade entra na conta:
                -- se a estação já registrou alguém, quem chega agora é outra pessoa.
                case when p_device is null
                       or not (exists (select 1 from employees x where x.device_id_origem = p_device)
                            or exists (select 1 from activity_logs l
                                        where l.device_id = p_device and l.employee_id is not null))
                     then v_nome end,
                initcap(replace(replace(v_usuario, '.', ' '), '_', ' '))
            ),
            p_equipe,
            case when p_conta_local is true then p_device end
        )
        returning id into v_id;
    exception when unique_violation then
        -- Dois lotes da mesma pessoa chegando juntos: o outro criou primeiro.
        select id into v_id
          from employees
         where org_id = p_org
           and lower(os_user) = lower(v_usuario)
           and coalesce(device_id_origem, '00000000-0000-0000-0000-000000000000'::uuid)
             = coalesce(case when p_conta_local is true then p_device end,
                        '00000000-0000-0000-0000-000000000000'::uuid);
    end;

    return v_id;
end;
$$;

comment on function resolver_colaborador(uuid, text, uuid, text, uuid, boolean) is
    'Acha ou cria o colaborador de uma conta do Windows. Conta local pertence à máquina (a mesma conta "Usuario" em outra máquina é outra pessoa); conta de domínio é a mesma pessoa em qualquer máquina. Nome e equipe escolhidos na instalação valem enquanto nenhum gestor revisou a pessoa.';
