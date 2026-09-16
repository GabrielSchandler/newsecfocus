-- ============================================================================
--  0032 — Código de instalação editável
--
--  O código continua nascendo sozinho (0010), mas agora também pode ser
--  escolhido. O motivo é operacional: quem instala em dezenas de máquinas quer
--  um código que consiga ditar por telefone e reusar no roteiro de implantação,
--  em vez de decorar o sorteado.
--
--  Continua com as mesmas travas do girar: 12 dígitos, único entre empresas, e
--  só proprietário/gestor da própria empresa (ou a operação da plataforma).
--
--  A chave hexadecimal antiga (enrollment_key) NÃO é trocada aqui — trocá-la
--  derrubaria as estações já instaladas, que a guardam. Quem quer invalidar
--  tudo usa o girar, que existe exatamente para isso.
-- ============================================================================

create or replace function definir_codigo_instalacao(p_org uuid, p_codigo text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
    v_codigo text := regexp_replace(coalesce(p_codigo, ''), '\D', '', 'g');
begin
    if not (p_org = auth_org_id() and auth_pode_administrar()) and not eh_admin_plataforma() then
        raise exception 'Sem permissão para trocar o código desta empresa.'
            using errcode = 'insufficient_privilege';
    end if;

    if length(v_codigo) <> 12 then
        raise exception 'O código precisa ter 12 dígitos.'
            using errcode = 'check_violation';
    end if;

    if exists (
        select 1 from organizations
         where codigo_instalacao = v_codigo and id <> p_org
    ) then
        raise exception 'Esse código já está em uso por outra empresa.'
            using errcode = 'unique_violation';
    end if;

    update organizations
       set codigo_instalacao = v_codigo
     where id = p_org;

    return v_codigo;
end;
$$;

comment on function definir_codigo_instalacao is
    'Define manualmente o código de instalação da empresa (12 dígitos, único). Não mexe na enrollment_key, para não derrubar as estações já instaladas.';
