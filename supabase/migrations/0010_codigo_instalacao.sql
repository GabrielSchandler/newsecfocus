-- ============================================================================
--  0010 — Código de instalação numérico
--
--  A chave de matrícula era um hexadecimal de 48 caracteres. Funciona por
--  linha de comando, mas é impossível de ditar por telefone e fácil de digitar
--  errado — e quem instala é o TI do cliente, muitas vezes lendo de um papel.
--
--  Agora cada empresa tem também um CÓDIGO DE INSTALAÇÃO de 12 dígitos,
--  mostrado no painel como 1234-5678-9012. Só números, para digitar rápido e
--  sem ambiguidade entre O e 0, l e 1.
--
--  A chave hexadecimal continua valendo: quem já instalou não precisa mexer em
--  nada, e a ingestão aceita as duas formas.
-- ============================================================================

alter table organizations
    add column if not exists codigo_instalacao text;

-- ----------------------------------------------------------------------------
--  Geração: 12 dígitos, sem começar com zero (para não sumir ao ser colado numa
--  planilha, que interpretaria como número e comeria o zero à esquerda).
-- ----------------------------------------------------------------------------
create or replace function gerar_codigo_instalacao()
returns text
language plpgsql
as $$
declare
    v_codigo text;
    v_tentativa int := 0;
begin
    loop
        v_codigo := (floor(random() * 9) + 1)::int::text;
        for i in 1..11 loop
            v_codigo := v_codigo || floor(random() * 10)::int::text;
        end loop;

        exit when not exists (select 1 from organizations where codigo_instalacao = v_codigo);

        v_tentativa := v_tentativa + 1;
        if v_tentativa > 50 then
            raise exception 'Não foi possível gerar um código de instalação único.';
        end if;
    end loop;

    return v_codigo;
end;
$$;

update organizations
   set codigo_instalacao = gerar_codigo_instalacao()
 where codigo_instalacao is null;

alter table organizations alter column codigo_instalacao set not null;
alter table organizations alter column codigo_instalacao set default gerar_codigo_instalacao();

create unique index if not exists idx_org_codigo_instalacao
    on organizations(codigo_instalacao);

comment on column organizations.codigo_instalacao is
    'Código numérico de 12 dígitos digitado no instalador. Mostrado como 1234-5678-9012.';

-- ----------------------------------------------------------------------------
--  Resolução na matrícula: aceita o código numérico OU a chave hexadecimal.
--
--  SECURITY DEFINER porque quem chama é a Edge Function de matrícula, com
--  service_role. Normaliza a entrada tirando hífens e espaços, então o TI pode
--  digitar 1234-5678-9012 ou 123456789012 que dá no mesmo.
-- ----------------------------------------------------------------------------
create or replace function empresa_por_chave(p_chave text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
    select o.id
      from organizations o
     where o.codigo_instalacao = regexp_replace(coalesce(p_chave, ''), '[^0-9]', '', 'g')
        or o.enrollment_key = btrim(coalesce(p_chave, ''))
     limit 1;
$$;

revoke execute on function empresa_por_chave(text) from public, anon, authenticated;
grant execute on function empresa_por_chave(text) to service_role;

-- ----------------------------------------------------------------------------
--  Rotação: se o código vazar, o gestor troca sem reinstalar nada.
--
--  As máquinas já matriculadas não são afetadas — elas usam o token próprio
--  desde o primeiro contato, e não o código.
-- ----------------------------------------------------------------------------
create or replace function girar_codigo_instalacao(p_org uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
    v_novo text;
begin
    if not (p_org = auth_org_id() and auth_pode_administrar()) and not eh_admin_plataforma() then
        raise exception 'Sem permissão para trocar o código desta empresa.'
            using errcode = 'insufficient_privilege';
    end if;

    v_novo := gerar_codigo_instalacao();

    update organizations
       set codigo_instalacao = v_novo,
           enrollment_key = encode(gen_random_bytes(24), 'hex')
     where id = p_org;

    return v_novo;
end;
$$;
