import { Users } from "lucide-react";
import { redirect } from "next/navigation";
import { BarraFiltros } from "@/components/painel/barra-filtros";
import { BotaoExportar } from "@/components/painel/botao-exportar";
import { AvisoErro, CabecalhoPagina, EstadoVazio } from "@/components/painel/cabecalho";
import { GraficoBarras } from "@/components/painel/grafico-barras";
import { TabelaEquipes } from "@/components/painel/tabela-equipes";
import { Badge } from "@/components/ui/badge";
import { criarClienteServidor } from "@/lib/supabase/server";
import { carregarContexto } from "@/lib/sessao";
import { comFalha } from "@/lib/carregar";
import { lerFiltros, paramsDoRecorte, type ParamsPagina } from "@/lib/filtros-url";
import { buscarRankingEquipes } from "@/lib/consultas";

export const dynamic = "force-dynamic";

export default async function PaginaEquipes({
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

  const ranking = await comFalha(buscarRankingEquipes(supabase, periodo), []);
  const equipes = ranking.dados;

  return (
    <div className="space-y-5">
      <CabecalhoPagina
        titulo="Equipes"
        descricao={`${equipes.length} ${equipes.length === 1 ? "equipe" : "equipes"} · ${periodo.rotulo}`}
        icone={<Users className="h-5 w-5 text-cyan-400" />}
        acoes={
          <BotaoExportar
            periodo={periodo}
            escopo={escopo}
            tipos={["equipes", "colaboradores"]}
          />
        }
      />

      <BarraFiltros periodo={periodo} escopo={escopo} fuso={contexto.empresa.fuso} campos={[]} />

      {ranking.erro && <AvisoErro mensagem={ranking.erro} />}

      {equipes.length === 0 ? (
        <EstadoVazio
          titulo="Nenhuma equipe cadastrada"
          descricao="Crie as equipes em Administração e vincule os colaboradores. Sem equipe, o painel só consegue comparar pessoas individualmente."
        />
      ) : (
        <>
          <GraficoBarras
            titulo="Comparativo entre equipes"
            subtitulo="tempo ativo por categoria no período"
            dados={equipes.map((e) => ({
              id: e.equipeId,
              nome: e.equipe,
              produtivo: e.minutosProdutivos,
              neutro: e.minutosNeutros,
              improdutivo: e.minutosImprodutivos,
              indice: e.indice,
            }))}
          />

          <TabelaEquipes linhas={equipes} recorte={recorte} />

          <p className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
            <Badge variante="neutro">como ler</Badge>
            Aderência compara o tempo ativo com a jornada esperada das pessoas da equipe.
            Índice é o tempo produtivo sobre o tempo classificado — aplicativos sem categoria
            não entram na conta.
          </p>
        </>
      )}
    </div>
  );
}
