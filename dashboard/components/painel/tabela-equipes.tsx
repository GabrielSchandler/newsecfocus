"use client";

import { Tabela, CelulaBarra, type ColunaTabela } from "./tabela";
import { faixaIndice, formatarHorasCurto, formatarPorcentagem } from "@/lib/formato";
import type { LinhaRankingEquipe } from "@/lib/tipos";

/**
 * Comparativo de equipes.
 *
 * As colunas são montadas AQUI, no cliente, e não na página. Coluna carrega
 * função de render, e função não atravessa a fronteira servidor → cliente: a
 * página é Server Component e passar as colunas prontas quebra em execução.
 * A página passa só dados; a montagem é deste lado.
 */
export function TabelaEquipes({
  linhas,
  recorte,
}: {
  linhas: LinhaRankingEquipe[];
  recorte: string;
}) {
  const maiorTempo = Math.max(1, ...linhas.map((l) => l.minutosAtivos));

  const colunas: ColunaTabela<LinhaRankingEquipe>[] = [
    {
      chave: "equipe",
      rotulo: "Equipe",
      principal: true,
      valorOrdenacao: (l) => l.equipe,
      render: (l) => (
        <span className="flex items-center gap-2">
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ background: l.cor ?? "#475569" }}
          />
          <span className="truncate font-medium text-slate-100">{l.equipe}</span>
        </span>
      ),
    },
    {
      chave: "pessoas",
      rotulo: "Pessoas",
      alinhar: "direita",
      valorOrdenacao: (l) => l.pessoas,
      render: (l) => <span className="tabular-nums text-slate-300">{l.pessoas}</span>,
    },
    {
      chave: "ativo",
      rotulo: "Tempo ativo",
      alinhar: "direita",
      valorOrdenacao: (l) => l.minutosAtivos,
      render: (l) => (
        <CelulaBarra
          valor={l.minutosAtivos}
          maximo={maiorTempo}
          rotulo={formatarHorasCurto(l.minutosAtivos)}
        />
      ),
    },
    {
      chave: "mediaPessoa",
      rotulo: "Média/pessoa",
      alinhar: "direita",
      valorOrdenacao: (l) => (l.pessoas > 0 ? l.minutosAtivos / l.pessoas : 0),
      render: (l) => (
        // Sem isso, uma equipe de dez sempre parece melhor que uma de três.
        <span className="tabular-nums text-slate-200">
          {l.pessoas > 0 ? formatarHorasCurto(l.minutosAtivos / l.pessoas) : "—"}
        </span>
      ),
    },
    {
      chave: "produtivo",
      rotulo: "Produtivo",
      alinhar: "direita",
      ocultarMobile: true,
      valorOrdenacao: (l) => l.minutosProdutivos,
      render: (l) => (
        <span className="tabular-nums text-slate-400">
          {formatarHorasCurto(l.minutosProdutivos)}
        </span>
      ),
    },
    {
      chave: "improdutivo",
      rotulo: "Improdutivo",
      alinhar: "direita",
      ocultarMobile: true,
      valorOrdenacao: (l) => l.minutosImprodutivos,
      render: (l) => (
        <span className="tabular-nums text-slate-400">
          {formatarHorasCurto(l.minutosImprodutivos)}
        </span>
      ),
    },
    {
      chave: "aderencia",
      rotulo: "Aderência",
      alinhar: "direita",
      valorOrdenacao: (l) => l.aderencia ?? -1,
      render: (l) => (
        <span className="tabular-nums text-slate-300">
          {formatarPorcentagem(l.aderencia, 0)}
        </span>
      ),
    },
    {
      chave: "indice",
      rotulo: "Índice",
      alinhar: "direita",
      valorOrdenacao: (l) => l.indice ?? -1,
      render: (l) => (
        <span className={`font-medium tabular-nums ${faixaIndice(l.indice).classe}`}>
          {formatarPorcentagem(l.indice, 1)}
        </span>
      ),
    },
  ];

  return (
    <Tabela
      colunas={colunas}
      linhas={linhas}
      chave={(l) => l.equipeId}
      href={(l) => `/painel/equipes/${l.equipeId}${recorte}`}
      ordenacaoInicial={{ coluna: "ativo", direcao: "desc" }}
      vazio="Nenhuma equipe com registro no período."
    />
  );
}
