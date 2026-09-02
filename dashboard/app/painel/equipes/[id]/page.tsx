import { Users } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { BarraFiltros } from "@/components/painel/barra-filtros";
import { BentoKpis } from "@/components/painel/bento-kpis";
import { BotaoExportar } from "@/components/painel/botao-exportar";
import { AvisoErro, CabecalhoPagina } from "@/components/painel/cabecalho";
import { GraficoArea } from "@/components/painel/grafico-area";
import { GraficoDonut } from "@/components/painel/grafico-donut";
import { TabelaColaboradores } from "@/components/painel/tabela-colaboradores";
import { criarClienteServidor } from "@/lib/supabase/server";
import { carregarContexto } from "@/lib/sessao";
import { comFalha, primeiroErro } from "@/lib/carregar";
import { lerFiltros, paramsDoRecorte, rotuloComparacao, type ParamsPagina } from "@/lib/filtros-url";
import {
  KPIS_VAZIOS,
  buscarDistribuicao,
  buscarKpisComparados,
  buscarRankingColaboradores,
  buscarSerie,
} from "@/lib/consultas";
import type { Escopo } from "@/lib/tipos";

export const dynamic = "force-dynamic";

export default async function PaginaDetalheEquipe({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<ParamsPagina>;
}) {
  const { id } = await params;
  const busca = await searchParams;
  const supabase = await criarClienteServidor();
  const contexto = await carregarContexto(supabase);

  if (!contexto) redirect("/entrar");

  const { data: equipe } = await supabase
    .from("teams")
    .select("id, nome, descricao, cor")
    .eq("id", id)
    .maybeSingle();

  if (!equipe) notFound();

  const { periodo } = lerFiltros(busca, contexto);
  const fuso = contexto.empresa.fuso;
  const recorte = paramsDoRecorte(busca);

  // O escopo desta tela é a equipe da URL, não o que estiver na query string.
  const escopo: Escopo = { equipeId: id, colaboradorId: null, dispositivoId: null };

  const [kpis, serie, distribuicao, pessoas] = await Promise.all([
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
    comFalha(buscarRankingColaboradores(supabase, periodo, id), []),
  ]);

  const erro = primeiroErro(kpis, serie, distribuicao, pessoas);

  return (
    <div className="space-y-5">
      <CabecalhoPagina
        titulo={equipe.nome}
        descricao={equipe.descricao ?? `${pessoas.dados.length} pessoas · ${periodo.rotulo}`}
        icone={
          <span
            className="h-3 w-3 rounded-full"
            style={{ background: equipe.cor ?? "#22d3ee" }}
          />
        }
        voltarPara={{ href: `/painel/equipes${recorte}`, rotulo: "Equipes" }}
        acoes={
          <BotaoExportar
            periodo={periodo}
            escopo={escopo}
            tipos={["colaboradores", "diario", "aplicativos"]}
          />
        }
      />

      <BarraFiltros periodo={periodo} escopo={escopo} fuso={fuso} campos={[]} />

      {erro && <AvisoErro mensagem={erro} />}

      <BentoKpis dados={kpis.dados} rotuloComparacao={rotuloComparacao(periodo)} />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-5">
        <div className="min-w-0 xl:col-span-3">
          <GraficoArea dados={serie.dados} titulo="Produtividade da equipe" />
        </div>
        <div className="min-w-0 xl:col-span-2">
          <GraficoDonut dados={distribuicao.dados} titulo="Ferramentas da equipe" />
        </div>
      </div>

      <section className="space-y-3">
        <h3 className="flex items-center gap-2 text-sm font-medium text-slate-200">
          <Users className="h-4 w-4 text-cyan-400" />
          Pessoas da equipe
        </h3>
        <TabelaColaboradores linhas={pessoas.dados} recorte={recorte} mostrarEquipe={false} />
      </section>
    </div>
  );
}
