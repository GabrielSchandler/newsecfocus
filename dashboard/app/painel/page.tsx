import { LayoutDashboard } from "lucide-react";
import { redirect } from "next/navigation";
import { BarraFiltros } from "@/components/painel/barra-filtros";
import { BotaoExportar } from "@/components/painel/botao-exportar";
import { CabecalhoPagina, AvisoErro } from "@/components/painel/cabecalho";
import { AbasPainel, type AbaPainel } from "@/components/painel/abas-painel";
import { ResumoExpediente } from "@/components/painel/resumo-expediente";
import { GraficoArea } from "@/components/painel/grafico-area";
import { GraficoBarras } from "@/components/painel/grafico-barras";
import { GraficoDonut } from "@/components/painel/grafico-donut";
import { SecaoAplicativos } from "@/components/painel/secao-aplicativos";
import { SecaoDispersao } from "@/components/painel/secao-dispersao";
import { SecaoEvolucao } from "@/components/painel/secao-evolucao";
import { SecaoHorasExtras } from "@/components/painel/secao-horas-extras";
import { SecaoPresenca } from "@/components/painel/secao-presenca";
import { SecaoRitmo } from "@/components/painel/secao-ritmo";
import { TimelineAtividade } from "@/components/painel/timeline-atividade";
import { criarClienteServidor } from "@/lib/supabase/server";
import { carregarContexto, podeAdministrar } from "@/lib/sessao";
import { comFalha, primeiroErro } from "@/lib/carregar";
import { lerFiltros, orgEfetiva, type ParamsPagina } from "@/lib/filtros-url";
import {
  agregarProdutividade,
  janelaAtual,
  janelaComparativo,
} from "@/lib/produtividade";
import {
  buscarCategorias,
  buscarColaboradores,
  buscarDispositivos,
  buscarDispersao,
  buscarDistribuicao,
  buscarDominios,
  buscarEquipes,
  buscarEvolucao,
  buscarHorasExtras,
  buscarProdutividade,
  buscarPresenca,
  buscarRankingEquipes,
  buscarRitmo,
  buscarSerie,
  buscarTempoReal,
} from "@/lib/consultas";

// Telemetria muda a cada minuto: nada de cache de página.
export const dynamic = "force-dynamic";

const ABAS: AbaPainel[] = [
  { chave: "resumo", rotulo: "Resumo" },
  { chave: "aplicativos", rotulo: "Aplicativos" },
  { chave: "presenca", rotulo: "Presença" },
  { chave: "ritmo", rotulo: "Ritmo" },
  { chave: "horas", rotulo: "Horas extras" },
  { chave: "tempo", rotulo: "Tempo real" },
];

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
  const fuso = contexto.empresa.fuso;
  const org = orgEfetiva(contexto, escopo);
  const admin = podeAdministrar(contexto);

  const abaBruta = params.visao;
  const escolhida = Array.isArray(abaBruta) ? abaBruta[0] : abaBruta;
  const aba = ABAS.some((a) => a.chave === escolhida) ? escolhida! : "resumo";

  // Filtros e resumo executivo carregam sempre; o corpo de cada aba carrega só
  // o que ela precisa — a tela abre mais leve e cada aba puxa o seu.
  // A janela atual para no relógio: somar o futuro do dia inflaria o expediente.
  // A de comparação é o período anterior cortado no mesmo ponto — e, no preset
  // de dia, o último dia COM expediente (segunda compara com sexta).
  const janela = janelaAtual(periodo);
  const comparativo = await comFalha(janelaComparativo(supabase, periodo, fuso, org), null);

  const [equipes, colaboradores, dispositivos, produtividade, anterior] = await Promise.all([
    comFalha(buscarEquipes(supabase, org), []),
    comFalha(buscarColaboradores(supabase, null, org), []),
    comFalha(buscarDispositivos(supabase, org), []),
    comFalha(buscarProdutividade(supabase, janela, escopo), []),
    comparativo.dados
      ? comFalha(buscarProdutividade(supabase, comparativo.dados, escopo), [])
      : Promise.resolve({ dados: [], erro: null }),
  ]);

  const resumo = agregarProdutividade(produtividade.dados);
  const resumoAnterior = comparativo.dados ? agregarProdutividade(anterior.dados) : null;

  const precisaCategorias = admin && (aba === "resumo" || aba === "aplicativos");
  const categorias = precisaCategorias
    ? await comFalha(buscarCategorias(supabase, org), [])
    : { dados: [], erro: null };

  return (
    <div className="space-y-5">
      <CabecalhoPagina
        titulo="Visão geral"
        descricao={`${contexto.empresa.nome} · ${periodo.rotulo}`}
        icone={<LayoutDashboard className="h-5 w-5 text-cyan-400" />}
        acoes={<BotaoExportar periodo={periodo} escopo={escopo} />}
      />

      <BarraFiltros
        periodo={periodo}
        escopo={escopo}
        fuso={fuso}
        equipes={equipes.dados}
        colaboradores={colaboradores.dados}
        dispositivos={dispositivos.dados}
        campos={["equipe", "colaborador", "dispositivo"]}
        travarEquipe={!!contexto.equipeEscopo}
      />

      {produtividade.erro && <AvisoErro mensagem={produtividade.erro} />}

      {/* Resumo executivo: sempre visível, é o que a pessoa abre o app para ver. */}
      <ResumoExpediente
        resumo={resumo}
        anterior={resumoAnterior}
        rotuloComparacao={comparativo.dados?.rotulo ?? null}
      />

      <AbasPainel abas={ABAS} ativa={aba} />

      {aba === "resumo" && (
        <SecaoResumo
          supabase={supabase}
          periodo={periodo}
          escopo={escopo}
          fuso={fuso}
          categorias={categorias.dados}
          admin={admin}
        />
      )}

      {aba === "aplicativos" && (
        <SecaoAplicativosAba
          supabase={supabase}
          periodo={periodo}
          escopo={escopo}
          categorias={categorias.dados}
          admin={admin}
        />
      )}

      {aba === "presenca" && (
        <SecaoPresencaAba supabase={supabase} periodo={periodo} escopo={escopo} />
      )}

      {aba === "ritmo" && (
        <SecaoRitmoAba supabase={supabase} periodo={periodo} escopo={escopo} />
      )}

      {aba === "horas" && (
        <SecaoHorasAba
          supabase={supabase}
          periodo={periodo}
          escopo={escopo}
          admin={admin}
        />
      )}

      {aba === "tempo" && (
        <SecaoTempoReal supabase={supabase} orgId={escopo.orgId} />
      )}
    </div>
  );
}


