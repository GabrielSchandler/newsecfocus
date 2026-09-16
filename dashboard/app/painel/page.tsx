import { redirect } from "next/navigation";
import { AvisoErro } from "@/components/painel/cabecalho";
import { AbasPainel, type AbaPainel } from "@/components/painel/abas-painel";
import { ResumoVisaoGeral } from "@/components/painel/visao-geral";
import { GraficoArea } from "@/components/painel/grafico-area";
import { SecaoDispersao } from "@/components/painel/secao-dispersao";
import { SecaoRitmo } from "@/components/painel/secao-ritmo";
import { TimelineAtividade } from "@/components/painel/timeline-atividade";
import { criarClienteServidor } from "@/lib/supabase/server";
import { carregarContexto, podeAdministrar } from "@/lib/sessao";
import { comFalha, primeiroErro } from "@/lib/carregar";
import { lerFiltros, orgEfetiva, paramsDoRecorte, type ParamsPagina } from "@/lib/filtros-url";
import { REGRAS } from "@/lib/regras";
import {
  agregarProdutividade,
  compararIndice,
  janelaAtual,
  janelaComparativo,
} from "@/lib/produtividade";
import {
  compararEquipes,
  foraDaEscala,
  janelaEvolucao,
  montarEvolucao,
  pontosDeAtencao,
} from "@/lib/visao-geral";
import {
  buscarAplicativosResumo,
  buscarDispersao,
  buscarEquipes,
  buscarEstacoes,
  buscarPessoasContagem,
  buscarProdutividade,
  buscarRitmo,
  buscarSerie,
  buscarSerieProdutividade,
  buscarTempoReal,
  buscarUltimaConsolidacao,
} from "@/lib/consultas";

// Telemetria muda a cada minuto: nada de cache de página.
export const dynamic = "force-dynamic";

/** Detalhamento embaixo do resumo — só a aba aberta consulta o banco. */
const ABAS: AbaPainel[] = [
  { chave: "atividade", rotulo: "Atividade ao longo do período" },
  { chave: "ritmo", rotulo: "Ritmo e alternância" },
  { chave: "registros", rotulo: "Últimos registros" },
];

/** Abas que saíram daqui, e para onde foram. */
const ABAS_MUDADAS: Record<string, (recorte: string) => string> = {
  aplicativos: (r) => `/painel/aplicativos${r}`,
  presenca: (r) => `/painel/jornada${r}`,
  horas: (r) => `/painel/jornada${r}`,
  pessoas: (r) => `/painel/pessoas${r}`,
  tempo: (r) => `/painel${r ? `${r}&` : "?"}visao=registros`,
  resumo: (r) => `/painel${r}`,
};

