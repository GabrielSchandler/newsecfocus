import { Users } from "lucide-react";
import { redirect } from "next/navigation";
import { BarraFiltros } from "@/components/painel/barra-filtros";
import { BotaoExportar } from "@/components/painel/botao-exportar";
import { AvisoErro, CabecalhoPagina, EstadoVazio } from "@/components/painel/cabecalho";
import { ResumoExpediente } from "@/components/painel/resumo-expediente";
import { TabelaEquipesMedia } from "@/components/painel/tabela-equipes-media";
import { Badge } from "@/components/ui/badge";
import { criarClienteServidor } from "@/lib/supabase/server";
import { carregarContexto } from "@/lib/sessao";
import { comFalha } from "@/lib/carregar";
import { lerFiltros, orgEfetiva, paramsDoRecorte, type ParamsPagina } from "@/lib/filtros-url";
import { buscarProdutividade } from "@/lib/consultas";
import {
  agregarProdutividade,
  agruparPorEquipe,
  janelaAtual,
  janelaComparativo,
} from "@/lib/produtividade";

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
  const fuso = contexto.empresa.fuso;
  const org = orgEfetiva(contexto, escopo);

  const janela = janelaAtual(periodo);
  const comparativo = await comFalha(janelaComparativo(supabase, periodo, fuso, org), null);

  const [produtividade, anterior] = await Promise.all([
    comFalha(buscarProdutividade(supabase, janela, escopo), []),
    comparativo.dados
      ? comFalha(buscarProdutividade(supabase, comparativo.dados, escopo), [])
      : Promise.resolve({ dados: [], erro: null }),
  ]);

  const grupos = agruparPorEquipe(produtividade.dados);
  const resumo = agregarProdutividade(produtividade.dados);
  const resumoAnterior = comparativo.dados ? agregarProdutividade(anterior.dados) : null;

  return (
    <div className="space-y-5">
      <CabecalhoPagina
        titulo="Equipes"
        descricao={`${grupos.length} ${grupos.length === 1 ? "equipe" : "equipes"} · ${periodo.rotulo}`}
        icone={<Users className="h-5 w-5 text-cyan-400" />}
        acoes={
          <BotaoExportar
            periodo={periodo}
            escopo={escopo}
            tipos={["equipes", "colaboradores"]}
          />
        }
      />

      <BarraFiltros periodo={periodo} escopo={escopo} fuso={fuso} campos={[]} />

      {produtividade.erro && <AvisoErro mensagem={produtividade.erro} />}

      {/* O número da empresa inteira, para dar régua ao que vem abaixo. */}
      <ResumoExpediente
        resumo={resumo}
        anterior={resumoAnterior}
        rotuloComparacao={comparativo.dados?.rotulo ?? null}
      />

      {grupos.length === 0 ? (
        <EstadoVazio
          titulo="Nenhuma equipe com expediente"
          descricao="Crie as equipes em Administração e vincule os colaboradores. Sem equipe, o painel só consegue comparar pessoas individualmente."
        />
      ) : (
        <>
          <TabelaEquipesMedia grupos={grupos} recorte={recorte} />

          <p className="flex flex-wrap items-center gap-2 text-xs leading-relaxed text-slate-600">
            <Badge variante="neutro">como ler</Badge>
            <span className="min-w-0 flex-1">
              Cada equipe entra pela <strong>média das suas pessoas</strong>, e cada pessoa pesa
              igual — por isso uma equipe de 3 é comparável com uma de 10. O índice é o tempo
              produtivo sobre o <strong>expediente</strong>: máquina desligada, tela bloqueada e
              ociosidade puxam para baixo. Clique numa equipe para ver os mesmos indicadores
              filtrados nela.
            </span>
          </p>
        </>
      )}
    </div>
  );
}
