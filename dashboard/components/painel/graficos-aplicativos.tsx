"use client";

import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CORES_CATEGORIA, ROTULOS_CATEGORIA } from "@/lib/cores-expediente";
import { formatarDuracao } from "@/lib/formato";
import type { TipoCategoria } from "@/lib/tipos";

type Chave = TipoCategoria | "SEM";
const ORDEM: Chave[] = ["PRODUCTIVE", "NEUTRAL", "UNPRODUCTIVE", "SEM"];

/**
 * Quantos aplicativos e sites caem em cada categoria, com o tempo de cada
 * grupo ao lado. A rosca conta itens; a legenda mostra itens e horas — são
 * leituras diferentes e as duas aparecem com nome.
 */
export function DonutCategorias({
  quantidades,
  minutos,
}: {
  quantidades: Record<Chave, number>;
  minutos: Record<Chave, number>;
}) {
  const total = ORDEM.reduce((s, k) => s + quantidades[k], 0);
  const dados = ORDEM.filter((k) => quantidades[k] > 0).map((k) => ({ chave: k, valor: quantidades[k] }));

  if (total === 0) {
    return <p className="py-8 text-center text-sm text-slate-500">Nenhum aplicativo no período.</p>;
  }

  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row">
      <div className="relative h-40 w-40 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={dados} dataKey="valor" nameKey="chave" innerRadius="68%" outerRadius="100%" stroke="#fff" strokeWidth={2} isAnimationActive={false}>
              {dados.map((d) => (
                <Cell key={d.chave} fill={CORES_CATEGORIA[d.chave]} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="numeros-tabulares text-2xl font-bold text-tinta">{total}</span>
          <span className="text-xs text-slate-500">itens</span>
        </div>
      </div>
      <ul className="w-full space-y-2.5">
        {ORDEM.map((k) => (
          <li key={k} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 text-sm">
            <span className="flex items-center gap-2 text-slate-700">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: CORES_CATEGORIA[k] }} />
              {ROTULOS_CATEGORIA[k]}
            </span>
            <span className="numeros-tabulares text-right font-medium text-slate-900">
              {quantidades[k]} <span className="font-normal text-slate-500">({total ? Math.round((quantidades[k] / total) * 100) : 0}%)</span>
            </span>
            <span className="numeros-tabulares w-20 text-right text-xs text-slate-500">{formatarDuracao(minutos[k])}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Uso por dia (ou hora, no recorte de um dia) em barras, com eixo em horas. */
export function BarrasUso({ pontos }: { pontos: { rotulo: string; completo: string; minutos: number }[] }) {
  if (pontos.every((p) => p.minutos === 0)) {
    return <p className="py-10 text-center text-sm text-slate-500">Sem uso no período.</p>;
  }
  return (
    <div className="h-[220px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={pontos} margin={{ top: 8, right: 8, left: -4, bottom: 0 }}>
          <CartesianGrid stroke="#e8ecf2" vertical={false} />
          <XAxis dataKey="rotulo" stroke="#64748b" fontSize={11} tickLine={false} axisLine={{ stroke: "#cbd5e1" }} minTickGap={12} />
          <YAxis
            stroke="#64748b"
            fontSize={11}
            tickLine={false}
            axisLine={false}
            width={40}
            tickFormatter={(v: number) => (v >= 60 ? `${Math.round(v / 60)}h` : `${v}m`)}
          />
          <Tooltip
            cursor={{ fill: "rgba(148,163,184,0.12)" }}
            content={({ active, payload }: any) =>
              active && payload?.length ? (
                <div className="rounded-lg border border-borda bg-white px-3 py-2 text-xs shadow-menu">
                  <p className="font-medium text-slate-800">{payload[0].payload.completo}</p>
                  <p className="numeros-tabulares text-slate-600">{formatarDuracao(payload[0].value)} de uso</p>
                </div>
              ) : null
            }
          />
          <Bar dataKey="minutos" fill="#1f9fb2" radius={[3, 3, 0, 0]} maxBarSize={28} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
