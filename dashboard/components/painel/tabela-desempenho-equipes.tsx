"use client";

import { Tabela, type ColunaTabela } from "./tabela";
import { formatarDuracao } from "@/lib/formato";
import type { LinhaComparativoEquipe } from "@/lib/visao-geral";

/**
 * Equipes lado a lado. O índice é média por pessoa (equipe de 3 comparável com
 * equipe de 10); cobertura, tempo ativo e fora da escala são somas da equipe.
 * Sem pódio nem nota: é comparação de uso do expediente, não de desempenho.
 */
export function TabelaDesempenhoEquipes({
  linhas,
  recorte,
  temAnterior,
}: {
  linhas: LinhaComparativoEquipe[];
  recorte: string;
  temAnterior: boolean;
}) {
  const colunas: ColunaTabela<LinhaComparativoEquipe>[] = [
    {
      chave: "equipe",
      rotulo: "Equipe",
      principal: true,
      valorOrdenacao: (l) => l.equipe,
      render: (l) => <span className={l.equipeId ? undefined : "text-slate-500"}>{l.equipe}</span>,
    },
    {
      chave: "pessoas",
      rotulo: "Pessoas",
      alinhar: "direita",
      valorOrdenacao: (l) => l.pessoas,
      render: (l) => <span className="numeros-tabulares">{l.pessoas}</span>,
    },
    {
      chave: "indice",
      rotulo: "Produtivo",
      valorOrdenacao: (l) => l.indice ?? -1,
      render: (l) => (
        <div className="flex min-w-[160px] items-center gap-3">
          <span className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
            <span className="block h-full rounded-full bg-marca" style={{ width: `${Math.min(100, l.indice ?? 0)}%` }} />
          </span>
          <span className="numeros-tabulares w-10 shrink-0 text-right font-medium">
            {l.indice === null ? "—" : `${Math.round(l.indice)}%`}
          </span>
        </div>
      ),
    },
    {
      chave: "cobertura",
      rotulo: "Cobertura",
      alinhar: "direita",
      valorOrdenacao: (l) => l.cobertura ?? -1,
      render: (l) => <span className="numeros-tabulares">{l.cobertura === null ? "—" : `${Math.round(l.cobertura)}%`}</span>,
    },
    {
      chave: "ativo",
      rotulo: "Tempo ativo",
      alinhar: "direita",
      ocultarMobile: true,
      valorOrdenacao: (l) => l.minutosAtivos,
      render: (l) => <span className="numeros-tabulares">{formatarDuracao(l.minutosAtivos)}</span>,
    },
    {
      chave: "fora",
      rotulo: "Fora da escala",
      alinhar: "direita",
      valorOrdenacao: (l) => l.minutosForaEscala,
      render: (l) => <span className="numeros-tabulares">{formatarDuracao(l.minutosForaEscala)}</span>,
    },
    {
      chave: "variacao",
      rotulo: "Variação",
      alinhar: "direita",
      valorOrdenacao: (l) => l.variacao ?? -999,
      render: (l) =>
        !temAnterior || l.variacao === null ? (
          <span className="text-slate-400" title="Sem base comparável: expediente ou cobertura insuficiente no período anterior">
            —
          </span>
        ) : (
          <span
            className={`numeros-tabulares font-medium ${
              Math.abs(l.variacao) < 0.5 ? "text-slate-500" : l.variacao > 0 ? "text-emerald-700" : "text-rose-700"
            }`}
          >
            {l.variacao > 0 ? "+" : l.variacao < 0 ? "−" : ""}
            {Math.abs(l.variacao).toFixed(1).replace(".", ",").replace(/,0$/, "")} p.p.
          </span>
        ),
    },
  ];

  return (
    <Tabela
      semMoldura
      colunas={colunas}
      linhas={linhas}
      chave={(l) => l.equipeId ?? "sem-equipe"}
      href={(l) => (l.equipeId ? `/painel/equipes/${l.equipeId}${recorte}` : `/painel/pessoas?situacao=pendente`)}
      ordenacaoInicial={{ coluna: "indice", direcao: "desc" }}
      vazio="Nenhuma equipe com expediente no período."
    />
  );
}
