// ============================================================================
//  Publica uma versão do agente para a frota se atualizar sozinha.
//
//  POR QUE NÃO É UM ZIP
//
//  O pacote publicado tem 225 MB, dos quais 223 MB são o runtime do .NET —
//  idêntico entre releases, e ainda duplicado entre serviço e coletor. O que
//  de fato muda a cada versão são 391 KB dos nossos assemblies. Um zip faria
//  cada máquina baixar 225 MB para receber 391 KB de novidade; com trinta
//  máquinas isso é quase 7 GB por release, o que estoura a cota do projeto na
//  primeira atualização.
//
//  Então cada arquivo é guardado pelo seu próprio sha256 (blobs/<hash>). Dois
//  efeitos caem de graça: o runtime sobe UMA vez e nunca mais, e a estação
//  baixa só os hashes que ainda não tem — tipicamente os 391 KB.
//
//  CADEIA DE CONFIANÇA
//
//  A tabela versoes_agente guarda a url do MANIFESTO e o sha256 DELE. O
//  manifesto lista cada arquivo com o próprio hash. A estação confere o
//  manifesto contra o hash da tabela e, depois, cada arquivo contra o hash do
//  manifesto. Um blob adulterado no Storage não passa; um manifesto adulterado
//  também não, porque o hash dele está no banco, onde só a plataforma escreve.
//
//  USO
//    SERVICE_ROLE=<chave> node agente/publicacao/publicar-versao.mjs [--notas "texto"]
//
//  A chave nunca é gravada: vem do ambiente e morre com o processo.
// ============================================================================

