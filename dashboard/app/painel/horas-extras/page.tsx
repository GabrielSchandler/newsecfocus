import { AlarmClockCheck } from "lucide-react";
import { redirect } from "next/navigation";
import { BarraFiltros } from "@/components/painel/barra-filtros";
import { AvisoErro, CabecalhoPagina } from "@/components/painel/cabecalho";
import { SecaoHorasExtras } from "@/components/painel/secao-horas-extras";
import { criarClienteServidor } from "@/lib/supabase/server";
import { carregarContexto, podeAdministrar } from "@/lib/sessao";
import { comFalha, primeiroErro } from "@/lib/carregar";
import { lerFiltros, type ParamsPagina } from "@/lib/filtros-url";
import { buscarEquipes, buscarHorasExtras } from "@/lib/consultas";

export const dynamic = "force-dynamic";

export default async function PaginaHorasExtras({
  searchParams,
}: {
  searchParams: Promise<ParamsPagina>;
}) {
  const params = await searchParams;
  const supabase = await criarClienteServidor();
  const contexto = await carregarContexto(supabase);

  if (!contexto) redirect("/entrar");

  const { periodo, escopo } = lerFiltros(params, contexto);

  const [equipes, horasExtras] = await Promise.all([
    comFalha(buscarEquipes(supabase, escopo.orgId), []),
    comFalha(buscarHorasExtras(supabase, periodo, escopo), []),
  ]);

  const erro = primeiroErro(equipes, horasExtras);

  return (
    <div className="space-y-5">
      <CabecalhoPagina
        titulo="Horas extras"
        descricao={`Atividade fora da janela de expediente esperada · ${periodo.rotulo}`}
        icone={<AlarmClockCheck className="h-5 w-5 text-cyan-400" />}
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

      <SecaoHorasExtras
        linhas={horasExtras.dados}
        mostrarEquipe={!escopo.equipeId}
        admin={podeAdministrar(contexto)}
      />
    </div>
  );
}
