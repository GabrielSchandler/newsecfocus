// ============================================================================
//  Teste de fumaça autenticado.
//
//  Entra de verdade e carrega todas as telas do painel, procurando sinal de
//  erro no HTML devolvido.
//
//  Existe porque `tsc` e `next build` NÃO pegam erro de fronteira
//  servidor/cliente: as páginas são force-dynamic, então nada é pré-renderizado
//  e a falha só acontece quando alguém abre a tela. Foi assim que o painel foi
//  para o ar quebrado uma vez — build limpo, telas mortas.
//
//  Uso (com o servidor já rodando):
//
//    npm run build && npm start          # noutro terminal
//    node scripts/fumaca.mjs
//
//  Lê as credenciais do ambiente; nada fica no código:
//
//    NEXT_PUBLIC_SUPABASE_URL       (ou vem do .env.local)
//    NEXT_PUBLIC_SUPABASE_ANON_KEY  (idem)
//    FUMACA_EMAIL                   e-mail de um usuário com perfil na empresa
//    FUMACA_SENHA                   senha desse usuário
//    FUMACA_BASE                    opcional, padrão http://localhost:3000
// ============================================================================

import { readFileSync, existsSync } from "node:fs";

// Aproveita o .env.local para não repetir URL e chave no ambiente.
function carregarEnvLocal() {
  if (!existsSync(".env.local")) return;
  for (const linha of readFileSync(".env.local", "utf8").split("\n")) {
    const limpa = linha.trim();
    if (!limpa || limpa.startsWith("#")) continue;
    const corte = limpa.indexOf("=");
    if (corte < 0) continue;
    const chave = limpa.slice(0, corte).trim();
    if (!process.env[chave]) process.env[chave] = limpa.slice(corte + 1).trim();
  }
}
carregarEnvLocal();

const URL_SUPABASE = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const EMAIL = process.env.FUMACA_EMAIL;
const SENHA = process.env.FUMACA_SENHA;
const BASE = process.env.FUMACA_BASE ?? "http://localhost:3000";

if (!URL_SUPABASE || !ANON || !EMAIL || !SENHA) {
  console.error(
    "Faltam variáveis. Defina FUMACA_EMAIL e FUMACA_SENHA; a URL e a chave anon " +
      "podem vir do .env.local.",
  );
  process.exit(2);
}

const REF = new URL(URL_SUPABASE).hostname.split(".")[0];

// ---------------------------------------------------------------------------
//  1. Login
// ---------------------------------------------------------------------------
const login = await fetch(`${URL_SUPABASE}/auth/v1/token?grant_type=password`, {
  method: "POST",
  headers: { apikey: ANON, "Content-Type": "application/json" },
  body: JSON.stringify({ email: EMAIL, password: SENHA }),
});
const sessao = await login.json();

if (!login.ok || !sessao.access_token) {
  console.error("Falha no login:", sessao.error_description ?? sessao.msg ?? login.status);
  process.exit(1);
}
console.log(`Login ok: ${sessao.user.email}`);

// ---------------------------------------------------------------------------
//  2. Cookie no formato do @supabase/ssr, fatiado quando passa do limite
// ---------------------------------------------------------------------------
const valor = "base64-" + Buffer.from(JSON.stringify(sessao)).toString("base64");
const NOME = `sb-${REF}-auth-token`;
const LIMITE = 3180;

const partes = [];
if (valor.length <= LIMITE) {
  partes.push(`${NOME}=${valor}`);
} else {
  for (let i = 0, n = 0; i < valor.length; i += LIMITE, n++) {
    partes.push(`${NOME}.${n}=${valor.slice(i, i + LIMITE)}`);
  }
}
const cookie = partes.join("; ");

// ---------------------------------------------------------------------------
//  3. Carrega cada rota
// ---------------------------------------------------------------------------
const ROTAS = [
  ["/painel", "Visão geral"],
  ["/painel?preset=mes", "Visão geral — mês"],
  ["/painel?preset=geral", "Visão geral — todo o período"],
  ["/painel/equipes", "Equipes"],
  ["/painel/pessoas", "Pessoas"],
  ["/painel/aplicativos", "Aplicativos"],
  ["/painel/dispositivos", "Dispositivos"],
  ["/painel/relatorios", "Relatórios"],
  ["/painel/administracao", "Administração"],
  ["/painel/administracao?aba=pessoas", "Administração — pessoas"],
  ["/painel/administracao?aba=classificacao", "Administração — classificação"],
  ["/painel/administracao?aba=empresa", "Administração — empresa"],
  ["/plataforma", "Plataforma"],
];

// Marcas que o Next deixa no HTML quando a renderização falha.
const MARCAS_DE_ERRO = [
  "Attempted to call",
  "Functions cannot be passed directly",
  "Runtime Error",
  "Internal Server Error",
  "__next_error__",
];

let falhas = 0;

for (const [rota, nome] of ROTAS) {
  const r = await fetch(BASE + rota, { headers: { cookie }, redirect: "manual" });
  const html = r.status === 200 ? await r.text() : "";
  const erro = MARCAS_DE_ERRO.find((m) => html.includes(m));

  let situacao;
  if (r.status === 307 || r.status === 302) {
    situacao = `REDIRECIONOU -> ${r.headers.get("location")}`;
  } else if (r.status !== 200) {
    situacao = `HTTP ${r.status}`;
  } else if (erro) {
    situacao = `ERRO NA PÁGINA: ${erro}`;
  } else {
    situacao = `ok (${(html.length / 1024).toFixed(0)} KB)`;
  }

  if (!situacao.startsWith("ok")) falhas++;
  console.log(`  ${nome.padEnd(34)} ${situacao}`);
}

// ---------------------------------------------------------------------------
//  4. Exportação: o arquivo precisa sair, não só responder 200
// ---------------------------------------------------------------------------
console.log();
for (const tipo of ["diario", "colaboradores", "equipes", "aplicativos"]) {
  for (const formato of ["xlsx", "csv"]) {
    const r = await fetch(
      `${BASE}/api/relatorios?tipo=${tipo}&formato=${formato}&preset=mes`,
      { headers: { cookie } },
    );
    const bytes = Buffer.from(await r.arrayBuffer());
    // XLSX é um zip: precisa começar com "PK".
    const valido =
      r.status === 200 &&
      bytes.length > 0 &&
      (formato === "csv" || bytes.subarray(0, 2).toString() === "PK");

    if (!valido) falhas++;
    console.log(
      `  ${(tipo + " " + formato).padEnd(34)} ${valido ? `ok (${bytes.length} bytes)` : `FALHOU (HTTP ${r.status}, ${bytes.length} bytes)`}`,
    );
  }
}

console.log(`\n${falhas === 0 ? "Tudo respondeu." : `${falhas} verificação(ões) com problema.`}`);
process.exit(falhas === 0 ? 0 : 1);
