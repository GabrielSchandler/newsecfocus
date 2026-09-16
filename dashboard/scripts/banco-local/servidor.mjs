// ============================================================================
//  Banco local de desenvolvimento: PGlite + uma API mínima no formato do
//  Supabase (RPC e consulta de tabela), executada COMO o usuário logado.
//
//  Cada requisição vira uma transação com role authenticated e o JWT simulado,
//  então as políticas de RLS e as funções com auth.uid() se comportam como em
//  produção. É o que permite abrir as telas reais com dados sintéticos sem
//  tocar no banco do Supabase — e sem nenhum atalho de permissão.
//
//  Uso: npm run dev:local  (sobe este servidor e o next dev apontando para ele)
// ============================================================================

import { createServer } from "node:http";
import { criarBanco } from "../../../supabase/testes/banco-local.mjs";
import { semear } from "./semear.mjs";

// Relações usadas pelo painel em select com recurso embutido.
// chave "tabela.relacao" → [coluna local, tabela remota, coluna remota, cardinalidade]
const RELACOES = {
  "profiles.organizations": ["org_id", "organizations", "id", "um"],
  "profiles.teams": ["team_id", "teams", "id", "um"],
  "employees.teams": ["team_id", "teams", "id", "um"],
  "app_mappings.productivity_categories": ["category_id", "productivity_categories", "id", "um"],
  "teams.employees": ["id", "employees", "team_id", "muitos"],
};

const id = (nome) => `"${String(nome).replace(/"/g, '""')}"`;

function dividirTopo(texto) {
  const partes = [];
  let nivel = 0;
  let atual = "";
  for (const ch of texto) {
    if (ch === "(") nivel++;
    if (ch === ")") nivel--;
    if (ch === "," && nivel === 0) {
      partes.push(atual.trim());
      atual = "";
    } else atual += ch;
  }
  if (atual.trim()) partes.push(atual.trim());
  return partes;
}

function colunasSelect(tabela, texto = "*") {
  return dividirTopo(texto.replace(/\s+/g, " ")).map((item) => {
    if (item === "*") return "t.*";
    const embutido = item.match(/^(?:(\w+):)?(\w+)(?:!\w+)?\((.*)\)$/);
    if (!embutido) {
      const [coluna, apelido] = item.split(":").reverse();
      return `t.${id(coluna)} as ${id(apelido ?? coluna)}`;
    }
    const [, apelido, relacao, internas] = embutido;
    const rel = RELACOES[`${tabela}.${relacao}`];
    if (!rel) throw new Error(`Relação não mapeada no banco local: ${tabela}.${relacao}`);
    const [local, remota, colunaRemota, cardinalidade] = rel;
    const nome = id(apelido ?? relacao);
    if (internas.trim() === "count") {
      return `(select json_build_array(json_build_object('count', count(*))) from public.${id(remota)} r
                where r.${id(colunaRemota)} = t.${id(local)}) as ${nome}`;
    }
    const sub = dividirTopo(internas).map((c) => (c === "*" ? "r.*" : `r.${id(c)}`)).join(", ");
    return cardinalidade === "um"
      ? `(select to_json(x) from (select ${sub} from public.${id(remota)} r
            where r.${id(colunaRemota)} = t.${id(local)} limit 1) x) as ${nome}`
      : `(select coalesce(json_agg(x), '[]'::json) from (select ${sub} from public.${id(remota)} r
            where r.${id(colunaRemota)} = t.${id(local)}) x) as ${nome}`;
  });
}

