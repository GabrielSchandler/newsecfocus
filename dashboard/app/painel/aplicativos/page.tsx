import { AppWindow } from "lucide-react";
import { redirect } from "next/navigation";
import { BarraFiltros } from "@/components/painel/barra-filtros";
import { BotaoExportar } from "@/components/painel/botao-exportar";
import { AvisoErro, CabecalhoPagina } from "@/components/painel/cabecalho";
import { SecaoAplicativos } from "@/components/painel/secao-aplicativos";
import { criarClienteServidor } from "@/lib/supabase/server";
import { carregarContexto, podeAdministrar } from "@/lib/sessao";
import { comFalha, primeiroErro } from "@/lib/carregar";
import { lerFiltros, orgEfetiva, type ParamsPagina } from "@/lib/filtros-url";
import {
  buscarCategorias,
  buscarColaboradores,
  buscarDistribuicao,
  buscarEquipes,
} from "@/lib/consultas";

export const dynamic = "force-dynamic";

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
  const org = orgEfetiva(contexto, escopo);
  const admin = podeAdministrar(contexto);

  const [equipes, colaboradores, distribuicao, categorias] = await Promise.all([
    comFalha(buscarEquipes(supabase, org), []),
    comFalha(buscarColaboradores(supabase, null, org), []),
    comFalha(buscarDistribuicao(supabase, periodo, escopo, 60), []),
    admin
      ? comFalha(buscarCategorias(supabase, org), [])
      : Promise.resolve({ dados: [], erro: null }),
  ]);

  const erro = primeiroErro(equipes, colaboradores, distribuicao);

  return (
    <div className="space-y-5">
      <CabecalhoPagina
        titulo="Aplicativos e sites"
        descricao={`${distribuicao.dados.length} ferramentas · ${periodo.rotulo}`}
        icone={<AppWindow className="h-5 w-5 text-cyan-400" />}
        acoes={<BotaoExportar periodo={periodo} escopo={escopo} tipos={["aplicativos"]} />}
      />

      <BarraFiltros
        periodo={periodo}
        escopo={escopo}
        fuso={contexto.empresa.fuso}
        equipes={equipes.dados}
        colaboradores={colaboradores.dados}
        travarEquipe={!!contexto.equipeEscopo}
      />

      {erro && <AvisoErro mensagem={erro} />}

      <SecaoAplicativos apps={distribuicao.dados} categorias={categorias.dados} admin={admin} />
    </div>
  );
}
