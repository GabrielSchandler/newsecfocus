# NewSec Focus — painel (Next.js 15 + Supabase)

Painel de produtividade multiempresa, com hierarquia **empresa → equipe → pessoa**,
período fechado (dia, semana, mês, ano, geral e intervalo livre) e exportação em XLSX/CSV.

## Rodar localmente

```bash
cd dashboard
npm install
cp .env.example .env.local   # preencha URL e ANON KEY do Supabase
npm run dev                  # http://localhost:3000
npm run verificar            # tsc --noEmit
```

## Deploy na Vercel

1. Importe o repositório na Vercel.
2. **Root Directory:** `dashboard`.
3. Environment Variables: `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
4. Deploy. O middleware renova a sessão e protege `/painel` e `/plataforma`.

## Estrutura

```
dashboard/
├── app/
│   ├── entrar/                   Login (Supabase Auth)
│   ├── api/relatorios/           Geração de XLSX e CSV (runtime Node)
│   ├── painel/
│   │   ├── layout.tsx            Sidebar + topbar; carrega o contexto da sessão
│   │   ├── page.tsx              Visão geral da empresa
│   │   ├── equipes/[id]/         Comparativo de equipes e detalhe
│   │   ├── pessoas/[id]/         Ranking de pessoas e detalhe com dia a dia
│   │   ├── aplicativos/          Uso por ferramenta e cobertura da classificação
│   │   ├── dispositivos/         Estações e consumo de licenças
│   │   ├── relatorios/           Central de exportação
│   │   └── administracao/        Equipes, colaboradores, classificação, empresa
│   └── plataforma/               Área da revenda: carteira de empresas clientes
├── components/
│   ├── ui/                       Primitivas (card, badge, button, select, input)
│   ├── efeitos/glow-card.tsx     Borda em gradiente animado
│   └── painel/                   KPIs, gráficos, tabela responsiva, filtros, exportação
├── lib/
│   ├── periodos.ts               Motor de períodos com fuso da empresa
│   ├── consultas.ts              Chamadas às RPCs de agregação
│   ├── exportacao.ts             Montagem de XLSX (ExcelJS) e CSV
│   ├── sessao.ts                 Contexto: papel, escopo, empresa
│   ├── filtros-url.ts            searchParams → período + escopo
│   └── carregar.ts               Carregamento resiliente (erro visível, não silencioso)
└── middleware.ts                 Renovação de sessão + guarda de rota
```

## Decisões que valem conhecer

**Os filtros vivem na URL.** Período e escopo são `searchParams`, não `useState`. O
recorte vira um link compartilhável, sobrevive ao F5 e o botão "voltar" funciona como o
gestor espera. As páginas são Server Components e consultam já filtrado.

**Períodos fecham.** "Agosto de 2026" e "2026" são recortes legítimos, com setas para
navegar no tempo. Toda comparação ("+12% vs. mês anterior") usa o período anterior de
mesma duração — calculado, não fixo em zero como na primeira versão.

**O fuso é o da empresa.** `lib/periodos.ts` converte hora de parede ↔ instante usando
`Intl.DateTimeFormat` com o fuso de `organizations.fuso`, casando com a agregação do
banco. Sem isso, "hoje" começa numa hora no navegador e em outra no Postgres.

**Índice nulo é nulo.** Quando nada está classificado, o painel diz "sem classificação" e
explica como resolver — não exibe 100%.

**Erro aparece.** `lib/carregar.ts` captura a falha e devolve junto com o valor padrão,
para a página mostrar o aviso. Tela zerada por erro de banco é indistinguível de tela
zerada por ausência de trabalho, e as duas exigem reações opostas.

**Tabelas viram cartões no celular.** `components/painel/tabela.tsx` monta grade no
desktop e lista de cartões abaixo de 768px; a navegação lateral ganha menu próprio no
mobile.

## Exportação

`GET /api/relatorios?tipo=…&formato=xlsx|csv&…` roda no servidor com o cookie de sessão,
então o RLS continua valendo: um líder de equipe exporta só a equipe dele.

No XLSX o tempo vai como duração real (fração de dia com formato `[h]:mm`), o índice como
percentual, com cabeçalho congelado, autofiltro e linha de totais — a planilha soma e
filtra sem retrabalho. No CSV, separador `;`, vírgula decimal e BOM UTF-8, que é o que o
Excel em português abre sem diálogo de importação.

## Notas de stack

- React 18.3 (compatível com Recharts) sobre Next 15 App Router.
- ExcelJS roda apenas no servidor, na rota de relatórios.
- Sem dependência de CDNs externas; fontes via `next/font`.
