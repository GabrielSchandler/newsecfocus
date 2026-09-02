"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ROTULOS_TIPO, formatarHoras, formatarPorcentagem } from "@/lib/formato";
import type { FatiaDistribuicao } from "@/lib/tipos";

interface Props {
  dados: FatiaDistribuicao[];
  titulo?: string;
}

/** Donut de distribuição de tempo por aplicativo/site, com a categoria ao lado. */
export function GraficoDonut({ dados, titulo = "Distribuição por aplicativo / site" }: Props) {
  const total = dados.reduce((s, d) => s + d.minutos, 0);

  return (
    <Card className="p-5">
      <div className="mb-2">
        <h3 className="text-sm font-medium text-slate-200">{titulo}</h3>
        <p className="text-xs text-slate-500">tempo em primeiro plano no período</p>
      </div>

      {total === 0 ? (
        <div className="flex h-[288px] items-center justify-center text-center text-sm text-slate-500">
          Sem uso registrado no período
        </div>
      ) : (
        <div className="flex flex-col items-center gap-5 xl:flex-row">
          <div className="relative h-[200px] w-[200px] shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={dados}
                  dataKey="minutos"
                  nameKey="nome"
                  innerRadius={62}
                  outerRadius={92}
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
              <span className="text-xl font-semibold text-slate-100">
                {formatarHoras(total)}
              </span>
              <span className="text-xs text-slate-500">total</span>
            </div>
          </div>

          <ul className="w-full space-y-2">
            {dados.map((d) => {
              const pct = (d.minutos / total) * 100;
              return (
                <li key={d.nome} className="flex items-center gap-2.5 text-sm">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: d.cor }}
                  />
                  <span className="min-w-0 flex-1 truncate text-slate-300" title={d.nome}>
                    {d.nome}
                  </span>
                  {!d.tipo && (
                    <Badge variante="neutro" className="hidden shrink-0 sm:inline-flex">
                      sem categoria
                    </Badge>
                  )}
                  <span className="w-10 shrink-0 text-right text-xs text-slate-500">
                    {formatarPorcentagem(pct, 0)}
                  </span>
                  <span className="w-16 shrink-0 text-right text-slate-400">
                    {formatarHoras(d.minutos)}
                  </span>
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
  const fatia = p.payload as FatiaDistribuicao;
  const pct = total > 0 ? (p.value / total) * 100 : 0;

  return (
    <div className="rounded-lg border border-borda bg-fundo-cartao/95 px-3 py-2 text-xs shadow-glow backdrop-blur">
      <p className="flex items-center gap-2 text-slate-200">
        <span className="h-2 w-2 rounded-full" style={{ background: fatia.cor }} />
        {p.name}
      </p>
      <p className="mt-1 text-slate-400">
        {formatarHoras(p.value)} · {formatarPorcentagem(pct, 1)}
      </p>
      <p className="mt-0.5 text-slate-500">
        {ROTULOS_TIPO[fatia.tipo ?? "SEM"]} · {fatia.pessoas}{" "}
        {fatia.pessoas === 1 ? "pessoa" : "pessoas"}
      </p>
    </div>
  );
}
