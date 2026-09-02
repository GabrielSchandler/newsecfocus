"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card } from "@/components/ui/card";
import type { PontoSerieTemporal } from "@/lib/tipos";

/** Área empilhada: Ativo x Ocioso x Improdutivo ao longo do período. */
export function GraficoArea({ dados }: { dados: PontoSerieTemporal[] }) {
  const vazio = dados.length === 0 || dados.every((d) => d.ativo + d.ocioso + d.improdutivo === 0);

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-slate-200">Produtividade ao longo do tempo</h3>
          <p className="text-xs text-slate-500">minutos por faixa, empilhados</p>
        </div>
        <Legenda />
      </div>

      {vazio ? (
        <EstadoVazio />
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={dados} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
            <defs>
              <Gradiente id="gAtivo" cor="#22d3ee" />
              <Gradiente id="gOcioso" cor="#fbbf24" />
              <Gradiente id="gImprod" cor="#fb7185" />
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
            <XAxis
              dataKey="rotulo"
              stroke="#475569"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              minTickGap={16}
            />
            <YAxis stroke="#475569" fontSize={11} tickLine={false} axisLine={false} width={40} />
            <Tooltip content={<TooltipCustom />} />
            <Area
              type="monotone"
              dataKey="ativo"
              name="Ativo"
              stackId="1"
              stroke="#22d3ee"
              strokeWidth={2}
              fill="url(#gAtivo)"
            />
            <Area
              type="monotone"
              dataKey="ocioso"
              name="Ocioso"
              stackId="1"
              stroke="#fbbf24"
              strokeWidth={2}
              fill="url(#gOcioso)"
            />
            <Area
              type="monotone"
              dataKey="improdutivo"
              name="Improdutivo"
              stackId="1"
              stroke="#fb7185"
              strokeWidth={2}
              fill="url(#gImprod)"
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
}

function Gradiente({ id, cor }: { id: string; cor: string }) {
  return (
    <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor={cor} stopOpacity={0.4} />
      <stop offset="100%" stopColor={cor} stopOpacity={0.02} />
    </linearGradient>
  );
}

function Legenda() {
  const itens = [
    { cor: "#22d3ee", nome: "Ativo" },
    { cor: "#fbbf24", nome: "Ocioso" },
    { cor: "#fb7185", nome: "Improdutivo" },
  ];
  return (
    <div className="flex gap-3">
      {itens.map((i) => (
        <span key={i.nome} className="flex items-center gap-1.5 text-xs text-slate-400">
          <span className="h-2 w-2 rounded-full" style={{ background: i.cor }} />
          {i.nome}
        </span>
      ))}
    </div>
  );
}

function TooltipCustom({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-borda bg-fundo-cartao/95 px-3 py-2 text-xs shadow-glow backdrop-blur">
      <p className="mb-1 font-medium text-slate-300">{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} className="flex items-center gap-2 text-slate-400">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
          {p.name}: <span className="text-slate-200">{p.value} min</span>
        </p>
      ))}
    </div>
  );
}

function EstadoVazio() {
  return (
    <div className="flex h-[280px] flex-col items-center justify-center gap-2 text-center">
      <p className="text-sm text-slate-400">Sem atividade registrada no período</p>
      <p className="text-xs text-slate-600">
        Os dados aparecem aqui assim que os agentes sincronizarem.
      </p>
    </div>
  );
}
