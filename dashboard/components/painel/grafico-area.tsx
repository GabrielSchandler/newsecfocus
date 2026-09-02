"use client";

import { useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { CORES_TIPO, formatarHoras, formatarPorcentagem } from "@/lib/formato";
import type { PontoSerie } from "@/lib/tipos";

type Visao = "composicao" | "indice";

interface Props {
  dados: PontoSerie[];
  titulo?: string;
  subtitulo?: string;
}

/**
 * Curva do período em duas visões:
 *   • Composição — minutos empilhados por categoria (leitura de volume);
 *   • Índice — a linha do índice de produtividade (leitura de qualidade).
 *
 * São perguntas diferentes: "trabalhou quanto?" e "trabalhou em quê?". Separar
 * evita o gráfico de sete séries que ninguém lê.
 */
export function GraficoArea({
  dados,
  titulo = "Produtividade ao longo do período",
  subtitulo,
}: Props) {
  const [visao, setVisao] = useState<Visao>("composicao");

  const vazio =
    dados.length === 0 ||
    dados.every((d) => d.ativo + d.ocioso === 0);

  return (
    <Card className="p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium text-slate-200">{titulo}</h3>
          <p className="text-xs text-slate-500">
            {subtitulo ?? (visao === "composicao" ? "minutos por categoria" : "% de tempo produtivo")}
          </p>
        </div>

        <div className="flex gap-1 rounded-lg border border-borda bg-fundo-suave p-1">
          {(
            [
              ["composicao", "Composição"],
              ["indice", "Índice"],
            ] as const
          ).map(([valor, rotulo]) => (
            <button
              key={valor}
              type="button"
              onClick={() => setVisao(valor)}
              aria-pressed={visao === valor}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                visao === valor
                  ? "bg-cyan-500/15 text-cyan-300"
                  : "text-slate-400 hover:text-slate-200",
              )}
            >
              {rotulo}
            </button>
          ))}
        </div>
      </div>

      {vazio ? (
        <EstadoVazio />
      ) : visao === "composicao" ? (
        <ResponsiveContainer width="100%" height={288}>
          <AreaChart data={dados} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
            <defs>
              <Gradiente id="gProd" cor={CORES_TIPO.PRODUCTIVE} />
              <Gradiente id="gNeutro" cor={CORES_TIPO.NEUTRAL} />
              <Gradiente id="gImprod" cor={CORES_TIPO.UNPRODUCTIVE} />
              <Gradiente id="gOcioso" cor="#64748b" />
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
            <EixoX />
            <EixoY />
            <Tooltip content={<TooltipCustom />} cursor={{ stroke: "#334155" }} />
            <Area
              type="monotone" dataKey="produtivo" name="Produtivo" stackId="1"
              stroke={CORES_TIPO.PRODUCTIVE} strokeWidth={2} fill="url(#gProd)"
            />
            <Area
              type="monotone" dataKey="neutro" name="Neutro" stackId="1"
              stroke={CORES_TIPO.NEUTRAL} strokeWidth={2} fill="url(#gNeutro)"
            />
            <Area
              type="monotone" dataKey="improdutivo" name="Improdutivo" stackId="1"
              stroke={CORES_TIPO.UNPRODUCTIVE} strokeWidth={2} fill="url(#gImprod)"
            />
            <Area
              type="monotone" dataKey="ocioso" name="Ocioso" stackId="1"
              stroke="#64748b" strokeWidth={2} fill="url(#gOcioso)"
            />
          </AreaChart>
        </ResponsiveContainer>
      ) : (
        <ResponsiveContainer width="100%" height={288}>
          <ComposedChart data={dados} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
            <EixoX />
            <YAxis
              stroke="#475569" fontSize={11} tickLine={false} axisLine={false}
              width={44} domain={[0, 100]} unit="%"
            />
            <Tooltip content={<TooltipIndice />} cursor={{ stroke: "#334155" }} />
            <Line
              type="monotone" dataKey="indice" name="Índice"
              stroke={CORES_TIPO.PRODUCTIVE} strokeWidth={2.5}
              dot={{ r: 2.5, fill: CORES_TIPO.PRODUCTIVE }}
              activeDot={{ r: 5 }} connectNulls
            />
          </ComposedChart>
        </ResponsiveContainer>
      )}

      {!vazio && visao === "composicao" && <Legenda />}
    </Card>
  );
}

function EixoX() {
  return (
    <XAxis
      dataKey="rotulo"
      stroke="#475569"
      fontSize={11}
      tickLine={false}
      axisLine={false}
      minTickGap={16}
    />
  );
}

function EixoY() {
  return (
    <YAxis
      stroke="#475569"
      fontSize={11}
      tickLine={false}
      axisLine={false}
      width={44}
      tickFormatter={(v: number) => (v >= 120 ? `${Math.round(v / 60)}h` : `${v}m`)}
    />
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
    { cor: CORES_TIPO.PRODUCTIVE, nome: "Produtivo" },
    { cor: CORES_TIPO.NEUTRAL, nome: "Neutro" },
    { cor: CORES_TIPO.UNPRODUCTIVE, nome: "Improdutivo" },
    { cor: "#64748b", nome: "Ocioso" },
  ];
  return (
    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
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
  const total = payload.reduce((s: number, p: any) => s + (p.value ?? 0), 0);

  return (
    <div className="rounded-lg border border-borda bg-fundo-cartao/95 px-3 py-2 text-xs shadow-glow backdrop-blur">
      <p className="mb-1.5 font-medium text-slate-300">{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} className="flex items-center gap-2 text-slate-400">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
          {p.name}: <span className="text-slate-200">{formatarHoras(p.value)}</span>
        </p>
      ))}
      <p className="mt-1.5 border-t border-borda pt-1.5 text-slate-500">
        total: <span className="text-slate-300">{formatarHoras(total)}</span>
      </p>
    </div>
  );
}

function TooltipIndice({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const valor = payload[0]?.value;

  return (
    <div className="rounded-lg border border-borda bg-fundo-cartao/95 px-3 py-2 text-xs shadow-glow backdrop-blur">
      <p className="mb-1 font-medium text-slate-300">{label}</p>
      <p className="text-slate-400">
        Índice:{" "}
        <span className="text-slate-100">
          {valor === null || valor === undefined ? "sem classificação" : formatarPorcentagem(valor, 1)}
        </span>
      </p>
    </div>
  );
}

function EstadoVazio() {
  return (
    <div className="flex h-[288px] flex-col items-center justify-center gap-2 text-center">
      <p className="text-sm text-slate-400">Sem atividade registrada no período</p>
      <p className="text-xs text-slate-600">
        Os dados aparecem aqui assim que os agentes sincronizarem.
      </p>
    </div>
  );
}
