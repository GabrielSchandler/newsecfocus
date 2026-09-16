"use client";

import { Tabela, type ColunaTabela } from "./tabela";
import { formatarDuracao } from "@/lib/formato";

export interface LinhaMembro {
  colaboradorId: string;
  nome: string;
  equipe: string | null;
  indice: number | null;
  cobertura: number | null;
  minutosAtivos: number;
  minutosForaEscala: number;
  /** Validada contra cobertura mínima; null = sem base. */
  variacao: number | null;
  aproximado: boolean;
}

/**
 * Pessoas de um recorte com as métricas da fonte única. Ordenável no próprio
 * navegador porque é a equipe inteira (dezenas de linhas, não milhares).
 */
export function TabelaMembros({
  linhas,
  recorte,
  mostrarEquipe = false,
  compacta = false,
}: {
  linhas: LinhaMembro[];
  recorte: string;
  mostrarEquipe?: boolean;
  /** Só pessoa, produtivo, cobertura e variação — o bloco do Resumo. */
  compacta?: boolean;
}) {
  const colunas: ColunaTabela<LinhaMembro>[] = [
    {
      chave: "nome",
      rotulo: "Pessoa",
      principal: true,
      valorOrdenacao: (l) => l.nome,
      render: (l) => l.nome,
    },
    ...(mostrarEquipe
      ? [
          {
            chave: "equipe",
            rotulo: "Equipe",
            valorOrdenacao: (l: LinhaMembro) => l.equipe ?? "",
            render: (l: LinhaMembro) => l.equipe ?? <span className="text-slate-400">Sem equipe</span>,
          },
        ]
      : []),
    {
      chave: "indice",
      rotulo: "Produtivo",
      valorOrdenacao: (l) => l.indice ?? -1,
      render: (l) => (
        <div className="flex min-w-[150px] items-center gap-3">
          <span className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
            <span className="block h-full rounded-full bg-marca" style={{ width: `${Math.min(100, l.indice ?? 0)}%` }} />
          </span>
          <span className="numeros-tabulares w-10 shrink-0 text-right font-medium">
            {l.indice === null ? "—" : `${Math.round(l.indice)}%`}
          </span>
        </div>
      ),
    },
    ...(compacta
      ? []
      : [
          {
            chave: "ativos",
            rotulo: "Tempo ativo",
            alinhar: "direita" as const,
            valorOrdenacao: (l: LinhaMembro) => l.minutosAtivos,
            render: (l: LinhaMembro) => <span className="numeros-tabulares">{formatarDuracao(l.minutosAtivos)}</span>,
          },
        ]),
    {
      chave: "cobertura",
      rotulo: "Cobertura",
      alinhar: "direita",
      valorOrdenacao: (l) => l.cobertura ?? -1,
      render: (l) => (
        <span className="numeros-tabulares">{l.cobertura === null ? "—" : `${Math.round(l.cobertura)}%`}</span>
      ),
    },
    ...(compacta
      ? []
      : [
          {
            chave: "fora",
            rotulo: "Fora da escala",
            alinhar: "direita" as const,
            valorOrdenacao: (l: LinhaMembro) => l.minutosForaEscala,
            render: (l: LinhaMembro) => (
              <span className="numeros-tabulares">{formatarDuracao(l.minutosForaEscala)}</span>
            ),
          },
        ]),
    {
      chave: "variacao",
      rotulo: "Variação",
      alinhar: "direita",
      valorOrdenacao: (l) => l.variacao ?? -999,
      render: (l) =>
        l.variacao === null ? (
          <span className="text-slate-400" title="Sem base comparável no período anterior">
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
      chave={(l) => l.colaboradorId}
      href={(l) => `/painel/pessoas/${l.colaboradorId}${recorte}`}
      ordenacaoInicial={{ coluna: "indice", direcao: "desc" }}
      vazio="Ninguém com expediente ou registro no período."
    />
  );
}
