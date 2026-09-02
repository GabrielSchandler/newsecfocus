"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { Card } from "@/components/ui/card";
import { formatarHoras } from "@/lib/formato";
import type { FatiaDistribuicao } from "@/lib/tipos";

/** Donut de distribuição de tempo por aplicativo/site. */
export function GraficoDonut({ dados }: { dados: FatiaDistribuicao[] }) {
  const total = dados.reduce((s, d) => s + d.minutos, 0);

  return (
    <Card className="p-5">
      <div className="mb-2">
        <h3 className="text-sm font-medium text-slate-200">Distribuição por aplicativo / site</h3>
        <p className="text-xs text-slate-500">tempo de foco no período</p>
      </div>

      {total === 0 ? (
        <div className="flex h-[280px] items-center justify-center text-sm text-slate-500">
          Sem dados de uso no período
        </div>
      ) : (
        <div className="flex flex-col items-center gap-4 lg:flex-row">
          <div className="relative h-[220px] w-[220px] shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={dados}
                  dataKey="minutos"
                  nameKey="nome"
                  innerRadius={68}
                  outerRadius={100}
                  paddingAngle={2}
                  stroke="none"
                >
                  {dados.map((d) => (
                    <Cell key={d.nome} fill={d.cor} />
                  ))}
                </Pie>
                <Tooltip content={<TooltipDonut total={total} />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-semibold text-slate-100">{formatarHoras(total)}</span>
              <span className="text-xs text-slate-500">total</span>
            </div>
          </div>

          <ul className="w-full space-y-2">
            {dados.map((d) => {
              const pct = total > 0 ? (d.minutos / total) * 100 : 0;
              return (
                <li key={d.nome} className="flex items-center gap-3 text-sm">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: d.cor }} />
                  <span className="flex-1 truncate text-slate-300">{d.nome}</span>
                  <span className="text-slate-500">{pct.toFixed(0)}%</span>
                  <span className="w-16 text-right text-slate-400">{formatarHoras(d.minutos)}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Card>
  );
}

function TooltipDonut({ active, payload, total }: any) {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  const pct = total > 0 ? ((p.value / total) * 100).toFixed(1) : "0";
  return (
    <div className="rounded-lg border border-borda bg-fundo-cartao/95 px-3 py-2 text-xs shadow-glow backdrop-blur">
      <p className="flex items-center gap-2 text-slate-200">
        <span className="h-2 w-2 rounded-full" style={{ background: p.payload.cor }} />
        {p.name}
      </p>
      <p className="mt-1 text-slate-400">
        {formatarHoras(p.value)} · {pct}%
      </p>
    </div>
  );
}
