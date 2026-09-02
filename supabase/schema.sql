-- ============================================================================
--  schema.sql — ponto de entrada do banco.
--
--  A DDL canônica está dividida em migrations (convenção do Supabase CLI).
--  Este arquivo apenas aplica todas na ordem certa, para quem preferir rodar
--  direto com psql em vez do CLI:
--
--      psql "$DATABASE_URL" -f schema.sql
--      psql "$DATABASE_URL" -f seed.sql      # opcional: dados de exemplo
--
--  Com o Supabase CLI, prefira:  supabase db reset  (aplica migrations + seed).
--
--  Ordem e conteúdo:
--    0001  tabelas base, RLS por empresa e ingestão
--    0002  agendamentos pg_cron
--    0003  RPCs da primeira versão do painel (substituídas pela 0006)
--    0004  papel TEAM_LEAD (transação própria: enum novo não pode ser usado
--          na mesma transação em que é criado)
--    0004  SaaS de revenda: plataforma, equipes e colaboradores
--    0005  agregados incrementais, classificação materializada e retenção
--    0006  RPCs do painel v2 (período fechado, hierarquia, comparação)
-- ============================================================================

\i migrations/0001_schema.sql
\i migrations/0002_agendamentos.sql
\i migrations/0003_rpc_dashboard.sql
\i migrations/0004_papel_lider_equipe.sql
\i migrations/0004_saas_equipes_colaboradores.sql
\i migrations/0005_agregados_retencao.sql
\i migrations/0006_rpc_painel.sql
