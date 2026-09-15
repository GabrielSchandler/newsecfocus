import { UserSquare2 } from "lucide-react";
import { redirect } from "next/navigation";
import { BarraFiltros } from "@/components/painel/barra-filtros";
import { BotaoExportar } from "@/components/painel/botao-exportar";
import { AvisoErro, CabecalhoPagina, EstadoVazio } from "@/components/painel/cabecalho";
import { ResumoExpediente } from "@/components/painel/resumo-expediente";
import { TabelaPessoasProdutividade } from "@/components/painel/tabela-pessoas-produtividade";
import { criarClienteServidor } from "@/lib/supabase/server";
import { carregarContexto } from "@/lib/sessao";
import { comFalha } from "@/lib/carregar";
import { lerFiltros, orgEfetiva, paramsDoRecorte, type ParamsPagina } from "@/lib/filtros-url";
import { buscarEquipes, buscarProdutividade } from "@/lib/consultas";
import { agregarProdutividade, janelaAtual, janelaComparativo } from "@/lib/produtividade";

export const dynamic = "force-dynamic";

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
  const fuso = contexto.empresa.fuso;
  const org = orgEfetiva(contexto, escopo);

  const janela = janelaAtual(periodo);
  const comparativo = await comFalha(janelaComparativo(supabase, periodo, fuso, org), null);

  const [equipes, produtividade, anterior] = await Promise.all([
    comFalha(buscarEquipes(supabase, org), []),
    comFalha(buscarProdutividade(supabase, janela, escopo), []),
    comparativo.dados
      ? comFalha(buscarProdutividade(supabase, comparativo.dados, escopo), [])
      : Promise.resolve({ dados: [], erro: null }),
  ]);

  const pessoas = produtividade.dados;
  const resumo = agregarProdutividade(pessoas);
  const resumoAnterior = comparativo.dados ? agregarProdutividade(anterior.dados) : null;

  return (
    <div className="space-y-5">
      <CabecalhoPagina
        titulo="Pessoas"
        descricao={`${pessoas.length} ${pessoas.length === 1 ? "colaborador" : "colaboradores"} · ${periodo.rotulo}`}
        icone={<UserSquare2 className="h-5 w-5 text-cyan-400" />}
        acoes={
          <BotaoExportar periodo={periodo} escopo={escopo} tipos={["colaboradores", "diario"]} />
        }
      />

      <BarraFiltros
        periodo={periodo}
        escopo={escopo}
        fuso={fuso}
        equipes={equipes.dados}
        campos={["equipe"]}
        travarEquipe={!!contexto.equipeEscopo}
      />

      {produtividade.erro && <AvisoErro mensagem={produtividade.erro} />}

      {/* A média do recorte primeiro, para a planilha abaixo ter régua. */}
      <ResumoExpediente
        resumo={resumo}
        anterior={resumoAnterior}
        rotuloComparacao={comparativo.dados?.rotulo ?? null}
      />

      {pessoas.length === 0 ? (
        <EstadoVazio
          titulo="Nenhum colaborador com expediente"
          descricao="Cada pessoa aparece sozinha cerca de 2 minutos depois de o agente ser instalado na estação dela. Se ela já aparece mas não tem expediente, confira a escala em Administração › Expediente."
        />
      ) : (
        <TabelaPessoasProdutividade
          linhas={pessoas}
          recorte={recorte}
          mostrarEquipe={!escopo.equipeId}
        />
      )}
    </div>
  );
}
