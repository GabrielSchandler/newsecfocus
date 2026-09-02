# Dashboard — Next.js 15 + Supabase

Painel de produtividade com estética *futuristic enterprise*: dark mode profundo,
glassmorphism, Bento Grid, glow cards e gráficos interativos.

## Rodar localmente

```bash
cd dashboard
npm install
cp .env.example .env.local   # preencha URL e ANON KEY do Supabase
npm run dev                  # http://localhost:3000
```

Variáveis (`.env.local`):

```
NEXT_PUBLIC_SUPABASE_URL=https://SEU-PROJETO.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

## Deploy na Vercel

1. Importe o repositório na Vercel.
2. **Root Directory:** `dashboard`.
3. Framework: Next.js (autodetectado). Build: `next build`.
4. Environment Variables: `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
5. Deploy. O middleware cuida da sessão e protege `/painel`.

## Estrutura

```
dashboard/
├── app/
│   ├── layout.tsx                Fontes, tema, fundo aurora
│   ├── page.tsx                  Redireciona p/ /painel ou /entrar
│   ├── entrar/                   Login (Supabase Auth)
│   └── painel/
│       ├── layout.tsx            Sidebar + topbar (server: user + org)
│       ├── page.tsx              Visão geral (SSR + hidratação)
│       ├── dispositivos/         Lista de estações
│       └── aplicativos/          Ranking de apps/sites
├── components/
│   ├── ui/                       Primitivas shadcn-style (card, badge, button, select…)
│   ├── efeitos/glow-card.tsx     Borda em gradiente animado
│   └── painel/                   Bento KPIs, gráficos, timeline realtime, filtros
├── lib/
│   ├── supabase/                 Clients (browser/server/middleware)
│   ├── consultas.ts              Chamadas às RPCs de agregação
│   ├── tipos.ts / formato.ts     Tipos e formatação pt-BR
└── middleware.ts                 Renovação de sessão + guarda de rota
```

## Como os dados chegam

- **KPIs, série e donut:** RPCs `kpis_periodo`, `serie_atividade`, `distribuicao_apps`
  (agregam no banco, respeitando o RLS). O primeiro paint vem do servidor (SSR); trocar
  período/dispositivo refaz a consulta no cliente.
- **Timeline:** RPC `ultima_atividade_por_dispositivo` + assinatura **Realtime** em
  `activity_logs` (com fallback de polling a cada 30s).

> Realtime: habilite a replicação da tabela `activity_logs` no painel do Supabase
> (Database > Replication) para os eventos de INSERT chegarem ao Dashboard.

## Notas de stack

- React 18.3 (compatível com Recharts) sobre Next 15 App Router.
- Sem dependência de CDNs externas; fontes via `next/font` (Inter + JetBrains Mono).
