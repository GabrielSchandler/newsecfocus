-- ============================================================================
--  schema.sql — ponto de entrada do banco.
--
--  A DDL canônica está dividida em migrations (convenção do Supabase CLI).
--  Este arquivo apenas aplica as duas na ordem certa, para quem preferir rodar
--  direto com psql em vez do CLI:
--
--      psql "$DATABASE_URL" -f schema.sql
--      psql "$DATABASE_URL" -f seed.sql      # opcional: dados de exemplo
--
--  Com o Supabase CLI, prefira:  supabase db reset  (aplica migrations + seed).
-- ============================================================================

\i migrations/0001_schema.sql
\i migrations/0002_agendamentos.sql
