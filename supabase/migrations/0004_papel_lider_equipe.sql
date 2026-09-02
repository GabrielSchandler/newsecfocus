-- ============================================================================
--  0004 — Papel novo: líder de equipe
--
--  Esta migration existe sozinha de propósito. O PostgreSQL não permite USAR um
--  valor de enum recém-adicionado na MESMA transação em que ele foi criado —
--  e cada arquivo de migration roda na sua própria transação. Juntar isto com
--  as políticas e funções que comparam `role = 'TEAM_LEAD'` faria o
--  `supabase db push` falhar com "unsafe use of new value of enum type".
-- ============================================================================

do $$
begin
    if not exists (
        select 1 from pg_enum e
          join pg_type t on t.oid = e.enumtypid
         where t.typname = 'papel_usuario' and e.enumlabel = 'TEAM_LEAD'
    ) then
        alter type papel_usuario add value 'TEAM_LEAD' before 'VIEWER';
    end if;
end$$;

comment on type papel_usuario is
    'OWNER e MANAGER enxergam a empresa inteira e administram cadastros; TEAM_LEAD enxerga apenas a própria equipe (profiles.team_id); VIEWER lê a empresa sem administrar.';
