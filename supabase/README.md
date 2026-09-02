# Supabase — banco, RLS e Edge Functions

## Conteúdo

```
supabase/
├── config.toml                       Config do CLI (verify_jwt off nas functions de ingestão)
├── schema.sql                        Ponto de entrada p/ psql (aplica as migrations)
├── seed.sql                          Organização e categorias de exemplo
├── migrations/
│   ├── 0001_schema.sql               Tabelas, índices, materialized view, RLS
│   ├── 0002_agendamentos.sql         pg_cron: refresh do agregado + status online
│   └── 0003_rpc_dashboard.sql        Funções de agregação do Dashboard (SECURITY INVOKER)
└── functions/
    ├── _shared/comum.ts              Cliente service_role, hashing de token, helpers
    ├── registrar-dispositivo/        Troca chave de matrícula por token de dispositivo
    └── ingestao-lote/                Recebe lotes de telemetria (auth por token)
```

## Subir com o Supabase CLI (recomendado)

```bash
# 1. Linke o projeto (ou use 'supabase start' para ambiente local)
supabase link --project-ref SEU_REF

# 2. Aplique as migrations
supabase db push

# 3. (Opcional) dados de exemplo
psql "$DATABASE_URL" -f seed.sql

# 4. Publique as Edge Functions
supabase functions deploy registrar-dispositivo
supabase functions deploy ingestao-lote
```

As functions usam `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`, injetadas
automaticamente pela plataforma. Nada de service_role vai para o agente ou o browser.

## Subir com psql (sem CLI)

```bash
psql "$DATABASE_URL" -f schema.sql
psql "$DATABASE_URL" -f seed.sql   # opcional
```

> As Edge Functions ainda precisam do CLI para deploy; alternativamente, exponha a
> ingestão por outra API sua e ajuste `UrlSupabase` no agente.

## Modelo de segurança

- **Dashboard (leitura):** usuários autenticam via Supabase Auth; o RLS filtra tudo por
  `auth_org_id()` (a organização do perfil). Um gestor nunca vê dados de outra empresa.
- **Agente (escrita):** não tem credencial de banco. Envia à Edge Function um **token de
  dispositivo** (Bearer); a function valida o hash, resolve `org_id`/`device_id` no
  servidor e insere com a service_role. O agente **não decide** em qual organização grava.
- **Deduplicação:** `activity_logs` tem `unique(device_id, timestamp, process_name)` — um
  reenvio após queda de rede não duplica dado; a function conta quantos eram novos.

## Primeiros passos após aplicar o schema

1. Crie um usuário no Supabase Auth (painel > Authentication).
2. Crie o perfil ligando o usuário à organização:
   ```sql
   insert into profiles (id, org_id, full_name, role)
   values ('<uuid-do-auth-user>', '00000000-0000-0000-0000-000000000001', 'Gestor', 'OWNER');
   ```
3. Copie a `enrollment_key` da organização (o `seed.sql` a imprime) para o
   `appsettings.json` do agente.
