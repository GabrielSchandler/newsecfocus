"use client";

import { Tabela, CelulaBarra, type ColunaTabela } from "./tabela";
import { formatarHorasCurto, formatarPorcentagem } from "@/lib/formato";
import type { LinhaHorasExtras } from "@/lib/tipos";

interface Props {
  linhas: LinhaHorasExtras[];
  mostrarEquipe?: boolean;
}

/**
 * Faixa de risco por percentual fora da janela — o inverso do índice de
 * produtividade: aqui, quanto maior, pior (mais sinal de sobrecarga).
 */
function faixaRisco(percentual: number | null): { rotulo: string; classe: string } {
  if (percentual === null) return { rotulo: "sem janela definida", classe: "text-slate-500" };
  if (percentual >= 25) return { rotulo: "alto", classe: "text-rose-400" };
  if (percentual >= 10) return { rotulo: "médio", classe: "text-amber-400" };
  return { rotulo: "baixo", classe: "text-emerald-400" };
}

/**
 * Ranking de horas extras: quem trabalhou mais fora da janela esperada, base
 * para identificar risco de sobrecarga e esgotamento — não só presença.
 */
export function TabelaHorasExtras({ linhas, mostrarEquipe = true }: Props) {
  const maiorExtra = Math.max(1, ...linhas.map((l) => l.minutosExtras));

  const colunas: ColunaTabela<LinhaHorasExtras>[] = [
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
            valorOrdenacao: (l: LinhaHorasExtras) => l.equipe ?? "",
            render: (l: LinhaHorasExtras) => (
              <span className="truncate text-slate-400">{l.equipe ?? "Sem equipe"}</span>
            ),
          } as ColunaTabela<LinhaHorasExtras>,
        ]
      : []),
    {
      chave: "janela",
      rotulo: "Janela esperada",
      ocultarMobile: true,
      valorOrdenacao: (l) => l.janela ?? "",
      render: (l) => (
        <span className="tabular-nums text-slate-400">{l.janela ?? "não definida"}</span>
      ),
    },
    {
      chave: "ativoTotal",
      rotulo: "Tempo ativo",
      alinhar: "direita",
      ocultarMobile: true,
      valorOrdenacao: (l) => l.minutosAtivosTotais,
      render: (l) => (
        <span className="tabular-nums text-slate-400">
          {formatarHorasCurto(l.minutosAtivosTotais)}
        </span>
      ),
    },
    {
      chave: "extras",
      rotulo: "Fora da janela",
      alinhar: "direita",
      valorOrdenacao: (l) => l.minutosExtras,
      render: (l) => (
        <CelulaBarra
          valor={l.minutosExtras}
          maximo={maiorExtra}
          rotulo={formatarHorasCurto(l.minutosExtras)}
          cor="#fb7185"
        />
      ),
    },
    {
      chave: "dias",
      rotulo: "Dias com extra",
      alinhar: "direita",
      ocultarMobile: true,
      valorOrdenacao: (l) => l.diasComHoraExtra,
      render: (l) => <span className="tabular-nums text-slate-400">{l.diasComHoraExtra}</span>,
    },
    {
      chave: "percentual",
      rotulo: "% fora da janela",
      alinhar: "direita",
      valorOrdenacao: (l) => l.percentualExtra ?? -1,
      render: (l) => {
        const faixa = faixaRisco(l.percentualExtra);
        return (
          <span className={`font-medium tabular-nums ${faixa.classe}`}>
            {formatarPorcentagem(l.percentualExtra, 1)}
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
      ordenacaoInicial={{ coluna: "extras", direcao: "desc" }}
      vazio="Nenhum colaborador com registro no período."
    />
  );
}
