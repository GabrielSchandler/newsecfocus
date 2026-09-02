"use client";

import { Tabela, CelulaBarra, type ColunaTabela } from "./tabela";
import { Badge } from "@/components/ui/badge";
import { ROTULOS_TIPO, formatarHoras, formatarPorcentagem } from "@/lib/formato";
import type { FatiaDistribuicao } from "@/lib/tipos";

/** Uso por aplicativo/site. Colunas montadas no cliente (ver TabelaEquipes). */
export function TabelaAplicativos({ linhas }: { linhas: FatiaDistribuicao[] }) {
  const total = linhas.reduce((s, a) => s + a.minutos, 0);
  const maior = Math.max(1, ...linhas.map((a) => a.minutos));

  const colunas: ColunaTabela<FatiaDistribuicao>[] = [
    {
      chave: "nome",
      rotulo: "Aplicativo / site",
      principal: true,
      valorOrdenacao: (l) => l.nome,
      render: (l) => (
        <span className="flex min-w-0 items-center gap-2">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: l.cor }} />
          <span className="truncate font-medium text-slate-100">{l.nome}</span>
        </span>
      ),
    },
    {
      chave: "categoria",
      rotulo: "Categoria",
      valorOrdenacao: (l) => l.tipo ?? "ZZZ",
      render: (l) =>
        l.tipo ? (
          <Badge
            variante={
              l.tipo === "PRODUCTIVE" ? "ativo" : l.tipo === "NEUTRAL" ? "roxo" : "offline"
            }
          >
            {ROTULOS_TIPO[l.tipo]}
          </Badge>
        ) : (
          <Badge variante="neutro">sem categoria</Badge>
        ),
    },
    {
      chave: "pessoas",
      rotulo: "Pessoas",
      alinhar: "direita",
      ocultarMobile: true,
      valorOrdenacao: (l) => l.pessoas,
      render: (l) => <span className="tabular-nums text-slate-400">{l.pessoas}</span>,
    },
    {
      chave: "participacao",
      rotulo: "Participação",
      alinhar: "direita",
      ocultarMobile: true,
      valorOrdenacao: (l) => l.minutos,
      render: (l) => (
        <span className="tabular-nums text-slate-400">
          {formatarPorcentagem(total > 0 ? (l.minutos / total) * 100 : 0, 1)}
        </span>
      ),
    },
    {
      chave: "tempo",
      rotulo: "Tempo",
      alinhar: "direita",
      valorOrdenacao: (l) => l.minutos,
      render: (l) => (
        <CelulaBarra
          valor={l.minutos}
          maximo={maior}
          rotulo={formatarHoras(l.minutos)}
          cor={l.cor}
        />
      ),
    },
  ];

  return (
    <Tabela
      colunas={colunas}
      linhas={linhas}
      chave={(l) => l.nome}
      ordenacaoInicial={{ coluna: "tempo", direcao: "desc" }}
      vazio="Nenhum uso registrado no período."
    />
  );
}
