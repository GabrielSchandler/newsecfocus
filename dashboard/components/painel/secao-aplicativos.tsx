import Link from "next/link";
import { GraficoDonut } from "./grafico-donut";
import { TabelaAplicativos } from "./tabela-aplicativos";
import { EstadoVazio } from "./cabecalho";
import { CORES_TIPO, ROTULOS_TIPO, formatarHoras, formatarPorcentagem } from "@/lib/formato";
import type { Categoria, FatiaDistribuicao } from "@/lib/tipos";

/**
 * Bloco "Aplicativos e sites" reaproveitável: rosca do topo, quebra por
 * categoria e tabela completa. Vive num componente só para ser usado tanto na
 * aba Aplicativos da Visão geral / Equipe / Pessoa quanto onde mais precisar,
 * sempre idêntico — parte de consolidar o produto em menos telas.
 */
export function SecaoAplicativos({
  apps,
  categorias,
  admin,
}: {
  apps: FatiaDistribuicao[];
  categorias: Categoria[];
  admin: boolean;
}) {
  if (apps.length === 0) {
    return (
      <EstadoVazio
        titulo="Nenhum uso registrado"
        descricao="Assim que os agentes sincronizarem, o tempo por aplicativo e site aparece aqui."
      />
    );
  }

  const total = apps.reduce((s, a) => s + a.minutos, 0);
  const semCategoria = apps.filter((a) => !a.tipo);
  const minutosSemCategoria = semCategoria.reduce((s, a) => s + a.minutos, 0);

  return (
    <div className="space-y-5">
      {minutosSemCategoria > 0 && admin && (
        <p className="rounded-xl2 border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-xs leading-relaxed text-amber-200/90">
          {semCategoria.length}{" "}
          {semCategoria.length === 1 ? "ferramenta representa" : "ferramentas representam"}{" "}
          {formatarHoras(minutosSemCategoria)} sem categoria — esse tempo não entra no índice de
          produtividade.{" "}
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
        <GraficoDonut
          dados={apps.slice(0, 8)}
          titulo="Top 8 do período"
          categorias={categorias}
          podeClassificar={admin}
        />

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
                      style={{ width: `${pct}%`, background: CORES_TIPO[tipo] }}
                    />
                  </div>
                </div>
              );
            })}
          </dl>
        </div>
      </div>

      <TabelaAplicativos linhas={apps} />
    </div>
  );
}
