import { ScrollText } from "lucide-react";
import { redirect } from "next/navigation";
import { BarraFiltros } from "@/components/painel/barra-filtros";
import { AvisoErro, CabecalhoPagina } from "@/components/painel/cabecalho";
import { TabelaRegistros } from "@/components/painel/tabela-registros";
import { Badge } from "@/components/ui/badge";
import { criarClienteServidor } from "@/lib/supabase/server";
import { carregarContexto } from "@/lib/sessao";
import { comFalha, primeiroErro } from "@/lib/carregar";
import { lerFiltros, orgEfetiva, type ParamsPagina } from "@/lib/filtros-url";
import {
  buscarColaboradores,
  buscarDispositivos,
  buscarEquipes,
  buscarRegistros,
} from "@/lib/consultas";
import type { PaginaRegistros } from "@/lib/consultas";

export const dynamic = "force-dynamic";

const POR_PAGINA = 100;

function texto(params: ParamsPagina, chave: string): string | null {
  const v = params[chave];
  const valor = Array.isArray(v) ? v[0] : v;
  return valor && valor !== "" ? valor : null;
}

export default async function PaginaRegistros({
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

  const estado = texto(params, "estado");
  const busca = texto(params, "busca");
  const pagina = Math.max(1, Number(texto(params, "pagina") ?? 1) || 1);

  const [equipes, colaboradores, dispositivos, registros] = await Promise.all([
    comFalha(buscarEquipes(supabase, org), []),
    comFalha(buscarColaboradores(supabase, null, org), []),
    comFalha(buscarDispositivos(supabase, org), []),
    comFalha(
      buscarRegistros(supabase, periodo, escopo, {
        estado,
        busca,
        limite: POR_PAGINA,
        pagina,
      }),
      { linhas: [], total: 0 } as PaginaRegistros,
    ),
  ]);

  const erro = primeiroErro(equipes, colaboradores, dispositivos, registros);

  return (
    <div className="space-y-5">
      <CabecalhoPagina
        titulo="Registros"
        descricao={`Atividade minuto a minuto · ${periodo.rotulo}`}
        icone={<ScrollText className="h-5 w-5 text-cyan-400" />}
        acoes={
          <Badge variante="neutro">retenção de {contexto.empresa.retencaoDias} dias</Badge>
        }
      />

      <BarraFiltros
        periodo={periodo}
        escopo={escopo}
        fuso={contexto.empresa.fuso}
        equipes={equipes.dados}
        colaboradores={colaboradores.dados}
        dispositivos={dispositivos.dados}
        campos={["equipe", "colaborador", "dispositivo"]}
        travarEquipe={!!contexto.equipeEscopo}
      />

      {erro && <AvisoErro mensagem={erro} />}

      <TabelaRegistros
        linhas={registros.dados.linhas}
        total={registros.dados.total}
        pagina={pagina}
        porPagina={POR_PAGINA}
        fuso={contexto.empresa.fuso}
        estado={estado}
        busca={busca}
      />

      <p className="text-xs leading-relaxed text-slate-600">
        Cada linha é um minuto de atividade enviado pelo agente. O painel guarda essa
        granularidade por {contexto.empresa.retencaoDias} dias — depois disso permanece o
        consolidado, que não expira. Nenhum conteúdo digitado é registrado: o que aparece é a
        contagem de teclas e cliques, o aplicativo em primeiro plano e o título da janela já
        higienizado.
      </p>
    </div>
  );
}
