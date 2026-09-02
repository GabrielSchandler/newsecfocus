"use client";

import { Tabela, CelulaBarra, type ColunaTabela } from "./tabela";
import { faixaIndice, formatarHorasCurto, formatarNumeroCompacto, formatarPorcentagem } from "@/lib/formato";
import type { LinhaRankingColaborador } from "@/lib/tipos";

interface Props {
  linhas: LinhaRankingColaborador[];
  recorte: string;
  mostrarEquipe?: boolean;
}

/**
 * Ranking de pessoas, reutilizado na lista geral e dentro de cada equipe.
 * Ordenável por qualquer coluna numérica — é onde o gestor procura o outlier.
 */
export function TabelaColaboradores({ linhas, recorte, mostrarEquipe = true }: Props) {
  const maiorTempo = Math.max(1, ...linhas.map((l) => l.minutosAtivos));

  const colunas: ColunaTabela<LinhaRankingColaborador>[] = [
    {
      chave: "colaborador",
      rotulo: "Colaborador",
      principal: true,
      valorOrdenacao: (l) => l.colaborador,
      render: (l) => (
        <span className="block min-w-0">
          <span className="block truncate font-medium text-slate-100">{l.colaborador}</span>
          {l.cargo && <span className="block truncate text-xs text-slate-500">{l.cargo}</span>}
        </span>
      ),
    },
    ...(mostrarEquipe
      ? [
          {
            chave: "equipe",
            rotulo: "Equipe",
            valorOrdenacao: (l: LinhaRankingColaborador) => l.equipe ?? "",
            render: (l: LinhaRankingColaborador) => (
              <span className="truncate text-slate-400">{l.equipe ?? "Sem equipe"}</span>
            ),
          } as ColunaTabela<LinhaRankingColaborador>,
        ]
      : []),
    {
      chave: "dias",
      rotulo: "Dias",
      alinhar: "direita",
      ocultarMobile: true,
      valorOrdenacao: (l) => l.diasComRegistro,
      render: (l) => <span className="tabular-nums text-slate-400">{l.diasComRegistro}</span>,
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
      chave: "mediaDia",
      rotulo: "Média/dia",
      alinhar: "direita",
      valorOrdenacao: (l) => (l.diasComRegistro > 0 ? l.minutosAtivos / l.diasComRegistro : 0),
      render: (l) => (
        // O total do período depende de quantos dias a pessoa apareceu; a média
        // é o que dá para comparar duas pessoas lado a lado.
        <span className="tabular-nums text-slate-200">
          {l.diasComRegistro > 0
            ? formatarHorasCurto(l.minutosAtivos / l.diasComRegistro)
            : "—"}
        </span>
      ),
    },
    {
      chave: "ocioso",
      rotulo: "Ocioso",
      alinhar: "direita",
      ocultarMobile: true,
      valorOrdenacao: (l) => l.minutosOciosos,
      render: (l) => (
        <span className="tabular-nums text-slate-400">
          {formatarHorasCurto(l.minutosOciosos)}
        </span>
      ),
    },
    {
      chave: "interacoes",
      rotulo: "Interações",
      alinhar: "direita",
      ocultarMobile: true,
      valorOrdenacao: (l) => l.teclas + l.cliques,
      render: (l) => (
        <span className="tabular-nums text-slate-400">
          {formatarNumeroCompacto(l.teclas + l.cliques)}
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
      render: (l) => {
        const faixa = faixaIndice(l.indice);
        return (
          <span className={`font-medium tabular-nums ${faixa.classe}`}>
            {formatarPorcentagem(l.indice, 1)}
          </span>
        );
      },
    },
  ];

  return (
    <Tabela
      colunas={colunas}
      linhas={linhas}
      chave={(l) => l.colaboradorId}
      href={(l) => `/painel/pessoas/${l.colaboradorId}${recorte}`}
      ordenacaoInicial={{ coluna: "ativo", direcao: "desc" }}
      vazio="Nenhum colaborador com registro no período."
    />
  );
}