function montarFiltros(filtros, params) {
  const partes = [];
  for (const { coluna, operador, valor } of filtros ?? []) {
    const col = `t.${id(coluna)}`;
    const p = () => {
      params.push(valor);
      return `$${params.length}`;
    };
    switch (operador) {
      case "eq": partes.push(`${col}::text = ${p()}::text`); break;
      case "neq": partes.push(`${col}::text <> ${p()}::text`); break;
      case "gt": partes.push(`${col} > ${p()}`); break;
      case "gte": partes.push(`${col} >= ${p()}`); break;
      case "lt": partes.push(`${col} < ${p()}`); break;
      case "lte": partes.push(`${col} <= ${p()}`); break;
      case "like": partes.push(`${col}::text like ${p()}`); break;
      case "ilike": partes.push(`${col}::text ilike ${p()}`); break;
      case "in":
        params.push((valor ?? []).map(String));
        partes.push(`${col}::text = any($${params.length}::text[])`);
        break;
      case "is":
        partes.push(`${col} is ${valor === null ? "null" : valor ? "true" : "false"}`);
        break;
      default:
        throw new Error(`Filtro não suportado no banco local: ${operador}`);
    }
  }
  return partes.length ? `where ${partes.join(" and ")}` : "";
}

async function tiposDosArgumentos(db, nome) {
  const { rows } = await db.query(
    `select p.proargnames as nomes,
            array(select format_type(t, null) from unnest(p.proargtypes) t) as tipos,
            p.proretset as conjunto,
            format_type(p.prorettype, null) as retorno
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = $1
      order by p.pronargs desc limit 1`,
    [nome],
  );
  return rows[0];
}

async function executarRpc(db, { nome, params = {} }) {
  const info = await tiposDosArgumentos(db, nome);
  if (!info) throw Object.assign(new Error(`Função ${nome} não existe`), { code: "PGRST202" });
  const valores = [];
  const argumentos = Object.entries(params)
    .filter(([, v]) => v !== undefined)
    .map(([chave, valor]) => {
      const i = (info.nomes ?? []).indexOf(chave);
      const tipo = i >= 0 ? info.tipos[i] : "text";
      valores.push(Array.isArray(valor) ? valor : valor);
      return `${id(chave)} => $${valores.length}::${tipo}`;
    });
  const chamada = `public.${id(nome)}(${argumentos.join(", ")})`;
  const composto = info.conjunto || info.retorno === "record";
  const sql = composto
    ? `select coalesce(json_agg(q), '[]'::json) as dados from (select * from ${chamada}) q`
    : `select to_json(${chamada}) as dados`;
  const { rows } = await db.query(sql, valores);
  return rows[0].dados;
}

async function executarTabela(db, req) {
  const { tabela, operacao, colunas, filtros, ordem, limite, intervalo, unico, contagem, cabecalho, valores, conflito } = req;
  const params = [];
  const alvo = `public.${id(tabela)} t`;
  let sql;
  let total = null;

  if (operacao === "select") {
    const where = montarFiltros(filtros, params);
    if (contagem) {
      const { rows } = await db.query(`select count(*)::int as n from ${alvo} ${where}`, params);
      total = rows[0].n;
      if (cabecalho) return { dados: null, total };
    }
    const order = (ordem ?? []).length
      ? `order by ${ordem.map((o) => `t.${id(o.coluna)} ${o.ascendente === false ? "desc" : "asc"} nulls ${o.nulosPrimeiro ? "first" : "last"}`).join(", ")}`
      : "";
    let paginacao = "";
    if (intervalo) paginacao = `limit ${intervalo[1] - intervalo[0] + 1} offset ${intervalo[0]}`;
    else if (limite) paginacao = `limit ${Number(limite)}`;
    sql = `select ${colunasSelect(tabela, colunas).join(", ")} from ${alvo} ${where} ${order} ${paginacao}`;
  } else {
    const linhas = Array.isArray(valores) ? valores : valores ? [valores] : [];
    const retorno = `returning ${colunasSelect(tabela, colunas ?? "*").join(", ")}`;
    if (operacao === "insert" || operacao === "upsert") {
      const nomes = [...new Set(linhas.flatMap((l) => Object.keys(l)))];
      const tuplas = linhas.map((l) => `(${nomes.map((n) => { params.push(l[n] ?? null); return `$${params.length}`; }).join(", ")})`);
      const upsert = operacao === "upsert"
        ? `on conflict (${(conflito ?? "id").split(",").map((c) => id(c.trim())).join(", ")}) do update set ${nomes.map((n) => `${id(n)} = excluded.${id(n)}`).join(", ")}`
        : "";
      sql = `insert into public.${id(tabela)} as t (${nomes.map(id).join(", ")}) values ${tuplas.join(", ")} ${upsert} ${retorno}`;
    } else if (operacao === "update") {
      const sets = Object.entries(linhas[0] ?? {}).filter(([, v]) => v !== undefined)
        .map(([n, v]) => { params.push(v); return `${id(n)} = $${params.length}`; });
      sql = `update ${alvo} set ${sets.join(", ")} ${montarFiltros(filtros, params)} ${retorno}`;
    } else if (operacao === "delete") {
      sql = `delete from ${alvo} ${montarFiltros(filtros, params)} ${retorno}`;
    } else {
      throw new Error(`Operação não suportada: ${operacao}`);
    }
  }

  const envelope = operacao === "select"
    ? `select coalesce(json_agg(q), '[]'::json) as dados from (${sql}) q`
    : `with q as (${sql}) select coalesce(json_agg(q), '[]'::json) as dados from q`;
  const { rows } = await db.query(envelope, params);
  let dados = rows[0].dados;
  if (unico) {
    if (dados.length > 1 || (unico === "single" && dados.length === 0)) {
      throw Object.assign(new Error("JSON object requested, multiple (or no) rows returned"), { code: "PGRST116" });
    }
    dados = dados[0] ?? null;
  }
  return { dados, total };
}

