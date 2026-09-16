import { AppWindow } from "lucide-react";
import { redirect } from "next/navigation";
import { BarraFiltros } from "@/components/painel/barra-filtros";
import { AvisoErro, CabecalhoPagina } from "@/components/painel/cabecalho";
import { UsoAplicativo } from "@/components/painel/uso-aplicativo";
import { Badge } from "@/components/ui/badge";
import { criarClienteServidor } from "@/lib/supabase/server";
import { carregarContexto } from "@/lib/sessao";
import { comFalha, primeiroErro } from "@/lib/carregar";
import { lerFiltros, orgEfetiva, paramsDoRecorte, type ParamsPagina } from "@/lib/filtros-url";
import { buscarAppPessoas, buscarAppSerie, buscarColaboradores, buscarEquipes } from "@/lib/consultas";
import { formatarHoras } from "@/lib/formato";

export const dynamic = "force-dynamic";

export default async function PaginaAplicativo({
  params,
  searchParams,
}: {
  params: Promise<{ alvo: string }>;
  searchParams: Promise<ParamsPagina>;
}) {
  const { alvo: alvoBruto } = await params;
  const alvo = decodeURIComponent(alvoBruto);
  const busca = await searchParams;

  const supabase = await criarClienteServidor();
  const contexto = await carregarContexto(supabase);
  if (!contexto) redirect("/entrar");

  const { periodo, escopo } = lerFiltros(busca, contexto);
  const recorte = paramsDoRecorte(busca);
  const fuso = contexto.empresa.fuso;
  const org = orgEfetiva(contexto, escopo);

  const [equipes, colaboradores, pessoas, serie] = await Promise.all([
    comFalha(buscarEquipes(supabase, org), []),
    comFalha(buscarColaboradores(supabase, null, org), []),
    comFalha(buscarAppPessoas(supabase, periodo, alvo, escopo), []),
    comFalha(buscarAppSerie(supabase, periodo, alvo, escopo), []),
  ]);

  const erro = primeiroErro(pessoas, serie);
  const total = pessoas.dados.reduce((s, p) => s + p.minutos, 0);
  const dias = pessoas.dados.reduce((m, p) => Math.max(m, p.dias), 0);

  return (
    <div className="space-y-5">
      <CabecalhoPagina
        titulo={alvo}
        descricao={`${formatarHoras(total)} · ${pessoas.dados.length} ${
          pessoas.dados.length === 1 ? "pessoa" : "pessoas"
        } · ${periodo.rotulo}`}
        icone={<AppWindow className="h-5 w-5 text-cyan-400" />}
        voltarPara={{ href: `/painel?visao=aplicativos&${recorte.replace("?", "")}`, rotulo: "Aplicativos" }}
      />

      <BarraFiltros
        periodo={periodo}
        escopo={escopo}
        fuso={fuso}
        equipes={equipes.dados}
        colaboradores={colaboradores.dados}
        travarEquipe={!!contexto.equipeEscopo}
      />

      {erro && <AvisoErro mensagem={erro} />}

      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <Badge variante="neutro">no período</Badge>
        {formatarHoras(total)} de uso · {pessoas.dados.length}{" "}
        {pessoas.dados.length === 1 ? "pessoa" : "pessoas"} · presente em até {dias}{" "}
        {dias === 1 ? "dia" : "dias"}
      </div>

      <UsoAplicativo
        pessoas={pessoas.dados}
        serie={serie.dados}
        porHora={periodo.preset === "dia"}
        fuso={fuso}
        recorte={recorte}
      />
    </div>
  );
}
