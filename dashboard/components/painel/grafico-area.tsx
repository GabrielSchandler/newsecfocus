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
import {
  CORES_TIPO,
  ROTULO_BUCKET,
  formatarHoras,
  formatarPorcentagem,
  rotuloCompletoDoBalde,
} from "@/lib/formato";
import type { BucketSerie, PontoSerie } from "@/lib/tipos";


interface Props {
  dados: PontoSerie[];
  /** Granularidade de cada ponto — vira o "hora a hora" do subtítulo. */
  bucket: BucketSerie;
  /** Fuso da empresa, para o tooltip nomear o ponto no horário certo. */
  fuso: string;
  /** Nome do recorte ("Hoje", "Setembro de 2026"), para o gráfico se situar. */
  periodoRotulo: string;
  titulo?: string;
  subtitulo?: string;
}

/**
 * Minutos por categoria ao longo do período (produtivo, neutro, improdutivo e
 * ocioso+bloqueado). O índice ao longo do tempo mora no gráfico de evolução
 * da Visão geral, que usa a régua do expediente — esta série é só volume.
 */
export function GraficoArea({
  dados,
  bucket,
  fuso,
  periodoRotulo,
  titulo = "Produtividade ao longo do período",
  subtitulo,
}: Props) {

  const vazio =
    dados.length === 0 ||
    dados.every((d) => d.ativo + d.ocioso === 0);

  // Sem isto o eixo dizia só "14h" ou "03/09" e não havia como saber de que
  // recorte era, nem se cada ponto valia uma hora, um dia ou uma semana.
  const legendaEixo = `${periodoRotulo} · ${ROTULO_BUCKET[bucket]}`;

  return (
    <Card className="p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium text-slate-800">{titulo}</h3>
          <p className="text-xs text-slate-500">
            {subtitulo ??
              `${legendaEixo} · minutos por categoria e estado`}
          </p>
        </div>
      </div>

      {vazio ? (
        <EstadoVazio />
      ) : (
        <div className="h-[232px] sm:h-[288px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={dados} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
            <defs>
              <Gradiente id="gProd" cor={CORES_TIPO.PRODUCTIVE} />
              <Gradiente id="gNeutro" cor={CORES_TIPO.NEUTRAL} />
              <Gradiente id="gImprod" cor={CORES_TIPO.UNPRODUCTIVE} />
              <Gradiente id="gOcioso" cor="#f2c14e" />
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#e8ecf2" vertical={false} />
            <EixoX />
            <EixoY />
            <Tooltip
              content={<TooltipCustom bucket={bucket} fuso={fuso} />}
              cursor={{ stroke: "#cbd5e1" }}
            />
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
              stroke="#f2c14e" strokeWidth={2} fill="url(#gOcioso)"
            />
          </AreaChart>
        </ResponsiveContainer>
        </div>
      )}

      {!vazio && <Legenda />}
    </Card>
  );
}

function EixoX() {
  return (
    <XAxis
      dataKey="rotulo"
      stroke="#64748b"
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
      stroke="#64748b"
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
    { cor: "#f2c14e", nome: "Ocioso ou bloqueado" },
  ];
  return (
    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
      {itens.map((i) => (
        <span key={i.nome} className="flex items-center gap-1.5 text-xs text-slate-600">
          <span className="h-2 w-2 rounded-full" style={{ background: i.cor }} />
          {i.nome}
        </span>
      ))}
    </div>
  );
}

/** Nome completo do ponto ("03/09, 14h às 15h") — o rótulo do eixo é curto demais. */
function rotuloDoPonto(payload: any, bucket: BucketSerie, fuso: string, fallback: string): string {
  const balde = payload?.[0]?.payload?.balde;
  return balde ? rotuloCompletoDoBalde(balde, bucket, fuso) : fallback;
}

function TooltipCustom({ active, payload, label, bucket, fuso }: any) {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((s: number, p: any) => s + (p.value ?? 0), 0);

  return (
    <div className="rounded-lg border border-borda bg-fundo-cartao/95 px-3 py-2 text-xs shadow-glow backdrop-blur">
      <p className="mb-1.5 font-medium text-slate-700">
        {rotuloDoPonto(payload, bucket, fuso, label)}
      </p>
      {payload.map((p: any) => (
        <p key={p.name} className="flex items-center gap-2 text-slate-600">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
          {p.name}: <span className="text-slate-800">{formatarHoras(p.value)}</span>
        </p>
      ))}
      <p className="mt-1.5 border-t border-borda pt-1.5 text-slate-500">
        total: <span className="text-slate-700">{formatarHoras(total)}</span>
      </p>
    </div>
  );
}

function EstadoVazio() {
  return (
    <div className="flex h-[232px] flex-col items-center justify-center gap-2 text-center sm:h-[288px]">
      <p className="text-sm text-slate-600">Sem atividade registrada no período</p>
      <p className="text-xs text-slate-500">
        Os dados aparecem aqui assim que os agentes sincronizarem.
      </p>
    </div>
  );
}
