"use client";

import { LineChart as IconeLinha } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatarPorcentagemEnxuta } from "@/lib/formato";
import { CORES_EXPEDIENTE } from "@/lib/cores-expediente";
import type { PontoEvolucao } from "@/lib/visao-geral";

const COR_ANTERIOR = "#9aa5b4";

/**
 * O índice do expediente ao longo do período, com o período anterior tracejado
 * ao lado. Responde "está melhorando?" sem o gestor precisar trocar de período
 * e comparar de cabeça.
 */
export function GraficoEvolucaoIndice({
  pontos,
  descricao,
  temAnterior,
  erro,
  className,
}: {
  pontos: PontoEvolucao[];
  descricao: string;
  temAnterior: boolean;
  erro?: string | null;
  className?: string;
}) {
  const vazio = pontos.every((p) => p.atual === null && p.anterior === null);

  return (
    <Card className={cn("flex flex-col p-5 sm:px-6", className)}>
      <div className="flex items-start gap-3">
        <IconeLinha className="mt-0.5 h-6 w-6 shrink-0 text-acao" strokeWidth={1.75} />
        <div>
          <h3 className="text-[17px] font-semibold text-slate-900">Evolução do tempo produtivo</h3>
          <p className="mt-0.5 text-sm text-slate-500">{descricao} · média por pessoa, % do expediente</p>
        </div>
      </div>

      {erro ? (
        <div className="flex h-[210px] flex-col items-center justify-center gap-1 px-6 text-center">
          <p className="text-sm text-slate-700">Não foi possível carregar a evolução</p>
          <p className="break-words text-xs text-slate-500">{erro}</p>
        </div>
      ) : vazio ? (
        <div className="flex h-[210px] flex-col items-center justify-center gap-1 text-center">
          <p className="text-sm text-slate-600">Sem expediente registrado nesta janela</p>
          <p className="text-xs text-slate-500">A linha aparece a partir do primeiro dia com expediente.</p>
        </div>
      ) : (
        <>
          <div className="mt-4 h-[210px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={pontos} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
                <CartesianGrid stroke="#e8ecf2" vertical={false} />
                <XAxis
                  dataKey="rotulo"
                  stroke="#64748b"
                  fontSize={12}
                  tickLine={false}
                  axisLine={{ stroke: "#cbd5e1" }}
                  minTickGap={20}
                  dy={6}
                />
                <YAxis
                  stroke="#64748b"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  width={48}
                  domain={[0, 100]}
                  ticks={[0, 25, 50, 75, 100]}
                  tickFormatter={(v: number) => `${v}%`}
                />
                <Tooltip content={<Dica />} cursor={{ stroke: "#cbd5e1" }} />
                {temAnterior && (
                  <Line
                    type="linear"
                    dataKey="anterior"
                    name="Período anterior"
                    stroke={COR_ANTERIOR}
                    strokeWidth={1.75}
                    strokeDasharray="5 4"
                    dot={{ r: 3, fill: COR_ANTERIOR, strokeWidth: 0 }}
                    activeDot={{ r: 4 }}
                    connectNulls
                    isAnimationActive={false}
                  />
                )}
                <Line
                  type="linear"
                  dataKey="atual"
                  name="Período atual"
                  stroke={CORES_EXPEDIENTE.produtivos}
                  strokeWidth={2.25}
                  dot={{ r: 3.5, fill: CORES_EXPEDIENTE.produtivos, strokeWidth: 0 }}
                  activeDot={{ r: 5 }}
                  connectNulls
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-center gap-x-8 gap-y-2 text-[13px] text-slate-600">
            {/* Legenda das duas linhas; a regra de cobertura vai logo abaixo. */}
            <span className="flex items-center gap-2">
              <svg width="30" height="10" aria-hidden>
                <line x1="0" y1="5" x2="30" y2="5" stroke={CORES_EXPEDIENTE.produtivos} strokeWidth="2.25" />
                <circle cx="15" cy="5" r="3.5" fill={CORES_EXPEDIENTE.produtivos} />
              </svg>
              Período atual
            </span>
            {temAnterior && (
              <span className="flex items-center gap-2">
                <svg width="30" height="10" aria-hidden>
                  <line x1="0" y1="5" x2="30" y2="5" stroke={COR_ANTERIOR} strokeWidth="1.75" strokeDasharray="5 4" />
                  <circle cx="15" cy="5" r="3" fill={COR_ANTERIOR} />
                </svg>
                Período anterior
              </span>
            )}
          </div>
          <p className="mt-2 text-center text-xs text-slate-500">
            Dias com menos de 50% de cobertura ficam fora da linha: a queda seria falta de dado, não de trabalho.
          </p>
        </>
      )}
    </Card>
  );
}

function Dica({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const ponto = payload[0]?.payload as PontoEvolucao | undefined;
  if (!ponto) return null;

  return (
    <div className="rounded-lg border border-borda bg-white px-3 py-2 text-xs shadow-menu">
      <p className="mb-1.5 font-medium text-slate-800">{ponto.rotuloCompleto}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} className="flex items-center gap-2 text-slate-600">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
          {p.name}:{" "}
          <span className="numeros-tabulares font-medium text-slate-900">
            {p.value === null || p.value === undefined ? "sem expediente" : formatarPorcentagemEnxuta(p.value)}
          </span>
        </p>
      ))}
    </div>
  );
}
