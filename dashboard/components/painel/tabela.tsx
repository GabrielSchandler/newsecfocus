"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface ColunaTabela<T> {
  chave: string;
  rotulo: string;
  alinhar?: "esquerda" | "direita";
  /** Coluna que identifica a linha: vira o título do cartão no celular. */
  principal?: boolean;
  /** Some no celular para o cartão não virar uma parede de dados. */
  ocultarMobile?: boolean;
  render: (linha: T) => React.ReactNode;
  /** Habilita ordenação por esta coluna. */
  valorOrdenacao?: (linha: T) => number | string;
}

interface Props<T> {
  colunas: ColunaTabela<T>[];
  linhas: T[];
  chave: (linha: T) => string;
  /** Torna cada linha clicável (drill-down para o detalhe). */
  href?: (linha: T) => string;
  vazio?: React.ReactNode;
  ordenacaoInicial?: { coluna: string; direcao: "asc" | "desc" };
  className?: string;
}

/**
 * Tabela responsiva: vira grade tradicional no desktop e lista de cartões no
 * celular. Uma tabela de 12 colunas com rolagem horizontal é ilegível no
 * telefone — e é onde o gestor mais consulta o painel.
 */
export function Tabela<T>({
  colunas,
  linhas,
  chave,
  href,
  vazio = "Nenhum registro no período.",
  ordenacaoInicial,
  className,
}: Props<T>) {
  const [ordenacao, setOrdenacao] = React.useState(ordenacaoInicial);

  const ordenadas = React.useMemo(() => {
    if (!ordenacao) return linhas;
    const coluna = colunas.find((c) => c.chave === ordenacao.coluna);
    if (!coluna?.valorOrdenacao) return linhas;

    const fator = ordenacao.direcao === "asc" ? 1 : -1;
    return [...linhas].sort((a, b) => {
      const va = coluna.valorOrdenacao!(a);
      const vb = coluna.valorOrdenacao!(b);
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * fator;
      return String(va).localeCompare(String(vb), "pt-BR") * fator;
    });
  }, [linhas, colunas, ordenacao]);

  function alternarOrdenacao(coluna: ColunaTabela<T>) {
    if (!coluna.valorOrdenacao) return;
    setOrdenacao((atual) =>
      atual?.coluna === coluna.chave
        ? { coluna: coluna.chave, direcao: atual.direcao === "asc" ? "desc" : "asc" }
        : { coluna: coluna.chave, direcao: "desc" },
    );
  }

  if (linhas.length === 0) {
    return (
      <Card className={cn("p-10 text-center text-sm text-slate-500", className)}>{vazio}</Card>
    );
  }

  const principal = colunas.find((c) => c.principal) ?? colunas[0];
  const secundarias = colunas.filter((c) => c !== principal && !c.ocultarMobile);

  return (
    <Card className={cn("overflow-hidden", className)}>
      {/* Desktop */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead className="border-b border-borda">
            <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
              {colunas.map((coluna) => {
                const ativa = ordenacao?.coluna === coluna.chave;
                return (
                  <th
                    key={coluna.chave}
                    scope="col"
                    aria-sort={
                      ativa ? (ordenacao!.direcao === "asc" ? "ascending" : "descending") : "none"
                    }
                    className={cn(
                      "px-4 py-3 font-medium",
                      coluna.alinhar === "direita" && "text-right",
                    )}
                  >
                    {coluna.valorOrdenacao ? (
                      <button
                        type="button"
                        onClick={() => alternarOrdenacao(coluna)}
                        className={cn(
                          "inline-flex items-center gap-1 transition-colors hover:text-slate-300",
                          ativa && "text-cyan-300",
                        )}
                      >
                        {coluna.rotulo}
                        {ativa &&
                          (ordenacao!.direcao === "asc" ? (
                            <ArrowUp className="h-3 w-3" />
                          ) : (
                            <ArrowDown className="h-3 w-3" />
                          ))}
                      </button>
                    ) : (
                      coluna.rotulo
                    )}
                  </th>
                );
              })}
              {href && <th className="w-8" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/70">
            {ordenadas.map((linha) => {
              const destino = href?.(linha);
              return (
                <tr
                  key={chave(linha)}
                  className={cn(
                    "transition-colors hover:bg-slate-800/30",
                    destino && "cursor-pointer",
                  )}
                >
                  {colunas.map((coluna) => (
                    <td
                      key={coluna.chave}
                      className={cn("px-4 py-3", coluna.alinhar === "direita" && "text-right")}
                    >
                      {destino && coluna === principal ? (
                        <Link href={destino} className="block hover:text-cyan-300">
                          {coluna.render(linha)}
                        </Link>
                      ) : (
                        coluna.render(linha)
                      )}
                    </td>
                  ))}
                  {destino && (
                    <td className="px-2">
                      <Link href={destino} aria-label="Abrir detalhe">
                        <ChevronRight className="h-4 w-4 text-slate-600" />
                      </Link>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Celular */}
      <ul className="divide-y divide-slate-800/70 md:hidden">
        {ordenadas.map((linha) => {
          const destino = href?.(linha);
          const conteudo = (
            <>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 font-medium text-slate-100">
                  {principal.render(linha)}
                </div>
                {destino && <ChevronRight className="h-4 w-4 shrink-0 text-slate-600" />}
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2">
                {secundarias.map((coluna) => (
                  <div key={coluna.chave} className="min-w-0">
                    <dt className="text-xs text-slate-500">{coluna.rotulo}</dt>
                    <dd className="truncate text-sm text-slate-300">{coluna.render(linha)}</dd>
                  </div>
                ))}
              </dl>
            </>
          );

          return (
            <li key={chave(linha)} className="p-4">
              {destino ? (
                <Link href={destino} className="block">
                  {conteudo}
                </Link>
              ) : (
                conteudo
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

// ----------------------------------------------------------------------------
//  Células reutilizáveis
// ----------------------------------------------------------------------------

/** Barra proporcional dentro da célula — comparação visual sem sair da tabela. */
export function CelulaBarra({
  valor,
  maximo,
  rotulo,
  cor = "#22d3ee",
}: {
  valor: number;
  maximo: number;
  rotulo: string;
  cor?: string;
}) {
  const pct = maximo > 0 ? Math.min(100, (valor / maximo) * 100) : 0;
  return (
    <div className="flex items-center justify-end gap-2">
      <span className="tabular-nums text-slate-300">{rotulo}</span>
      <span className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-slate-800 lg:block">
        <span
          className="block h-full rounded-full transition-all"
          style={{ width: `${pct}%`, background: cor }}
        />
      </span>
    </div>
  );
}