export default async function PaginaVisaoGeral({
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

  const abaBruta = params.visao;
  const escolhida = Array.isArray(abaBruta) ? abaBruta[0] : abaBruta;
  if (escolhida && ABAS_MUDADAS[escolhida]) redirect(ABAS_MUDADAS[escolhida](recorte));
  const aba = ABAS.some((a) => a.chave === escolhida) ? escolhida! : "atividade";

  // A janela atual para no relógio: somar o futuro do dia inflaria o expediente.
  // A de comparação é o período anterior cortado no mesmo ponto — e, no preset
  // de dia, o último dia COM expediente (segunda compara com sexta).
  const janela = janelaAtual(periodo);
  const evolucao = janelaEvolucao(periodo, fuso);
  const comparativo = await comFalha(janelaComparativo(supabase, periodo, fuso, org), null);

  const [
    equipes,
    estacoes,
    produtividade,
    anterior,
    aplicativos,
    pessoas,
    serieAtual,
    serieAnterior,
    consolidacao,
  ] = await Promise.all([
    comFalha(buscarEquipes(supabase, org), []),
    comFalha(buscarEstacoes(supabase, escopo.orgId), []),
    comFalha(buscarProdutividade(supabase, janela, escopo), []),
    comparativo.dados
      ? comFalha(buscarProdutividade(supabase, comparativo.dados, escopo), [])
      : Promise.resolve({ dados: [], erro: null }),
    comFalha(buscarAplicativosResumo(supabase, janela, escopo), null),
    comFalha(buscarPessoasContagem(supabase, janela, escopo), null),
    comFalha(buscarSerieProdutividade(supabase, evolucao.atual, evolucao.balde, escopo), []),
    evolucao.anterior
      ? comFalha(buscarSerieProdutividade(supabase, evolucao.anterior, evolucao.balde, escopo), [])
      : Promise.resolve({ dados: [], erro: null }),
    comFalha(buscarUltimaConsolidacao(supabase), null),
  ]);

  const resumo = agregarProdutividade(produtividade.dados);
  const resumoAnterior = comparativo.dados && !anterior.erro ? agregarProdutividade(anterior.dados) : null;
  const linhasEquipes = compararEquipes(produtividade.dados, resumoAnterior ? anterior.dados : null);

  const pontos = pontosDeAtencao({
    // A estação atrasada já tem a faixa própria logo abaixo dos indicadores.
    aplicativos: aplicativos.dados,
    pessoas: pessoas.dados,
    produtividade: produtividade.dados,
    equipes: linhasEquipes,
    admin,
    recorte,
    limite: REGRAS.maxPontosAtencao,
  });

  // A série e as equipes têm aviso próprio: falhar ali não invalida o resto.
  const erro = primeiroErro(produtividade, estacoes);

  return (
    <div className="space-y-4 sm:space-y-5">
      <ResumoVisaoGeral
        periodo={periodo}
        escopo={escopo}
        fuso={fuso}
        equipes={equipes.dados}
        travarEquipe={!!contexto.equipeEscopo}
        estacoes={estacoes.dados}
        ultimaConsolidacao={consolidacao.dados}
        erro={erro}
        resumo={resumo}
        variacao={compararIndice(resumo, resumoAnterior)}
        rotuloComparacao={comparativo.dados?.rotulo ?? null}
        foraDoExpediente={produtividade.erro ? undefined : foraDaEscala(produtividade.dados)}
        pontos={pontos}
        evolucao={{
          pontos: montarEvolucao(evolucao, serieAtual.dados, serieAnterior.dados, fuso),
          descricao: evolucao.descricao,
          temAnterior: !!evolucao.anterior,
          erro: primeiroErro(serieAtual, serieAnterior),
        }}
        equipesComparadas={{ linhas: linhasEquipes, temAnterior: !!resumoAnterior, erro: produtividade.erro }}
        recorte={recorte}
      />

      <section aria-labelledby="titulo-detalhamento" className="space-y-4 pt-3">
        <h2 id="titulo-detalhamento" className="text-lg font-semibold text-tinta">
          Análise detalhada
        </h2>
        <AbasPainel abas={ABAS} ativa={aba} variante="sublinhado" />

        {aba === "atividade" && <SecaoAtividade supabase={supabase} periodo={periodo} escopo={escopo} fuso={fuso} />}
        {aba === "ritmo" && <SecaoRitmoAba supabase={supabase} periodo={periodo} escopo={escopo} />}
        {aba === "registros" && <SecaoUltimosRegistros supabase={supabase} orgId={escopo.orgId} />}
      </section>
    </div>
  );
}

async function SecaoAtividade({ supabase, periodo, escopo, fuso }: any) {
  const serie = await comFalha(buscarSerie(supabase, periodo, escopo, fuso), []);
  return (
    <>
      {serie.erro && <AvisoErro mensagem={serie.erro} />}
      <GraficoArea dados={serie.dados} bucket={periodo.bucket} fuso={fuso} periodoRotulo={periodo.rotulo} />
    </>
  );
}

async function SecaoRitmoAba({ supabase, periodo, escopo }: any) {
  const [ritmo, dispersao] = await Promise.all([
    comFalha(buscarRitmo(supabase, periodo, escopo), []),
    comFalha(buscarDispersao(supabase, periodo, escopo), []),
  ]);
  return (
    <>
      {primeiroErro(ritmo, dispersao) && <AvisoErro mensagem={primeiroErro(ritmo, dispersao)!} />}
      <SecaoRitmo dados={ritmo.dados} />
      <SecaoDispersao linhas={dispersao.dados} />
    </>
  );
}

async function SecaoUltimosRegistros({ supabase, orgId }: any) {
  const tempoReal = await comFalha(buscarTempoReal(supabase, orgId), []);
  return (
    <>
      {tempoReal.erro && <AvisoErro mensagem={tempoReal.erro} />}
      <TimelineAtividade inicial={tempoReal.dados} />
    </>
  );
}
