"use client";

import Link from "next/link";
import { Tabela, type ColunaTabela } from "./tabela";
import { formatarHoras, formatarPorcentagem } from "@/lib/formato";
import {
  CORES_EXPEDIENTE,
  ORDEM_EXPEDIENTE,
  ROTULOS_EXPEDIENTE,
} from "@/lib/cores-expediente";
import type { ComposicaoExpediente } from "@/lib/tipos";
import type { GrupoEquipe } from "@/lib/produtividade";

/**
 * Equipes comparadas por MÉDIA, não por total.
 *
 * Com tempo total, a equipe de 10 pessoas ganha de todas sempre — o número diz
 * o tamanho do time, não como ele trabalha. Aqui cada equipe entra pela média
 * simples do % das suas pessoas, então uma equipe de 3 é comparável com uma de
 * 10, que era exatamente o que faltava para tirar conclusão.
 */

/** Barra de composição compacta — a mesma leitura do resumo, em miniatura. */
export function BarraComposicao({
  composicao,
  altura = "h-2",
}: {
  composicao: ComposicaoExpediente;
  altura?: string;
}) {
  const soma = ORDEM_EXPEDIENTE.reduce((s, k) => s + composicao[k], 0);
  if (soma <= 0) return <span className="text-xs text-slate-600">—</span>;

  return (
    <span className={`flex ${altura} w-full overflow-hidden rounded-full bg-slate-800`}>
      {ORDEM_EXPEDIENTE.map((k) => {
        const pct = (composicao[k] / soma) * 100;
        if (pct <= 0) return null;
        return (
          <span
            key={k}
            style={{ width: `${pct}%`, background: CORES_EXPEDIENTE[k] }}
            title={`${ROTULOS_EXPEDIENTE[k]}: ${formatarPorcentagem(composicao[k], 1)}`}
          />
        );
      })}
    </span>
  );
}

export function TabelaEquipesMedia({
  grupos,
  recorte,
}: {
  grupos: GrupoEquipe[];
  recorte: string;
}) {
  const colunas: ColunaTabela<GrupoEquipe>[] = [
    {
      chave: "equipe",
      rotulo: "Equipe",
      principal: true,
      valorOrdenacao: (g) => g.equipe,
      render: (g) => (
        <div className="min-w-0">
          {g.equipeId ? (
            <Link
              href={`/painel/equipes/${g.equipeId}${recorte}`}
              className="block truncate font-medium text-slate-100 hover:text-cyan-300"
            >
              {g.equipe}
            </Link>
          ) : (
            <span className="block truncate font-medium text-slate-400">{g.equipe}</span>
          )}
          <span className="block text-xs text-slate-500">
            {g.resumo.pessoas} {g.resumo.pessoas === 1 ? "pessoa" : "pessoas"}
          </span>
        </div>
      ),
    },
    {
      chave: "indice",
      rotulo: "Índice médio",
      alinhar: "direita",
      valorOrdenacao: (g) => g.resumo.indiceMedio ?? -1,
      render: (g) => (
        <div className="flex items-center justify-end gap-2">
          <span className="tabular-nums font-medium text-slate-100">
            {g.resumo.indiceMedio === null ? "—" : formatarPorcentagem(g.resumo.indiceMedio, 1)}
          </span>
          <span className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-slate-800 lg:block">
            <span
              className="block h-full rounded-full bg-gradient-to-r from-cyan-400 to-violet-400"
              style={{ width: `${Math.min(100, g.resumo.indiceMedio ?? 0)}%` }}
            />
          </span>
        </div>
      ),
    },
    {
      chave: "aderencia",
      rotulo: "Aderência média",
      alinhar: "direita",
      valorOrdenacao: (g) => g.resumo.aderenciaMedia ?? -1,
      render: (g) => (
        <span className="tabular-nums text-slate-300">
          {g.resumo.aderenciaMedia === null ? "—" : formatarPorcentagem(g.resumo.aderenciaMedia, 0)}
        </span>
      ),
    },
    {
      chave: "composicao",
      rotulo: "Composição do expediente",
      render: (g) => <BarraComposicao composicao={g.resumo.composicao} />,
    },
    {
      chave: "expediente",
      rotulo: "Expediente",
      alinhar: "direita",
      ocultarMobile: true,
      valorOrdenacao: (g) => g.resumo.totais.expediente,
      render: (g) => (
        <span className="tabular-nums text-slate-400">
          {formatarHoras(g.resumo.totais.expediente)}
        </span>
      ),
    },
  ];

  return (
    <Tabela
      colunas={colunas}
      linhas={grupos}
      chave={(g) => g.equipeId ?? "sem-equipe"}
      ordenacaoInicial={{ coluna: "indice", direcao: "desc" }}
      vazio="Nenhuma equipe com expediente no período."
    />
  );
}
