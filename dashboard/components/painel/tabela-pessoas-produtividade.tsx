"use client";

import Link from "next/link";
import { Tabela, type ColunaTabela } from "./tabela";
import { BarraComposicao } from "./tabela-equipes-media";
import { Badge } from "@/components/ui/badge";
import { formatarHoras, formatarPorcentagem } from "@/lib/formato";
import type { LinhaProdutividade } from "@/lib/tipos";

/**
 * Pessoas medidas contra o próprio expediente.
 *
 * A planilha antiga somava tempo ativo — quem ficava mais tempo logado ganhava,
 * mesmo passando o dia em coisa improdutiva. Aqui cada linha responde três
 * perguntas na ordem em que o gestor faz: quanto do expediente virou trabalho
 * (índice), a pessoa estava lá (aderência) e, quando o número está baixo, PARA
 * ONDE o tempo foi (a barra de composição, com ocioso, bloqueado e desligado).
 */

function composicaoDe(l: LinhaProdutividade) {
  const e = Math.max(1, l.minutosExpediente);
  const pct = (v: number) => (v / e) * 100;
  return {
    produtivo: pct(l.minutosProdutivos),
    neutro: pct(l.minutosNeutros),
    improdutivo: pct(l.minutosImprodutivos),
    semClassificar: pct(l.minutosSemClassificar),
    ocioso: pct(l.minutosOciosos),
    bloqueado: pct(l.minutosBloqueado),
    desligado: pct(l.minutosDesligado),
  };
}

export function TabelaPessoasProdutividade({
  linhas,
  recorte,
  mostrarEquipe = true,
}: {
  linhas: LinhaProdutividade[];
  recorte: string;
  mostrarEquipe?: boolean;
}) {
  const colunas: ColunaTabela<LinhaProdutividade>[] = [
    {
      chave: "pessoa",
      rotulo: "Pessoa",
      principal: true,
      valorOrdenacao: (l) => l.colaborador,
      render: (l) => (
        <div className="min-w-0">
          <Link
            href={`/painel/pessoas/${l.colaboradorId}${recorte}`}
            className="block truncate font-medium text-slate-100 hover:text-cyan-300"
          >
            {l.colaborador}
          </Link>
          {mostrarEquipe && (
            <span className="block truncate text-xs text-slate-500">
              {l.equipe ?? "Sem equipe"}
            </span>
          )}
        </div>
      ),
    },
    {
      chave: "indice",
      rotulo: "Índice",
      alinhar: "direita",
      valorOrdenacao: (l) => l.indice ?? -1,
      render: (l) => (
        <div className="flex items-center justify-end gap-2">
          <span className="tabular-nums font-medium text-slate-100">
            {l.indice === null ? "—" : formatarPorcentagem(l.indice, 1)}
          </span>
          <span className="hidden h-1.5 w-14 overflow-hidden rounded-full bg-slate-800 lg:block">
            <span
              className="block h-full rounded-full bg-gradient-to-r from-cyan-400 to-violet-400"
              style={{ width: `${Math.min(100, l.indice ?? 0)}%` }}
            />
          </span>
        </div>
      ),
    },
    {
      chave: "aderencia",
      rotulo: "Aderência",
      alinhar: "direita",
      valorOrdenacao: (l) => l.aderencia ?? -1,
      render: (l) => (
        <span className="tabular-nums text-slate-300">
          {l.aderencia === null ? "—" : formatarPorcentagem(l.aderencia, 0)}
        </span>
      ),
    },
    {
      chave: "composicao",
      rotulo: "Para onde foi o expediente",
      render: (l) => <BarraComposicao composicao={composicaoDe(l)} />,
    },
    {
      chave: "produtivo",
      rotulo: "Produtivo",
      alinhar: "direita",
      ocultarMobile: true,
      valorOrdenacao: (l) => l.minutosProdutivos,
      render: (l) => (
        <span className="tabular-nums text-slate-300">{formatarHoras(l.minutosProdutivos)}</span>
      ),
    },
    {
      chave: "desligado",
      rotulo: "Desligado",
      alinhar: "direita",
      ocultarMobile: true,
      valorOrdenacao: (l) => l.minutosDesligado,
      render: (l) => (
        <span
          className={`tabular-nums ${
            l.minutosExpediente > 0 && l.minutosDesligado / l.minutosExpediente > 0.4
              ? "text-amber-300"
              : "text-slate-400"
          }`}
        >
          {formatarHoras(l.minutosDesligado)}
        </span>
      ),
    },
    {
      chave: "expediente",
      rotulo: "Expediente",
      alinhar: "direita",
      ocultarMobile: true,
      valorOrdenacao: (l) => l.minutosExpediente,
      render: (l) => (
        <span className="tabular-nums text-slate-500">
          {formatarHoras(l.minutosExpediente)}
          <span className="ml-1 text-slate-600">
            · {l.diasComExpediente} {l.diasComExpediente === 1 ? "dia" : "dias"}
          </span>
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-2">
      <Tabela
        colunas={colunas}
        linhas={linhas}
        chave={(l) => l.colaboradorId}
        ordenacaoInicial={{ coluna: "indice", direcao: "desc" }}
        vazio="Ninguém com expediente no período."
      />
      <p className="flex flex-wrap items-center gap-2 text-[11px] leading-relaxed text-slate-600">
        <Badge variante="neutro">como ler</Badge>
        <span className="min-w-0 flex-1">
          O índice é o tempo produtivo sobre o <strong>expediente da pessoa</strong> (a escala dela,
          em Administração &rsaquo; Expediente). A aderência é quanto do expediente a estação
          esteve ligada. A barra mostra para onde o expediente foi — inclusive ocioso, tela
          bloqueada e máquina desligada.
        </span>
      </p>
    </div>
  );
}
