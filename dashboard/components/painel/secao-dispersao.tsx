import { Shuffle } from "lucide-react";
import { formatarHoras } from "@/lib/formato";
import type { LinhaDispersao } from "@/lib/tipos";

/**
 * Dispersão: trocas de aplicativo por hora ativa. Quanto maior, mais a pessoa
 * pula entre janelas — pode ser multitarefa saudável ou falta de foco; o número
 * é um sinal, não um veredito. Por isso vem acompanhado do tempo ativo, que dá
 * o tamanho da amostra.
 */
export function SecaoDispersao({ linhas }: { linhas: LinhaDispersao[] }) {
  const max = linhas.reduce((m, l) => Math.max(m, l.trocasPorHora), 0);

  return (
    <section className="rounded-xl2 border border-borda vidro p-5">
      <div className="flex items-center gap-2">
        <Shuffle className="h-4 w-4 text-cyan-400" />
        <h3 className="text-sm font-medium text-slate-200">Dispersão (trocas de app por hora)</h3>
      </div>

      {linhas.length === 0 ? (
        <p className="mt-4 rounded-lg border border-dashed border-borda py-6 text-center text-xs text-slate-500">
          Sem amostra suficiente no período.
        </p>
      ) : (
        <ul className="mt-4 space-y-2">
          {linhas.slice(0, 10).map((l) => (
            <li key={l.colaboradorId} className="flex items-center gap-3">
              <span className="w-32 shrink-0 truncate text-sm text-slate-200">{l.colaborador}</span>
              <span className="h-2 flex-1 overflow-hidden rounded-full bg-slate-800">
                <span
                  className="block h-full rounded-full bg-gradient-to-r from-cyan-400 to-violet-400"
                  style={{ width: `${max > 0 ? (l.trocasPorHora / max) * 100 : 0}%` }}
                />
              </span>
              <span className="w-28 shrink-0 text-right text-xs tabular-nums text-slate-400">
                {l.trocasPorHora.toFixed(1).replace(".", ",")}/h
                <span className="ml-1 text-slate-600">· {formatarHoras(l.minutosAtivos)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
