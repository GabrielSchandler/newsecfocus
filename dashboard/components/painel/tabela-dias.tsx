"use client";

import { Tabela, type ColunaTabela } from "./tabela";
import {
  dataCurta,
  faixaIndice,
  formatarHorasCurto,
  formatarPorcentagem,
  horaCurta,
} from "@/lib/formato";

export interface LinhaDia {
  dia: string;
  minutos_ativos: number;
  minutos_ociosos: number;
  minutos_produtivos: number;
  minutos_improdutivos: number;
  indice: number | null;
  primeiro_sinal: string | null;
  ultimo_sinal: string | null;
}

/** Dia a dia de uma pessoa. Colunas montadas no cliente (ver TabelaEquipes). */
export function TabelaDias({ linhas, fuso }: { linhas: LinhaDia[]; fuso: string }) {
  const colunas: ColunaTabela<LinhaDia>[] = [
    {
      chave: "dia",
      rotulo: "Data",
      principal: true,
      valorOrdenacao: (l) => l.dia,
      render: (l) => (
        <span className="font-medium text-slate-100">
          {dataCurta(`${l.dia}T12:00:00Z`, "UTC")}
        </span>
      ),
    },
    {
      chave: "expediente",
      rotulo: "Expediente",
      valorOrdenacao: (l) => l.primeiro_sinal ?? "",
      render: (l) => (
        <span className="tabular-nums text-slate-400">
          {horaCurta(l.primeiro_sinal, fuso)} — {horaCurta(l.ultimo_sinal, fuso)}
        </span>
      ),
    },
    {
      chave: "ativo",
      rotulo: "Ativo",
      alinhar: "direita",
      valorOrdenacao: (l) => Number(l.minutos_ativos),
      render: (l) => (
        <span className="tabular-nums text-slate-200">
          {formatarHorasCurto(Number(l.minutos_ativos))}
        </span>
      ),
    },
    {
      chave: "ocioso",
      rotulo: "Ocioso",
      alinhar: "direita",
      ocultarMobile: true,
      valorOrdenacao: (l) => Number(l.minutos_ociosos),
      render: (l) => (
        <span className="tabular-nums text-slate-400">
          {formatarHorasCurto(Number(l.minutos_ociosos))}
        </span>
      ),
    },
    {
      chave: "indice",
      rotulo: "Índice",
      alinhar: "direita",
      valorOrdenacao: (l) => l.indice ?? -1,
      render: (l) => {
        const valor = l.indice === null ? null : Number(l.indice);
        return (
          <span className={`font-medium tabular-nums ${faixaIndice(valor).classe}`}>
            {formatarPorcentagem(valor, 1)}
          </span>
        );
      },
    },
  ];

  return (
    <Tabela
      colunas={colunas}
      linhas={linhas}
      chave={(l) => l.dia}
      ordenacaoInicial={{ coluna: "dia", direcao: "desc" }}
      vazio="Sem registros nesse período."
    />
  );
}
