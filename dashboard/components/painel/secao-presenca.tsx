"use client";

import { UserCheck } from "lucide-react";
import { Tabela, type ColunaTabela } from "./tabela";
import type { LinhaPresenca } from "@/lib/tipos";

/**
 * Presença & pontualidade: por pessoa, a que horas costuma chegar e sair, a
 * faixa (mais cedo–mais tarde) e quantos dias esteve presente contra os dias
 * úteis do período. Responde de relance "quem chega cedo, quem some".
 */

function hhmm(min: number | null): string {
  if (min === null || min === undefined) return "—";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function SecaoPresenca({
  linhas,
  mostrarPessoa = true,
}: {
  linhas: LinhaPresenca[];
  mostrarPessoa?: boolean;
}) {
  const colunas: ColunaTabela<LinhaPresenca>[] = [
    {
      chave: "pessoa",
      rotulo: "Pessoa",
      principal: true,
      valorOrdenacao: (l) => l.colaborador,
      render: (l) => (
        <div className="min-w-0">
          <span className="block truncate font-medium text-slate-100">{l.colaborador}</span>
          {mostrarPessoa && l.equipe && (
            <span className="block truncate text-xs text-slate-500">{l.equipe}</span>
          )}
        </div>
      ),
    },
    {
      chave: "chegada",
      rotulo: "Chegada média",
      alinhar: "direita",
      valorOrdenacao: (l) => l.chegadaMedia ?? 9999,
      render: (l) => <span className="tabular-nums text-slate-200">{hhmm(l.chegadaMedia)}</span>,
    },
    {
      chave: "saida",
      rotulo: "Saída média",
      alinhar: "direita",
      valorOrdenacao: (l) => l.saidaMedia ?? -1,
      render: (l) => <span className="tabular-nums text-slate-200">{hhmm(l.saidaMedia)}</span>,
    },
    {
      chave: "faixa",
      rotulo: "Mais cedo / mais tarde",
      alinhar: "direita",
      ocultarMobile: true,
      render: (l) => (
        <span className="tabular-nums text-xs text-slate-500">
          {hhmm(l.chegadaCedo)} – {hhmm(l.saidaTarde)}
        </span>
      ),
    },
    {
      chave: "presentes",
      rotulo: "Dias presentes",
      alinhar: "direita",
      valorOrdenacao: (l) => l.diasPresentes,
      render: (l) => (
        <span className="tabular-nums text-slate-300">
          {l.diasPresentes}
          <span className="text-slate-600"> / {l.diasUteis}</span>
        </span>
      ),
    },
    {
      chave: "faltas",
      rotulo: "Faltas",
      alinhar: "direita",
      valorOrdenacao: (l) => l.faltas,
      render: (l) => (
        <span className={`tabular-nums ${l.faltas > 0 ? "text-amber-300" : "text-slate-500"}`}>
          {l.faltas}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <UserCheck className="h-4 w-4 text-cyan-400" />
        <h3 className="text-sm font-medium text-slate-200">Presença &amp; pontualidade</h3>
      </div>
      <Tabela
        colunas={colunas}
        linhas={linhas}
        chave={(l) => l.colaboradorId}
        href={(l) => `/painel/pessoas/${l.colaboradorId}`}
        ordenacaoInicial={{ coluna: "presentes", direcao: "desc" }}
        vazio="Sem presença registrada no período."
      />
      <p className="text-[11px] leading-relaxed text-slate-600">
        Chegada e saída são a média do primeiro e do último sinal de cada dia. Faltas = dias úteis
        (seg–sex) do período menos os dias com registro — não considera feriados nem folgas.
      </p>
    </div>
  );
}