// PGlite tem uma conexão só: as transações precisam de fila.
let fila = Promise.resolve();
function emFila(fn) {
  const r = fila.then(fn, fn);
  fila = r.catch(() => {});
  return r;
}

export async function iniciarServidor({ porta = 54329 } = {}) {
  console.log("[banco-local] subindo PGlite e aplicando migrations…");
  const db = await criarBanco();
  await db.exec(`set timezone to 'UTC'`);
  console.log("[banco-local] gerando dados sintéticos…");
  const { usuarios } = await semear(db);
  // O relógio do banco local é o real (o congelamento é só dos testes).
  await db.query(`select set_config('teste.agora', '', false)`);
  console.log("[banco-local] pronto. Usuários:", Object.keys(usuarios).join(", "));

  const servidor = createServer((req, res) => {
    let corpo = "";
    req.on("data", (c) => (corpo += c));
    req.on("end", () =>
      emFila(async () => {
        const responder = (status, obj) => {
          res.writeHead(status, { "content-type": "application/json" });
          res.end(JSON.stringify(obj));
        };
        try {
          const pedido = JSON.parse(corpo || "{}");
          if (req.url === "/usuarios") return responder(200, usuarios);
          const usuario = usuarios[pedido.usuario] ?? usuarios.dono;
          const { rows: [u] } = await db.query(`select id, email from auth.users where id = $1`, [usuario]);

          if (pedido.tipo === "usuario") return responder(200, { dados: u, erro: null });

          await db.exec("begin");
          try {
            await db.query(`select set_config('request.jwt.claims', $1, true)`, [
              JSON.stringify({ sub: usuario, role: "authenticated", email: u.email }),
            ]);
            await db.exec("set local role authenticated");
            const resultado = pedido.tipo === "rpc"
              ? { dados: await executarRpc(db, pedido), total: null }
              : await executarTabela(db, pedido);
            await db.exec("commit");
            responder(200, { dados: resultado.dados, total: resultado.total, erro: null });
          } catch (e) {
            await db.exec("rollback").catch(() => {});
            responder(200, { dados: null, erro: { message: e.message, code: e.code ?? null } });
          }
        } catch (e) {
          responder(500, { dados: null, erro: { message: e.message } });
        }
      }),
    );
  });

  // A fila pode demorar: sem folga no timeout o Node derruba a conexão ociosa.
  servidor.keepAliveTimeout = 120_000;
  servidor.headersTimeout = 125_000;
  servidor.requestTimeout = 0;
  await new Promise((ok) => servidor.listen(porta, "127.0.0.1", ok));
  console.log(`[banco-local] ouvindo em http://127.0.0.1:${porta}`);
  return servidor;
}

if (process.argv[1] && process.argv[1].endsWith("servidor.mjs")) {
  iniciarServidor();
}
