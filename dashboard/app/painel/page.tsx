import { LayoutDashboard } from "lucide-react";
import { redirect } from "next/navigation";
import { BarraFiltros } from "@/components/painel/barra-filtros";
import { BentoKpis } from "@/components/painel/bento-kpis";
import { BotaoExportar } from "@/components/painel/botao-exportar";
import { CabecalhoPagina, AvisoErro } from "@/components/painel/cabecalho";
import { GraficoArea } from "@/components/painel/grafico-area";
import { GraficoBarras } from "@/components/painel/grafico-barras";
import { GraficoDonut } from "@/components/painel/grafico-donut";
import { TimelineAtividade } from "@/components/painel/timeline-atividade";
import { criarClienteServidor } from "@/lib/supabase/server";
import { carregarContexto } from "@/lib/sessao";
import { comFalha, primeiroErro } from "@/lib/carregar";
import { lerFiltros, rotuloComparacao, type ParamsPagina } from "@/lib/filtros-url";
import {
  KPIS_VAZIOS,
  buscarColaboradores,
  buscarDispositivos,
  buscarDistribuicao,
  buscarEquipes,
  buscarKpisComparados,
  buscarRankingEquipes,
  buscarSerie,
  buscarTempoReal,
} from "@/lib/consultas";

// Telemetria muda a cada minuto: nada de cache de página.
export const dynamic = "force-dynamic";

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

  const [equipes, colaboradores, dispositivos] = await Promise.all([
    comFalha(buscarEquipes(supabase), []),
    comFalha(buscarColaboradores(supabase), []),
    comFalha(buscarDispositivos(supabase), []),
  ]);

  const [kpis, serie, distribuicao, rankingEquipes, tempoReal] = await Promise.all([
    comFalha(buscarKpisComparados(supabase, periodo, escopo, fuso), {
      atual: KPIS_VAZIOS,
      anterior: KPIS_VAZIOS,
      variacao: {
        minutosAtivos: null,
        indice: null,
        minutosProdutivos: null,
        interacoes: null,
      },
    }),
    comFalha(buscarSerie(supabase, periodo, escopo, fuso), []),
    comFalha(buscarDistribuicao(supabase, periodo, escopo, 8), []),
    comFalha(buscarRankingEquipes(supabase, periodo), []),
    comFalha(buscarTempoReal(supabase), []),
  ]);

  const erro = primeiroErro(kpis, serie, distribuicao, rankingEquipes, tempoReal);

  // Comparar equipes só faz sentido quando o recorte não é de uma equipe só.
  const mostrarComparativo =
    !escopo.equipeId && !escopo.colaboradorId && rankingEquipes.dados.length > 1;

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

      {erro && <AvisoErro mensagem={erro} />}

      <BentoKpis dados={kpis.dados} rotuloComparacao={rotuloComparacao(periodo)} />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-5">
        <div className="min-w-0 xl:col-span-3">
          <GraficoArea dados={serie.dados} />
        </div>
        <div className="min-w-0 xl:col-span-2">
          <GraficoDonut dados={distribuicao.dados} />
        </div>
      </div>

      {mostrarComparativo && (
        <GraficoBarras
          titulo="Comparativo entre equipes"
          subtitulo="tempo ativo por categoria no período"
          dados={rankingEquipes.dados.map((e) => ({
            id: e.equipeId,
            nome: e.equipe,
            produtivo: e.minutosProdutivos,
            neutro: e.minutosNeutros,
            improdutivo: e.minutosImprodutivos,
            indice: e.indice,
          }))}
        />
      )}

      <TimelineAtividade inicial={tempoReal.dados} />
    </div>
  );
}
