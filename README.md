# Sistema de Telemetria e Produtividade

SaaS de telemetria de produtividade para estações Windows, vendido a empresas clientes.
Agente nativo de baixo consumo, backend multiempresa e painel web com hierarquia
**empresa → equipe → pessoa**.

```
telemetria-produtividade/
├── agente/        Agente Windows em C# (.NET 8): serviço supervisor + coletor de sessão
├── supabase/      Schema SQL, RLS, migrations, agregados e Edge Functions
├── dashboard/     Painel Next.js 15 (App Router, Tailwind, Supabase) — pronto para a Vercel
└── documentos/    Conformidade LGPD, termo de ciência e guia de instalação
```

---

## Como as peças conversam

```mermaid
flowchart LR
    subgraph Estacao["Estação Windows"]
        direction TB
        Coletor["Coletor (sessão do usuário)\nhooks, foreground, idle, domínio"]
        Servico["Serviço supervisor (SYSTEM, Sessão 0)\nlança o coletor + sincroniza"]
        SQLite[("telemetry.db\nSQLCipher")]
        Coletor -- "1 registro/min" --> SQLite
        Servico -- "lê lote" --> SQLite
        Servico -- "CreateProcessAsUser" --> Coletor
    end
    Servico -- "POST lote (a cada 1h)" --> Edge["Supabase Edge Functions"]
    Edge --> DB[("PostgreSQL + RLS")]
    DB --> Agregados[("resumo_horario\nresumo_diario\nresumo_app_diario")]
    Agregados --> Dash["Painel Next.js (Vercel)"]
```

### A decisão de arquitetura mais importante do agente

A especificação pede hooks `WH_MOUSE_LL`/`WH_KEYBOARD_LL`, `GetForegroundWindow` e
`GetLastInputInfo` num serviço rodando como `NT AUTHORITY\SYSTEM`. **Isso não funciona num
único processo.** Desde o Windows Vista, serviços rodam na **Sessão 0**, isolada da área de
trabalho interativa:

- um hook de baixo nível instalado na Sessão 0 nunca recebe eventos do usuário;
- `GetForegroundWindow` retorna `NULL`;
- `GetLastInputInfo` reflete o ócio da Sessão 0, não o do usuário.

Por isso o agente é dividido em **dois processos**:

| Processo | Conta | Sessão | Função |
|----------|-------|--------|--------|
| **Telemetria.Servico** | SYSTEM | 0 | Windows Service. Lança o coletor em cada sessão ativa (`WTSQueryUserToken` + `CreateProcessAsUser`), sincroniza o buffer com o Supabase e cuida da matrícula. |
| **Telemetria.Coletor** | usuário logado | interativa | Instala os hooks, lê foreground/idle/domínio e grava 1 registro por minuto no buffer local. |

Os dois compartilham o mesmo `telemetry.db` (SQLCipher) em `C:\ProgramData`, com a chave
protegida por DPAPI de máquina.

### A decisão de arquitetura mais importante do backend

A atividade crua tem **1 linha por minuto por estação**: 1.440 por dia, mais de 26 milhões
por ano num cliente de 50 estações. Nenhuma consulta do painel lê essa tabela. Três
agregados — por hora, por dia e por aplicativo/dia — são consolidados de forma incremental
a cada 10 minutos, com a classificação de produtividade já resolvida. É o que permite
filtrar "2026 inteiro" sem varrer a base, e o que sustenta a retenção: a atividade
minuto a minuto expira no prazo contratado, os resumos ficam para sempre.

---

## Modelo do produto

```
Plataforma (revenda)
  └── Empresa cliente         organizations   — plano, limite de estações, fuso, retenção
        └── Equipe            teams           — pertence a 1 empresa
              └── Colaborador employees       — pertence a 1 equipe
                    └── Atividade
```

Papéis de acesso: **OWNER** e **MANAGER** (empresa inteira, administram), **TEAM_LEAD**
(apenas a própria equipe, imposto pelo RLS) e **VIEWER** (leitura).

O operador da plataforma administra contas — criar empresa, plano, licenças, suspensão —
e **não tem acesso de leitura à telemetria dos clientes**. Não é convenção de tela: não
existe política de RLS que permita isso.

---

## Privacidade desde o desenho (LGPD)

O agente coleta **apenas metadados**. Nunca registra:

- ❌ conteúdo digitado (só a **contagem** de teclas — nenhuma tecla é lida);
- ❌ capturas de tela;
- ❌ conteúdo de mensagens (apps de mensageria têm o título omitido);
- ❌ URL completa (só o **domínio**, sem caminho nem query).

Além disso: título de janela higienizado (e-mails e números longos removidos), ícone de
bandeja informando o usuário, janela de coleta configurável, retenção por empresa e termo
de ciência pronto em [`documentos/`](documentos/). Ver
[documentos/CONFORMIDADE-LGPD.md](documentos/CONFORMIDADE-LGPD.md).

---

## Passo a passo

1. **Banco** — suba o Supabase e aplique as migrations: veja [supabase/README.md](supabase/README.md).
2. **Painel** — configure `.env.local` e rode/deploy: veja [dashboard/README.md](dashboard/README.md).
3. **Agente** — publique e instale como serviço: veja [agente/README.md](agente/README.md).

Guia unificado em [documentos/GUIA-INSTALACAO.md](documentos/GUIA-INSTALACAO.md).

---

## Estado de validação

| Componente | Situação |
|------------|----------|
| `dashboard/` | **compila** (`next build`) e passa no `tsc --noEmit` |
| `supabase/` | escrito e revisado; **ainda não aplicado num projeto real** |
| `agente/` | **nunca compilado** — exige o .NET 8 SDK, ausente na máquina de desenvolvimento |

Pendências conhecidas antes de vender: compilar e testar o agente numa estação real,
gerar instalador MSI **com assinatura de código** (binário não assinado que instala hooks
de teclado é bloqueado por antivírus e SmartScreen), e o serviço propagar ao coletor a
pausa de coleta quando a conta está suspensa — o servidor já devolve `collection_enabled`
na resposta de ingestão.

---

## Stack

- **Agente:** C# / .NET 8 (Worker Service + WinForms), SQLCipher, Win32 P/Invoke, UI Automation.
- **Backend:** Supabase (PostgreSQL, RLS, Edge Functions em Deno/TypeScript, pg_cron).
- **Painel:** Next.js 15 (App Router, React 18), Tailwind CSS, Recharts, `@supabase/ssr`, ExcelJS.