import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const URL_SUPABASE = "https://auwotdrgxjrrhhhmmekc.supabase.co";
const BUCKET = "agente";
const RAIZ = new URL("../..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const PASTA_PACOTE = join(RAIZ, "agente", "publicado-cliente");
const PROPS = join(RAIZ, "agente", "src", "Directory.Build.props");

const CHAVE = process.env.SERVICE_ROLE;
if (!CHAVE) {
  console.error("Defina SERVICE_ROLE com a service_role key do Supabase.");
  process.exit(2);
}

const notas = (() => {
  const i = process.argv.indexOf("--notas");
  return i > 0 ? process.argv[i + 1] : null;
})();

// ---------------------------------------------------------------------------
//  1. Versão: lida do mesmo arquivo que carimba os binários
// ---------------------------------------------------------------------------
const versao = readFileSync(PROPS, "utf8").match(/<VersaoAgente>([^<]+)<\/VersaoAgente>/)?.[1];
if (!versao) {
  console.error("Não achei <VersaoAgente> em Directory.Build.props.");
  process.exit(1);
}
console.log(`Versão a publicar: ${versao}\n`);

// ---------------------------------------------------------------------------
//  2. Varre o pacote e calcula o hash de cada arquivo
// ---------------------------------------------------------------------------
function listar(pasta) {
  const saida = [];
  for (const nome of readdirSync(pasta)) {
    const caminho = join(pasta, nome);
    if (statSync(caminho).isDirectory()) saida.push(...listar(caminho));
    else saida.push(caminho);
  }
  return saida;
}

// Os scripts de instalação não entram: a máquina que se atualiza sozinha não
// precisa deles, e mantê-los fora evita que uma atualização troque o
// instalador debaixo de quem estiver rodando ele.
const IGNORAR = new Set(["Instalar.bat", "Instalar.ps1", "Desinstalar.bat", "Desinstalar.ps1"]);

const arquivos = listar(PASTA_PACOTE)
  .filter((c) => !IGNORAR.has(c.split(sep).pop()))
  .map((caminho) => {
    const conteudo = readFileSync(caminho);
    return {
      caminho: relative(PASTA_PACOTE, caminho).split(sep).join("/"),
      sha256: createHash("sha256").update(conteudo).digest("hex"),
      tamanho: conteudo.length,
      conteudo,
    };
  });

const unicos = new Map(arquivos.map((a) => [a.sha256, a]));
const bytesTotais = arquivos.reduce((s, a) => s + a.tamanho, 0);
console.log(`${arquivos.length} arquivos, ${(bytesTotais / 1048576).toFixed(0)} MB`);
console.log(`${unicos.size} blobs únicos (o resto é duplicata dentro do próprio pacote)\n`);

// ---------------------------------------------------------------------------
//  3. Sobe só os blobs que ainda não existem
// ---------------------------------------------------------------------------
const cabecalhos = { apikey: CHAVE, Authorization: `Bearer ${CHAVE}` };

async function existe(caminho) {
  const r = await fetch(`${URL_SUPABASE}/storage/v1/object/info/${BUCKET}/${caminho}`, {
    headers: cabecalhos,
  });
  return r.ok;
}

async function subir(caminho, conteudo, tipo = "application/octet-stream") {
  const r = await fetch(`${URL_SUPABASE}/storage/v1/object/${BUCKET}/${caminho}`, {
    method: "POST",
    headers: { ...cabecalhos, "Content-Type": tipo, "x-upsert": "true" },
    body: conteudo,
  });
  if (!r.ok) throw new Error(`upload ${caminho}: ${r.status} ${await r.text()}`);
}

let enviados = 0;
let bytesEnviados = 0;
let reaproveitados = 0;

const lista = [...unicos.values()];
// Em blocos: 500 requisições em paralelo derrubariam o rate limit.
const BLOCO = 8;
for (let i = 0; i < lista.length; i += BLOCO) {
  await Promise.all(
    lista.slice(i, i + BLOCO).map(async (a) => {
      const destino = `blobs/${a.sha256}`;
      if (await existe(destino)) {
        reaproveitados++;
        return;
      }
      await subir(destino, a.conteudo);
      enviados++;
      bytesEnviados += a.tamanho;
    }),
  );
  process.stdout.write(`\r  enviados ${enviados}  reaproveitados ${reaproveitados}  de ${lista.length}`);
}
console.log(`\n  ${(bytesEnviados / 1048576).toFixed(1)} MB de rede — o resto já estava lá.\n`);

// ---------------------------------------------------------------------------
//  4. Manifesto: o que a estação lê para montar a versão
// ---------------------------------------------------------------------------
const manifesto = JSON.stringify(
  {
    versao,
    gerado_em: new Date().toISOString(),
    base_blobs: `${URL_SUPABASE}/storage/v1/object/public/${BUCKET}/blobs/`,
    arquivos: arquivos.map(({ caminho, sha256, tamanho }) => ({ caminho, sha256, tamanho })),
  },
  null,
  2,
);

const caminhoManifesto = `manifestos/${versao}.json`;
await subir(caminhoManifesto, Buffer.from(manifesto), "application/json");

const urlManifesto = `${URL_SUPABASE}/storage/v1/object/public/${BUCKET}/${caminhoManifesto}`;
const hashManifesto = createHash("sha256").update(manifesto).digest("hex");
console.log(`Manifesto: ${urlManifesto}`);
console.log(`sha256:    ${hashManifesto}\n`);

// ---------------------------------------------------------------------------
//  5. Registra a versão — é isto que faz a frota andar
// ---------------------------------------------------------------------------
const r = await fetch(`${URL_SUPABASE}/rest/v1/rpc/publicar_versao_agente`, {
  method: "POST",
  headers: { ...cabecalhos, "Content-Type": "application/json" },
  body: JSON.stringify({
    p_versao: versao,
    p_url: urlManifesto,
    p_sha256: hashManifesto,
    p_tamanho: bytesTotais,
    p_notas: notas,
    p_vigente: true,
  }),
});

if (!r.ok) {
  const erro = await r.text();
  console.error(`Falha ao registrar a versão: ${r.status} ${erro}`);
  if (erro.includes("já foi publicada")) {
    console.error("\nSuba <VersaoAgente> em Directory.Build.props e recompile antes de publicar.");
  }
  process.exit(1);
}

console.log(`Versão ${versao} publicada e marcada como vigente.`);
console.log("As estações vão migrar sozinhas na próxima sincronização.");
