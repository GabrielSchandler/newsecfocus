"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card } from "@/components/ui/card";
import { CORES_TIPO, formatarHoras, formatarPorcentagem } from "@/lib/formato";

export interface BarraComparativa {
  id: string;
  nome: string;
  produtivo: number;
  neutro: number;
  improdutivo: number;
  indice: number | null;
}

interface Props {
  dados: BarraComparativa[];
  titulo: string;
  subtitulo?: string;
  /** Altura mínima por barra, para a leitura não apertar com muitos itens. */
  alturaPorBarra?: number;
}

/**
 * Barras horizontais empilhadas: compara equipes ou pessoas pelo tempo, com a
 * composição visível dentro de cada barra. Horizontal porque nome de equipe e
 * de pessoa é longo — na vertical o rótulo vira texto girado ilegível.
 */
export function GraficoBarras({ dados, titulo, subtitulo, alturaPorBarra = 38 }: Props) {
  const vazio =
    dados.length === 0 ||
    dados.every((d) => d.produtivo + d.neutro + d.improdutivo === 0);

  const altura = Math.max(200, dados.length * alturaPorBarra + 48);

  return (
    <Card className="p-5">
      <div className="mb-4">
        <h3 className="text-sm font-medium text-slate-200">{titulo}</h3>
        {subtitulo && <p className="text-xs text-slate-500">{subtitulo}</p>}
      </div>

      {vazio ? (
        <div className="flex h-[200px] items-center justify-center text-sm text-slate-500">
          Sem dados suficientes para comparar no período
        </div>
      ) : (
        <div style={{ height: altura }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={dados}
              layout="vertical"
              margin={{ top: 0, right: 16, left: 0, bottom: 0 }}
              barCategoryGap={10}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={false} />
              <XAxis
                type="number"
                stroke="#475569"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v: number) => (v >= 120 ? `${Math.round(v / 60)}h` : `${v}m`)}
              />
              <YAxis
                type="category"
                dataKey="nome"
                stroke="#94a3b8"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                width={132}
              />
              <Tooltip content={<TooltipBarras />} cursor={{ fill: "rgba(30,41,59,0.4)" }} />
              <Bar dataKey="produtivo" name="Produtivo" stackId="a" fill={CORES_TIPO.PRODUCTIVE} radius={[0, 0, 0, 0]} />
              <Bar dataKey="neutro" name="Neutro" stackId="a" fill={CORES_TIPO.NEUTRAL} />
              <Bar dataKey="improdutivo" name="Improdutivo" stackId="a" fill={CORES_TIPO.UNPRODUCTIVE} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}

function TooltipBarras({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const item = payload[0]?.payload as BarraComparativa;
  const total = item.produtivo + item.neutro + item.improdutivo;

  return (
    <div className="rounded-lg border border-borda bg-fundo-cartao/95 px-3 py-2 text-xs shadow-glow backdrop-blur">
      <p className="mb-1.5 font-medium text-slate-200">{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} className="flex items-center gap-2 text-slate-400">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
          {p.name}: <span className="text-slate-200">{formatarHoras(p.value)}</span>
        </p>
      ))}
      <p className="mt-1.5 border-t border-borda pt-1.5 text-slate-500">
        total {formatarHoras(total)} · índice{" "}
        <span className="text-slate-300">
          {item.indice === null ? "—" : formatarPorcentagem(item.indice, 1)}
        </span>
      </p>
    </div>
  );
}
