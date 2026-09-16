import Link from "next/link";
import { ArrowRight, UsersRound } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatarPorcentagemEnxuta } from "@/lib/formato";
import type { LinhaComparativoEquipe } from "@/lib/visao-geral";

const MAX_LINHAS = 6;

/**
 * Equipes lado a lado, pela média simples do % de cada pessoa — a única forma
 * de uma equipe de 3 ser comparável com uma de 10.
 */
export function ComparativoEquipes({
  linhas,
  recorte,
  temAnterior,
  erro,
  className,
}: {
  linhas: LinhaComparativoEquipe[];
  /** Query string do período, levada para o detalhe da equipe. */
  recorte: string;
  temAnterior: boolean;
  erro?: string | null;
  className?: string;
}) {
  const visiveis = linhas.slice(0, MAX_LINHAS);

  return (
    <Card className={cn("flex flex-col p-5 sm:px-6", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <UsersRound className="mt-0.5 h-6 w-6 shrink-0 text-acao" strokeWidth={1.75} />
          <div>
            <h3 className="text-[17px] font-semibold text-slate-900">Comparativo de equipes</h3>
            <p className="mt-0.5 text-sm text-slate-500">Produtivo: média por pessoa · cobertura: horas somadas</p>
          </div>
        </div>
        {linhas.length > MAX_LINHAS && (
          <Link
            href={`/painel/equipes${recorte}`}
            className="flex shrink-0 items-center gap-1.5 text-sm font-medium text-acao hover:underline"
          >
            Todas
            <ArrowRight className="h-4 w-4" />
          </Link>
        )}
      </div>

      {erro ? (
        <p className="mt-6 text-sm text-rose-700">Não foi possível carregar as equipes: {erro}</p>
      ) : visiveis.length === 0 ? (
        <p className="mt-6 text-sm text-slate-500">Nenhuma equipe com expediente no período.</p>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-lg border border-borda">
          <table className="w-full text-sm sm:min-w-[520px]">
            <thead>
              <tr className="bg-slate-50 text-left text-[13px] font-medium text-slate-600">
                <th className="px-3 py-2.5 font-medium">Equipe</th>
                <th className="hidden px-3 py-2.5 text-right font-medium sm:table-cell">Pessoas</th>
                <th className="px-3 py-2.5 font-medium">Produtivo</th>
                <th className="px-3 py-2.5 text-right font-medium">Cobertura</th>
                <th className="px-3 py-2.5 text-right font-medium">Variação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borda">
              {visiveis.map((l) => (
                <tr key={l.equipeId ?? "sem-equipe"} className="text-slate-800 transition-colors hover:bg-slate-50">
                  <td className="px-3 py-3">
                    {l.equipeId ? (
                      <Link href={`/painel/equipes/${l.equipeId}${recorte}`} className="hover:text-acao hover:underline">
                        {l.equipe}
                      </Link>
                    ) : (
                      <span className="text-slate-500">{l.equipe}</span>
                    )}
                  </td>
                  <td className="numeros-tabulares hidden px-3 py-3 text-right sm:table-cell">{l.pessoas}</td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-3">
                      <span className="hidden h-2 w-full min-w-[80px] overflow-hidden rounded-full bg-slate-100 sm:block">
                        <span
                          className="block h-full rounded-full bg-marca"
                          style={{ width: `${Math.min(100, l.indice ?? 0)}%` }}
                        />
                      </span>
                      <span className="numeros-tabulares shrink-0 text-right font-medium sm:w-11">
                        {l.indice === null ? "—" : `${Math.round(l.indice)}%`}
                      </span>
                    </div>
                  </td>
                  <td className="numeros-tabulares px-3 py-3 text-right">
                    {l.cobertura === null ? "—" : `${Math.round(l.cobertura)}%`}
                  </td>
                  <td className="numeros-tabulares whitespace-nowrap px-3 py-3 text-right">
                    <Variacao valor={l.variacao} temAnterior={temAnterior} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-auto pt-4 text-xs text-slate-500">
        Tempo produtivo indica uso de aplicativos classificados como produtivos; não mede a
        qualidade das entregas. Variação só aparece com cobertura de dados suficiente nos dois
        períodos.
      </p>
    </Card>
  );
}

function Variacao({ valor, temAnterior }: { valor: number | null; temAnterior: boolean }) {
  if (!temAnterior || valor === null) return <span className="text-slate-400">—</span>;
  const cor = Math.abs(valor) < 0.5 ? "text-slate-500" : valor > 0 ? "text-emerald-700" : "text-rose-700";
  const sinal = valor > 0 ? "+" : valor < 0 ? "−" : "";
  return (
    <span className={cn("font-medium", cor)}>
      {sinal}
      {formatarPorcentagemEnxuta(Math.abs(valor)).replace("%", "")} p.p.
    </span>
  );
}
