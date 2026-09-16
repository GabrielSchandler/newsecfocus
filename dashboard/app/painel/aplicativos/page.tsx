import { redirect } from "next/navigation";
import { AlertCircle, BarChart2, CheckCircle2, LayoutGrid, List, PieChart, Search } from "lucide-react";
import { AbasPainel } from "@/components/painel/abas-painel";
import { BarraFiltros } from "@/components/painel/barra-filtros";
import { BotaoExportar } from "@/components/painel/botao-exportar";
import { AvisoErro, CabecalhoPagina } from "@/components/painel/cabecalho";
import { DonutCategorias } from "@/components/painel/graficos-aplicativos";
import { ListaAplicativos } from "@/components/painel/lista-aplicativos";
import { Aviso, BarrasHorizontais, GradeIndicadores, Indicador, Secao } from "@/components/painel/kit";
import { criarClienteServidor } from "@/lib/supabase/server";
import { carregarContexto, podeAdministrar } from "@/lib/sessao";
import { comFalha, primeiroErro } from "@/lib/carregar";
import { lerFiltros, orgEfetiva, paramsDoRecorte, type ParamsPagina } from "@/lib/filtros-url";
import { formatarDuracao } from "@/lib/formato";
import { janelaAtual } from "@/lib/produtividade";
import { juntar, rotuloIntervaloCurto } from "@/lib/visao-geral";
import {
  buscarAplicativosLista,
  buscarAplicativosResumo,
  buscarCategorias,
  buscarColaboradores,
  buscarEquipes,
} from "@/lib/consultas";
import type { FiltroAplicativos } from "@/lib/tipos";

export const dynamic = "force-dynamic";

