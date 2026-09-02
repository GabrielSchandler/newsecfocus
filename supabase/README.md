# NewSec Focus — banco, RLS e Edge Functions

## Conteúdo

```
supabase/
├── config.toml                       Config do CLI (verify_jwt off nas functions de ingestão)
├── schema.sql                        Ponto de entrada p/ psql (aplica as migrations na ordem)
├── seed.sql                          Empresa, equipes e categorias de exemplo
├── migrations/
│   ├── 0001_schema.sql               Tabelas base, índices e RLS por empresa
│   ├── 0002_agendamentos.sql         pg_cron: manutenção periódica
│   ├── 0003_rpc_dashboard.sql        RPCs da 1ª versão (substituídas pela 0006)
│   ├── 0004_papel_lider_equipe.sql   Papel TEAM_LEAD — sozinho de propósito:
│   │                                 enum novo não pode ser usado na mesma
│   │                                 transação em que é criado
│   ├── 0004_saas_equipes_colaboradores.sql
│   │                                 Plataforma de revenda, equipes, colaboradores,
│   │                                 papéis com escopo e limite de licenças
│   ├── 0005_agregados_retencao.sql   Agregados incrementais, classificação
│   │                                 materializada, reconsolidação e retenção
│   └── 0006_rpc_painel.sql           RPCs do painel v2 (período fechado + hierarquia)
└── functions/
    ├── _shared/comum.ts              Cliente service_role, cliente do usuário, hashing
    ├── registrar-dispositivo/        Troca chave de matrícula por token de dispositivo
    ├── ingestao-lote/                Recebe lotes, resolve o colaborador e grava
    └── provisionar-empresa/          Cria empresa cliente e convida o gestor (revenda)
```

## Hierarquia do modelo

```
Plataforma (revenda)
  └── Empresa cliente         organizations
        └── Equipe            teams        — pertence a 1 empresa
              └── Colaborador employees   — pertence a 1 equipe
                    └── Atividade         activity_logs
```

Uma pessoa é identificada por `(org_id, os_user)`: o agente manda o usuário do Windows e
a ingestão resolve — ou cria — o colaborador. A mesma pessoa em duas estações continua
sendo **uma** pessoa; uma estação com dois usuários vira **duas**.

## Subir com o Supabase CLI (recomendado)

```bash
supabase link --project-ref SEU_REF
supabase db push                       # aplica migrations 0001..0006
psql "$DATABASE_URL" -f seed.sql       # opcional: dados de exemplo

supabase functions deploy registrar-dispositivo
supabase functions deploy ingestao-lote
supabase functions deploy provisionar-empresa
```

As functions usam `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY`,
injetadas pela plataforma. Nada de service_role vai para o agente ou para o navegador.

## Subir com psql (sem CLI)

```bash
psql "$DATABASE_URL" -f schema.sql
psql "$DATABASE_URL" -f seed.sql   # opcional
```

> As Edge Functions ainda precisam do CLI para deploy.

## Modelo de segurança

| Quem | Como entra | O que enxerga |
|------|------------|---------------|
| **OWNER / MANAGER** | Supabase Auth | a empresa inteira; administra cadastros |
| **TEAM_LEAD** | Supabase Auth | **apenas a própria equipe** — o RLS filtra por `auth_escopo_equipe()` |
| **VIEWER** | Supabase Auth | a empresa inteira, sem administrar |
| **Agente** | token de dispositivo | nada: só escreve, via Edge Function |
| **Admin da plataforma** | Supabase Auth | empresas, usuários e dispositivos — **nunca telemetria** |

A última linha é decisão de produto, não descuido: a revenda administra contas e
cobrança, e não tem política de leitura em `activity_logs` nem nos resumos. Os dados de
produtividade pertencem à empresa contratante.

**Deduplicação:** `activity_logs` tem `unique(device_id, timestamp, process_name)` — um
reenvio após queda de rede não duplica dado.

## Desempenho: por que existem agregados

`activity_logs` cresce 1 linha por minuto por estação (1.440/dia). Cinquenta estações
passam de 26 milhões de linhas por ano. Nenhuma consulta do painel toca essa tabela:

| Agregado | Serve para | Atualização |
|----------|-----------|-------------|
| `resumo_horario` | curva do dia | `consolidar_resumos()` a cada 10 min |
| `resumo_diario` | KPIs, semana, mês, ano, "geral" | derivado do horário |
| `resumo_app_diario` | distribuição por aplicativo | mesma rodada |

A consolidação é **incremental e idempotente**: recalcula do zero apenas os baldes
tocados por registros que chegaram desde a última rodada — inclusive lote atrasado de
agente que ficou offline, porque o corte usa `created_at`, não o horário do registro.

A classificação (produtivo / neutro / improdutivo) é resolvida **uma vez**, na
consolidação. Ao mudar uma regra de aplicativo, o painel chama `reconsolidar_org()` e
recalcula os últimos 90 dias — sem isso, a regra nova só valeria para dado futuro.

**Retenção:** `expurgar_atividade_antiga()` roda diariamente e apaga a atividade crua
além do prazo contratado por empresa (`organizations.retencao_dias`, padrão 90 dias). Os
agregados são permanentes — reduzir a retenção não apaga o histórico gerencial.

## O dia é o dia da empresa

Toda agregação diária usa `organizations.fuso` (padrão `America/Sao_Paulo`), nunca UTC.
Isso corrige o comportamento da primeira versão, que truncava o dia em UTC enquanto o
navegador calculava "hoje" no fuso local — depois das 21h em Brasília, o gráfico do dia
saía errado.

## Primeiros passos após aplicar o schema

1. Crie um usuário no Supabase Auth (Authentication > Users).
2. Ligue o usuário à empresa:
   ```sql
   insert into profiles (id, org_id, full_name, role)
   values ('<uuid-do-auth-user>', '00000000-0000-0000-0000-000000000001', 'Gestor', 'OWNER');
   ```
3. Para liberar o painel da revenda ao seu próprio usuário:
   ```sql
   insert into plataforma_admins (user_id, nome)
   values ('<uuid-do-seu-usuario>', 'Operação');
   ```
   Feito isso, as próximas empresas são criadas pelo formulário em `/plataforma` — não
   por SQL.
4. Copie a `enrollment_key` da empresa para o `appsettings.json` do agente.
