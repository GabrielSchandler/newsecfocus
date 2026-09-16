-- ============================================================================
--  0031 — Senha definida pelo administrador e troca no primeiro acesso
--
--  Até aqui só existia convite por e-mail: o administrador digitava o endereço e
--  a pessoa precisava abrir a caixa de entrada para criar a senha. Em operação
--  de escritório isso trava — o gestor quer entregar usuário e senha na hora.
--
--  Agora o acesso pode nascer com senha definida por quem criou. Como essa senha
--  passou pela mão de outra pessoa, ela é PROVISÓRIA: no primeiro acesso o dono
--  decide trocar ou manter, e é isso que esta coluna controla.
-- ============================================================================

alter table profiles
    add column if not exists senha_provisoria boolean not null default false;

comment on column profiles.senha_provisoria is
    'Verdadeiro quando a senha foi definida por um administrador e o dono do acesso ainda não decidiu trocá-la ou mantê-la. O painel bloqueia a navegação até essa decisão.';

-- A própria pessoa encerra a pendência. SECURITY DEFINER porque a política de
-- escrita de profiles é de administrador — e aqui quem resolve é o dono do
-- acesso, sobre a própria linha e sobre uma coluna só.
create or replace function confirmar_senha_definida()
returns void
language sql
security definer
set search_path = public
as $$
    update profiles
       set senha_provisoria = false
     where id = auth.uid();
$$;

comment on function confirmar_senha_definida is
    'Marca que o dono do acesso já decidiu sobre a senha provisória (trocou ou manteve). Age apenas sobre a própria linha.';
