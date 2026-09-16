import Link from "next/link";
import { AlertCircle, ArrowRight, CheckCircle2, Database, Eye } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { PontoAtencao } from "@/lib/visao-geral";

/**
 * O que olhar primeiro. Cada linha diz o fato e leva direto para onde se
 * resolve — um alerta sem destino só gera ansiedade. Problema de dado e
 * observação de atividade têm ícones diferentes: um pede conserto técnico, o
 * outro pede leitura, e confundir os dois é concluir desempenho a partir de
 * falha de coleta.
 */
export function PontosAtencao({
  pontos,
  titulo = "Pontos de atenção",
  className,
}: {
  pontos: PontoAtencao[];
  titulo?: string;
  className?: string;
}) {
  return (
    <Card className={cn("flex flex-col p-5 sm:px-6", className)}>
      <div className="flex items-center gap-3">
        <AlertCircle className="h-6 w-6 shrink-0 text-acao" strokeWidth={1.75} />
        <h2 className="text-[17px] font-semibold text-slate-900">{titulo}</h2>
      </div>

      {pontos.length === 0 ? (
        <p className="mt-6 flex items-center gap-2 text-sm text-slate-600">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
          Nada fora do esperado no período.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-borda border-t border-borda">
          {pontos.map((p) => {
            const Icone = p.natureza === "dados" ? Database : Eye;
            return (
              <li key={p.titulo} className="flex flex-col gap-2 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                <div className="flex min-w-0 items-start gap-2.5">
                  <Icone
                    className={cn("mt-0.5 h-4 w-4 shrink-0", p.natureza === "dados" ? "text-amber-600" : "text-slate-400")}
                    aria-label={p.natureza === "dados" ? "Qualidade do dado" : "Observação"}
                  />
                  <div className="min-w-0">
                    <p className="text-[15px] text-slate-800">{p.titulo}</p>
                    {p.detalhe && <p className="mt-0.5 text-xs text-slate-500">{p.detalhe}</p>}
                  </div>
                </div>
                <Link
                  href={p.acao.href}
                  className="flex shrink-0 items-center gap-1.5 pl-6 text-sm font-medium text-acao hover:underline sm:pl-0"
                >
                  {p.acao.rotulo}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
