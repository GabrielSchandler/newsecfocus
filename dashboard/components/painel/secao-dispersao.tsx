import { Shuffle } from "lucide-react";
import { formatarDuracao } from "@/lib/formato";
import { Secao } from "./kit";
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
    <Secao
      icone={<Shuffle />}
      titulo="Alternância de aplicativos"
      subtitulo="Trocas de janela por hora ativa · um sinal, não um veredito sobre foco"
    >
      {linhas.length === 0 ? (
        <p className="rounded-lg border border-dashed border-borda py-6 text-center text-xs text-slate-500">
          Sem amostra suficiente no período.
        </p>
      ) : (
        <ul className="space-y-2">
          {linhas.slice(0, 10).map((l) => (
            <li key={l.colaboradorId} className="flex items-center gap-3">
              <span className="w-32 shrink-0 truncate text-sm text-slate-800">{l.colaborador}</span>
              <span className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                <span
                  className="block h-full rounded-full bg-marca"
                  style={{ width: `${max > 0 ? (l.trocasPorHora / max) * 100 : 0}%` }}
                />
              </span>
              <span className="w-28 shrink-0 text-right text-xs tabular-nums text-slate-600">
                {l.trocasPorHora.toFixed(1).replace(".", ",")}/h
                <span className="ml-1 text-slate-500">· {formatarDuracao(l.minutosAtivos)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Secao>
  );
}