const POR_PAGINA = 15;
const FILTROS: FiltroAplicativos[] = ["todos", "aplicativos", "sites", "sem"];
const texto = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function PaginaAplicativos({
  searchParams,
}: {
  searchParams: Promise<ParamsPagina>;
}) {
  const params = await searchParams;
  const supabase = await criarClienteServidor();
  const contexto = await carregarContexto(supabase);

  if (!contexto) redirect("/entrar");

  const { periodo, escopo } = lerFiltros(params, contexto);
  const recorte = paramsDoRecorte(params);
  const fuso = contexto.empresa.fuso;
  const org = orgEfetiva(contexto, escopo);
  const admin = podeAdministrar(contexto);
  const janela = janelaAtual(periodo);

  const filtroBruto = texto(params.filtro) as FiltroAplicativos | undefined;
  const filtro = FILTROS.includes(filtroBruto as FiltroAplicativos) ? filtroBruto! : "todos";
  const busca = texto(params.busca)?.trim() || null;
  const pagina = Math.max(1, Number(texto(params.pagina)) || 1);

  const [equipes, colaboradores, resumo, lista, topo, categorias] = await Promise.all([
    comFalha(buscarEquipes(supabase, org), []),
    comFalha(buscarColaboradores(supabase, null, org), []),
    comFalha(buscarAplicativosResumo(supabase, janela, escopo), null),
    comFalha(buscarAplicativosLista(supabase, janela, escopo, { filtro, busca, pagina, limite: POR_PAGINA }), { linhas: [], total: 0 }),
    comFalha(buscarAplicativosLista(supabase, janela, escopo, { limite: 5 }), { linhas: [], total: 0 }),
    admin ? comFalha(buscarCategorias(supabase, org), []) : Promise.resolve({ dados: [], erro: null }),
  ]);

  const r = resumo.dados;
  const pct = (n: number) => (r && r.identificados > 0 ? Math.round((n / r.identificados) * 100) : 0);

  const hrefCom = (mudancas: Record<string, string | null>) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      const valor = texto(v);
      if (valor) u.set(k, valor);
    }
    for (const [k, v] of Object.entries(mudancas)) {
      if (v === null) u.delete(k);
      else u.set(k, v);
    }
    const q = u.toString();
    return `/painel/aplicativos${q ? `?${q}` : ""}`;
  };

  const erro = primeiroErro(resumo, lista);

  return (
    <div className="space-y-4 sm:space-y-5">
      <CabecalhoPagina
        titulo="Aplicativos e sites"
        descricao="Veja quais aplicativos e sites são usados pela equipe e como estão classificados."
        acoes={
          <>
            <BarraFiltros
              variante="topo"
              rotuloPeriodo={rotuloIntervaloCurto(periodo, fuso)}
              periodo={periodo}
              escopo={escopo}
              fuso={fuso}
              equipes={equipes.dados}
              colaboradores={colaboradores.dados}
              campos={["equipe", "colaborador"]}
              travarEquipe={!!contexto.equipeEscopo}
            />
            <BotaoExportar periodo={periodo} escopo={escopo} tipos={["aplicativos"]} destaque />
          </>
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <AbasPainel
          param="filtro"
          ativa={filtro}
          preservar={{ apagar: ["pagina"] }}
          abas={[
            { chave: "todos", rotulo: "Todos" },
            { chave: "aplicativos", rotulo: "Aplicativos" },
            { chave: "sites", rotulo: "Sites" },
            { chave: "sem", rotulo: "Sem classificação", selo: r?.semClassificacao },
          ]}
        />
        <form action="/painel/aplicativos" method="get" role="search" className="relative w-full sm:w-72">
          {Object.entries(params)
            .filter(([k]) => !["busca", "pagina"].includes(k))
            .map(([k, v]) => (
              <input key={k} type="hidden" name={k} value={texto(v) ?? ""} />
            ))}
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            name="busca"
            defaultValue={busca ?? ""}
            placeholder="Buscar processo ou domínio…"
            aria-label="Buscar aplicativo ou site"
            className="h-10 w-full rounded-lg border border-borda bg-white pl-9 pr-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-acao/60 focus:ring-2 focus:ring-acao/15"
          />
        </form>
      </div>

      {erro && <AvisoErro mensagem={erro} />}

      <GradeIndicadores colunas={3}>
        <Indicador compacto icone={<LayoutGrid />} rotulo="Aplicativos e sites identificados" valor={r?.identificados ?? "—"} rodape={r ? `${r.aplicativos} aplicativos · ${r.sites} sites` : undefined} />
        <Indicador compacto icone={<CheckCircle2 />} rotulo={`Classificados (${pct(r?.classificados ?? 0)}%)`} valor={r?.classificados ?? "—"} rodape="com categoria efetiva no período" />
        <Indicador
          compacto
          tom={r && r.semClassificacao > 0 ? "alerta" : "normal"}
          icone={<AlertCircle />}
          rotulo={`Pendentes de classificação (${pct(r?.semClassificacao ?? 0)}%)`}
          valor={r?.semClassificacao ?? "—"}
          rodape={r ? `${formatarDuracao(r.minutosPorTipo.SEM)} fora do índice` : undefined}
        />
      </GradeIndicadores>

      {r && r.semClassificacao > 0 && filtro !== "sem" && (
        <Aviso titulo={admin ? undefined : "Sem classificação"} acao={{ rotulo: "Ver não classificados", href: hrefCom({ filtro: "sem", pagina: null }) }}>
          {admin
            ? `Classifique ${r.semClassificacao} ${r.semClassificacao === 1 ? "item sem categoria" : "itens sem categoria"}: esse tempo não entra no índice e deixa os relatórios incompletos.`
            : `${r.semClassificacao} ${r.semClassificacao === 1 ? "item está" : "itens estão"} sem categoria e fora do índice. Quem administra a empresa pode classificar.`}
        </Aviso>
      )}

      <div className="grid grid-cols-1 gap-4 sm:gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <Secao icone={<PieChart />} titulo="Categorias de uso" subtitulo="Quantidade de itens por categoria e tempo de cada grupo">
          {r ? (
            <DonutCategorias
              quantidades={{ ...r.qtdPorTipo, SEM: r.semClassificacao }}
              minutos={r.minutosPorTipo}
            />
          ) : (
            <p className="text-sm text-slate-500">—</p>
          )}
        </Secao>
        <Secao
          icone={<BarChart2 />}
          titulo="Aplicativos e sites mais utilizados"
          subtitulo="Tempo ativo no período, dentro e fora da escala · % do tempo em aplicativos"
        >
          <BarrasHorizontais
            vazio="Nenhum uso no período."
            itens={topo.dados.linhas.map((l) => ({
              chave: l.alvo,
              rotulo: l.alvo,
              valor: l.minutos,
              texto: formatarDuracao(l.minutos),
              percentual: r && r.minutosTotal > 0 ? (l.minutos / r.minutosTotal) * 100 : null,
              href: `/painel/aplicativos/${encodeURIComponent(l.alvo)}${recorte}`,
            }))}
          />
        </Secao>
      </div>

      <Secao
        icone={<List />}
        titulo="Lista de aplicativos e sites"
        subtitulo={
          busca
            ? `Resultado para “${busca}”`
            : "O tempo inclui uso dentro e fora da escala. A categoria de um site específico prevalece sobre a do navegador."
        }
      >
        <ListaAplicativos
          linhas={lista.dados.linhas}
          total={lista.dados.total}
          pagina={pagina}
          porPagina={POR_PAGINA}
          hrefPagina={(p) => hrefCom({ pagina: String(p) })}
          recorte={recorte}
          categorias={categorias.dados}
          admin={admin}
          vazio={filtro === "sem" ? "Tudo classificado neste período." : "Nenhum aplicativo ou site no filtro escolhido."}
        />
        {admin && (
          <p className="mt-3 text-xs text-slate-500">
            Categorias e regras em lote ficam em{" "}
            <a href={juntar("", "aba=classificacao").replace("?", "/painel/administracao?")} className="text-acao hover:underline">
              Administração › Classificação
            </a>
            .
          </p>
        )}
      </Secao>
    </div>
  );
}
