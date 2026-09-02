import { UserSquare2 } from "lucide-react";
import { redirect } from "next/navigation";
import { BarraFiltros } from "@/components/painel/barra-filtros";
import { BotaoExportar } from "@/components/painel/botao-exportar";
import { AvisoErro, CabecalhoPagina, EstadoVazio } from "@/components/painel/cabecalho";
import { GraficoBarras } from "@/components/painel/grafico-barras";
import { TabelaColaboradores } from "@/components/painel/tabela-colaboradores";
import { criarClienteServidor } from "@/lib/supabase/server";
import { carregarContexto } from "@/lib/sessao";
import { comFalha, primeiroErro } from "@/lib/carregar";
import { lerFiltros, paramsDoRecorte, type ParamsPagina } from "@/lib/filtros-url";
import { buscarEquipes, buscarRankingColaboradores } from "@/lib/consultas";

export const dynamic = "force-dynamic";

const TOPO_GRAFICO = 12;

export default async function PaginaPessoas({
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

  const [equipes, ranking] = await Promise.all([
    comFalha(buscarEquipes(supabase), []),
    comFalha(buscarRankingColaboradores(supabase, periodo, escopo.equipeId), []),
  ]);

  const erro = primeiroErro(equipes, ranking);
  const pessoas = ranking.dados;

  // Só quem teve registro entra no gráfico — linha zerada polui a comparação.
  const comAtividade = pessoas.filter((p) => p.minutosAtivos > 0).slice(0, TOPO_GRAFICO);

  return (
    <div className="space-y-5">
      <CabecalhoPagina
        titulo="Pessoas"
        descricao={`${pessoas.length} ${pessoas.length === 1 ? "colaborador" : "colaboradores"} · ${periodo.rotulo}`}
        icone={<UserSquare2 className="h-5 w-5 text-cyan-400" />}
        acoes={
          <BotaoExportar
            periodo={periodo}
            escopo={escopo}
            tipos={["colaboradores", "diario"]}
          />
        }
      />

      <BarraFiltros
        periodo={periodo}
        escopo={escopo}
        fuso={contexto.empresa.fuso}
        equipes={equipes.dados}
        campos={["equipe"]}
        travarEquipe={!!contexto.equipeEscopo}
      />

      {erro && <AvisoErro mensagem={erro} />}

      {pessoas.length === 0 ? (
        <EstadoVazio
          titulo="Nenhum colaborador ainda"
          descricao="Os colaboradores são criados automaticamente na primeira sincronização de cada estação. Depois disso, dê nome e equipe a cada um em Administração."
        />
      ) : (
        <>
          {comAtividade.length > 1 && (
            <GraficoBarras
              titulo={`Top ${comAtividade.length} por tempo ativo`}
              subtitulo="composição do tempo no período"
              dados={comAtividade.map((p) => ({
                id: p.colaboradorId,
                nome: p.colaborador,
                produtivo: p.minutosProdutivos,
                neutro: p.minutosNeutros,
                improdutivo: p.minutosImprodutivos,
                indice: p.indice,
              }))}
            />
          )}

          <TabelaColaboradores
            linhas={pessoas}
            recorte={recorte}
            mostrarEquipe={!escopo.equipeId}
          />
        </>
      )}
    </div>
  );
}
