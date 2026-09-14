import { TrendingUp, TrendingDown } from "lucide-react";
import { formatarPorcentagem } from "@/lib/formato";
import type { LinhaEvolucao } from "@/lib/tipos";

/**
 * Evolução vs. período anterior: quem subiu e quem caiu de produtividade
 * (variação do índice em pontos percentuais). Só entra quem tem base nos dois
 * períodos — sem período anterior, não há o que comparar, e a seção diz isso.
 */

const LIMIAR = 0.05; // abaixo disso é ruído, conta como estável.

export function SecaoEvolucao({ linhas }: { linhas: LinhaEvolucao[] }) {
  const comBase = linhas
    .filter((l) => l.indiceAtual !== null && l.indiceAnterior !== null)
    .map((l) => ({ ...l, delta: (l.indiceAtual as number) - (l.indiceAnterior as number) }));

  const subiram = comBase.filter((l) => l.delta > LIMIAR).sort((a, b) => b.delta - a.delta).slice(0, 6);
  const cairam = comBase.filter((l) => l.delta < -LIMIAR).sort((a, b) => a.delta - b.delta).slice(0, 6);

  return (
    <section className="rounded-xl2 border border-borda vidro p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-medium text-slate-200">Evolução vs. período anterior</h3>
        <p className="text-xs text-slate-500">variação do índice de produtividade</p>
      </div>

      {comBase.length === 0 ? (
        <p className="mt-4 rounded-lg border border-dashed border-borda py-6 text-center text-xs text-slate-500">
          Ainda não há um período anterior com dados para comparar. Assim que houver histórico, esta
          seção mostra quem subiu e quem caiu.
        </p>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Coluna titulo="Subiram" cor="text-emerald-400" Icone={TrendingUp} linhas={subiram} />
          <Coluna titulo="Caíram" cor="text-rose-400" Icone={TrendingDown} linhas={cairam} />
        </div>
      )}
    </section>
  );
}

function Coluna({
  titulo,
  cor,
  Icone,
  linhas,
}: {
  titulo: string;
  cor: string;
  Icone: typeof TrendingUp;
  linhas: (LinhaEvolucao & { delta: number })[];
}) {
  return (
    <div>
      <p className={`flex items-center gap-1.5 text-xs font-medium ${cor}`}>
        <Icone className="h-3.5 w-3.5" />
        {titulo}
      </p>
      {linhas.length === 0 ? (
        <p className="mt-2 text-xs text-slate-600">ninguém no período</p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {linhas.map((l) => (
            <li key={l.colaboradorId} className="flex items-center justify-between gap-3 text-sm">
              <span className="min-w-0 truncate text-slate-200">{l.colaborador}</span>
              <span className="flex shrink-0 items-center gap-2 tabular-nums">
                <span className="text-slate-400">{formatarPorcentagem(l.indiceAtual, 0)}</span>
                <span className={cor}>
                  {l.delta > 0 ? "+" : "−"}
                  {Math.abs(l.delta).toFixed(1).replace(".", ",")} p.p.
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
