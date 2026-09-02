import { AppWindow } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BarraFiltros } from "@/components/painel/barra-filtros";
import { BotaoExportar } from "@/components/painel/botao-exportar";
import { AvisoErro, CabecalhoPagina, EstadoVazio } from "@/components/painel/cabecalho";
import { GraficoDonut } from "@/components/painel/grafico-donut";
import { TabelaAplicativos } from "@/components/painel/tabela-aplicativos";
import { criarClienteServidor } from "@/lib/supabase/server";
import { carregarContexto, podeAdministrar } from "@/lib/sessao";
import { comFalha, primeiroErro } from "@/lib/carregar";
import { lerFiltros, type ParamsPagina } from "@/lib/filtros-url";
import { buscarColaboradores, buscarDistribuicao, buscarEquipes } from "@/lib/consultas";
import { ROTULOS_TIPO, formatarHoras, formatarPorcentagem } from "@/lib/formato";

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

  const [equipes, colaboradores, distribuicao] = await Promise.all([
    comFalha(buscarEquipes(supabase), []),
    comFalha(buscarColaboradores(supabase), []),
    comFalha(buscarDistribuicao(supabase, periodo, escopo, 60), []),
  ]);

  const erro = primeiroErro(equipes, colaboradores, distribuicao);
  const apps = distribuicao.dados;

  const total = apps.reduce((s, a) => s + a.minutos, 0);
  const semCategoria = apps.filter((a) => !a.tipo);
  const minutosSemCategoria = semCategoria.reduce((s, a) => s + a.minutos, 0);

  return (
    <div className="space-y-5">
      <CabecalhoPagina
        titulo="Aplicativos e sites"
        descricao={`${apps.length} ferramentas · ${periodo.rotulo}`}
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

      {apps.length === 0 ? (
        <EstadoVazio
          titulo="Nenhum uso registrado"
          descricao="Assim que os agentes sincronizarem, o tempo por aplicativo e site aparece aqui."
        />
      ) : (
        <>
          {minutosSemCategoria > 0 && podeAdministrar(contexto) && (
            <p className="rounded-xl2 border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-xs leading-relaxed text-amber-200/90">
              {semCategoria.length}{" "}
              {semCategoria.length === 1 ? "ferramenta representa" : "ferramentas representam"}{" "}
              {formatarHoras(minutosSemCategoria)} sem categoria — esse tempo não entra no
              índice de produtividade.{" "}
              <Link
                href="/painel/administracao?aba=classificacao"
                className="font-medium underline hover:text-amber-100"
              >
                Classificar agora
              </Link>
              .
            </p>
          )}

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            <GraficoDonut dados={apps.slice(0, 8)} titulo="Top 8 do período" />

            <div className="rounded-xl2 border border-borda vidro p-5">
              <h3 className="text-sm font-medium text-slate-200">Por categoria</h3>
              <p className="text-xs text-slate-500">tempo agregado no período</p>
              <dl className="mt-4 space-y-3">
                {(["PRODUCTIVE", "NEUTRAL", "UNPRODUCTIVE", "SEM"] as const).map((tipo) => {
                  const minutos = apps
                    .filter((a) => (tipo === "SEM" ? !a.tipo : a.tipo === tipo))
                    .reduce((s, a) => s + a.minutos, 0);
                  const pct = total > 0 ? (minutos / total) * 100 : 0;
                  return (
                    <div key={tipo}>
                      <div className="flex items-center justify-between text-sm">
                        <dt className="text-slate-300">{ROTULOS_TIPO[tipo]}</dt>
                        <dd className="tabular-nums text-slate-400">
                          {formatarHoras(minutos)}
                          <span className="ml-2 text-xs text-slate-600">
                            {formatarPorcentagem(pct, 0)}
                          </span>
                        </dd>
                      </div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-800">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${pct}%`,
                            background:
                              tipo === "PRODUCTIVE"
                                ? "#22d3ee"
                                : tipo === "NEUTRAL"
                                  ? "#a78bfa"
                                  : tipo === "UNPRODUCTIVE"
                                    ? "#fb7185"
                                    : "#475569",
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </dl>
            </div>
          </div>

          <TabelaAplicativos linhas={apps} />
        </>
      )}
    </div>
  );
}
