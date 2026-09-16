import { redirect } from "next/navigation";
import { ScrollText } from "lucide-react";
import { AvisoErro, CabecalhoPagina } from "@/components/painel/cabecalho";
import { FiltrosRegistros, RegistrosComDetalhe } from "@/components/painel/registros";
import { Paginacao, Secao } from "@/components/painel/kit";
import { Card } from "@/components/ui/card";
import { criarClienteServidor } from "@/lib/supabase/server";
import { carregarContexto } from "@/lib/sessao";
import { comFalha, primeiroErro } from "@/lib/carregar";
import { lerFiltros, orgEfetiva, type ParamsPagina } from "@/lib/filtros-url";
import { buscarColaboradores, buscarDispositivos, buscarRegistros, type PaginaRegistros } from "@/lib/consultas";
import { diaNoFuso, instanteNoFuso } from "@/lib/periodos";
import type { Periodo } from "@/lib/tipos";

export const dynamic = "force-dynamic";

const POR_PAGINA = 25;

function texto(params: ParamsPagina, chave: string): string | null {
  const v = params[chave];
  const valor = Array.isArray(v) ? v[0] : v;
  return valor && valor !== "" ? valor : null;
}

/**
 * Registros de atividade: o minuto a minuto por trás dos números, um dia por
 * vez. Paginado no banco — um mês de uma empresa média passa de um milhão de
 * linhas. Só existe dentro da retenção do dado detalhado.
 */
export default async function PaginaRegistros({
  searchParams,
}: {
  searchParams: Promise<ParamsPagina>;
}) {
  const params = await searchParams;
  const supabase = await criarClienteServidor();
  const contexto = await carregarContexto(supabase);

  if (!contexto) redirect("/entrar");

  const { periodo: periodoUrl, escopo } = lerFiltros(params, contexto);
  const fuso = contexto.empresa.fuso;
  const org = orgEfetiva(contexto, escopo);

  const hoje = diaNoFuso(new Date(), fuso);
  const dataPedida = texto(params, "data");
  // Links antigos chegam com preset de período; os novos com ?data=.
  const usarPeriodo = !dataPedida && !!texto(params, "preset");
  const dia = dataPedida && /^\d{4}-\d{2}-\d{2}$/.test(dataPedida) ? dataPedida : hoje;
  const [a, m, d] = dia.split("-").map(Number);
  const periodo: Periodo = usarPeriodo
    ? periodoUrl
    : { ...periodoUrl, inicio: instanteNoFuso(fuso, a, m, d).toISOString(), fim: instanteNoFuso(fuso, a, m, d + 1).toISOString() };

  const estado = texto(params, "estado");
  const busca = texto(params, "busca");
  const pagina = Math.max(1, Number(texto(params, "pagina") ?? 1) || 1);

  const [colaboradores, dispositivos, registros] = await Promise.all([
    comFalha(buscarColaboradores(supabase, escopo.equipeId, org), []),
    comFalha(buscarDispositivos(supabase, org), []),
    comFalha(buscarRegistros(supabase, periodo, escopo, { estado, busca, limite: POR_PAGINA, pagina }), {
      linhas: [],
      total: 0,
    } as PaginaRegistros),
  ]);

  const hrefPagina = (p: number) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      const valor = Array.isArray(v) ? v[0] : v;
      if (valor) u.set(k, valor);
    }
    u.set("pagina", String(p));
    return `/painel/registros?${u.toString()}`;
  };

  const erro = primeiroErro(colaboradores, dispositivos, registros);

  return (
    <div className="space-y-4 sm:space-y-5">
      <CabecalhoPagina
        titulo="Registros de atividade"
        descricao="Veja as atividades minuto a minuto, com foco em processos e domínios."
        nota={`Dado detalhado guardado por ${contexto.empresa.retencaoDias} dias`}
      />

      <Card className="p-4 sm:p-5">
        <FiltrosRegistros colaboradores={colaboradores.dados} dispositivos={dispositivos.dados} dia={dia} hoje={hoje} />
      </Card>

      {erro && <AvisoErro mensagem={erro} />}

      <Secao icone={<ScrollText />} titulo={`Registros (${registros.dados.total.toLocaleString("pt-BR")})`} subtitulo={usarPeriodo ? periodo.rotulo : dia.split("-").reverse().join("/")}>
        <RegistrosComDetalhe linhas={registros.dados.linhas} fuso={fuso} colaboradorId={escopo.colaboradorId} />
        <Paginacao pagina={pagina} porPagina={POR_PAGINA} total={registros.dados.total} href={hrefPagina} rotuloItens="registros" />
        <p className="mt-3 text-xs leading-relaxed text-slate-500">
          Cada linha é um minuto enviado pelo agente de uma estação. Com duas estações da mesma pessoa, os dois
          minutos aparecem aqui; nos indicadores, o minuto conta uma vez só. Depois de {contexto.empresa.retencaoDias} dias
          permanece apenas o consolidado.
        </p>
      </Secao>
    </div>
  );
}