async function SecaoResumo({
  supabase,
  periodo,
  escopo,
  fuso,
  categorias,
  admin,
}: any) {
  const [serie, distribuicao, rankingEquipes, evolucao] = await Promise.all([
    comFalha(buscarSerie(supabase, periodo, escopo, fuso), []),
    comFalha(buscarDistribuicao(supabase, periodo, escopo, 8), []),
    comFalha(buscarRankingEquipes(supabase, periodo, escopo.orgId), []),
    comFalha(buscarEvolucao(supabase, periodo, escopo), []),
  ]);

  const erro = primeiroErro(serie, distribuicao, rankingEquipes, evolucao);

  // Comparar equipes só faz sentido quando o recorte não é de uma equipe só.
  const mostrarComparativo =
    !escopo.equipeId && !escopo.colaboradorId && rankingEquipes.dados.length > 1;

  return (
    <div className="space-y-5">
      {erro && <AvisoErro mensagem={erro} />}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-5">
        <div className="min-w-0 xl:col-span-3">
          <GraficoArea
            dados={serie.dados}
            bucket={periodo.bucket}
            fuso={fuso}
            periodoRotulo={periodo.rotulo}
          />
        </div>
        <div className="min-w-0 xl:col-span-2">
          <GraficoDonut
            dados={distribuicao.dados}
            categorias={categorias}
            podeClassificar={admin}
          />
        </div>
      </div>

      {mostrarComparativo && (
        <GraficoBarras
          titulo="Comparativo entre equipes"
          subtitulo="tempo ativo por categoria no período"
          dados={rankingEquipes.dados.map((e: any) => ({
            id: e.equipeId,
            nome: e.equipe,
            produtivo: e.minutosProdutivos,
            neutro: e.minutosNeutros,
            improdutivo: e.minutosImprodutivos,
            indice: e.indice,
          }))}
        />
      )}

      <SecaoEvolucao linhas={evolucao.dados} />
    </div>
  );
}

async function SecaoAplicativosAba({ supabase, periodo, escopo, categorias, admin }: any) {
  const [distribuicao, dominios] = await Promise.all([
    comFalha(buscarDistribuicao(supabase, periodo, escopo, 60), []),
    comFalha(buscarDominios(supabase, periodo, escopo, 20), []),
  ]);
  return (
    <>
      {distribuicao.erro && <AvisoErro mensagem={distribuicao.erro} />}
      <SecaoAplicativos
        apps={distribuicao.dados}
        categorias={categorias}
        admin={admin}
        dominios={dominios.dados}
      />
    </>
  );
}

async function SecaoPresencaAba({ supabase, periodo, escopo }: any) {
  const presenca = await comFalha(buscarPresenca(supabase, periodo, escopo), []);
  return (
    <>
      {presenca.erro && <AvisoErro mensagem={presenca.erro} />}
      <SecaoPresenca linhas={presenca.dados} mostrarPessoa={!escopo.equipeId} />
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
      {ritmo.erro && <AvisoErro mensagem={ritmo.erro} />}
      <SecaoRitmo dados={ritmo.dados} />
      <SecaoDispersao linhas={dispersao.dados} />
    </>
  );
}

async function SecaoHorasAba({ supabase, periodo, escopo, admin }: any) {
  const horas = await comFalha(buscarHorasExtras(supabase, periodo, escopo), []);
  return (
    <>
      {horas.erro && <AvisoErro mensagem={horas.erro} />}
      <SecaoHorasExtras linhas={horas.dados} mostrarEquipe={!escopo.equipeId} admin={admin} />
    </>
  );
}

async function SecaoTempoReal({ supabase, orgId }: any) {
  const tempoReal = await comFalha(buscarTempoReal(supabase, orgId), []);
  return (
    <>
      {tempoReal.erro && <AvisoErro mensagem={tempoReal.erro} />}
      <TimelineAtividade inicial={tempoReal.dados} />
    </>
  );
}
