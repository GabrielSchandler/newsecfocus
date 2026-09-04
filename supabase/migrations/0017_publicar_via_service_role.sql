-- ============================================================================
--  0017 — Publicar versão também pelo servidor, não só pelo painel
--
--  publicar_versao_agente exigia eh_admin_plataforma(), que resolve a partir de
--  auth.uid(). Isso funciona para um humano logado no painel, mas o script de
--  publicação é uma ferramenta de linha de comando: ele se apresenta com a
--  service_role, onde auth.uid() é nulo — e a função recusava a própria
--  operação que ela existe para permitir.
--
--  A service_role passa a ser aceita explicitamente. Não é afrouxamento: quem
--  tem essa chave já tem acesso total ao banco e poderia inserir na tabela
--  direto. A guarda existe para barrar o usuário AUTENTICADO — a empresa
--  cliente, que não pode escolher qual código roda nas próprias estações — e
--  isso continua valendo.
-- ============================================================================

create or replace function publicar_versao_agente(
    p_versao  text,
    p_url     text,
    p_sha256  text,
    p_tamanho bigint default null,
    p_notas   text default null,
    p_vigente boolean default true
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_papel text := coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '');
begin
    if not (eh_admin_plataforma() or v_papel = 'service_role') then
        raise exception 'Só a operação da plataforma publica versão do agente.';
    end if;

    -- Imutável de propósito: republicar a mesma versão com outro arquivo faria
    -- as estações que já baixaram divergirem do que a tabela descreve.
    if exists (select 1 from versoes_agente v where v.versao = p_versao) then
        raise exception 'A versão % já foi publicada. Publique uma nova (ex.: %.1).', p_versao, p_versao;
    end if;

    if p_vigente then
        update versoes_agente set vigente = false where vigente;
    end if;

    insert into versoes_agente (versao, url, sha256, tamanho_bytes, notas, vigente)
    values (p_versao, p_url, lower(p_sha256), p_tamanho, p_notas, p_vigente);
end;
$$;
