"use client";

import { useMemo } from "react";
import { Activity } from "lucide-react";
import { formatarHoras } from "@/lib/formato";
import type { PontoRitmo } from "@/lib/tipos";

/**
 * Ritmo do dia: quando o time rende. Duas leituras da mesma base:
 *   • curva por hora (0–23) — o pico e a queda do dia (almoço, fim de tarde);
 *   • mapa de calor semana × hora — os dias e horários mais quentes.
 *
 * A parte cheia da barra é o tempo PRODUTIVO; o restante é o ativo não
 * produtivo. É o que separa "muita gente online" de "muita gente rendendo".
 */

const DIAS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

function hhLabel(h: number): string {
  return `${String(h).padStart(2, "0")}h`;
}

export function SecaoRitmo({ dados }: { dados: PontoRitmo[] }) {
  const { horas, maxHora, mapa, maxCelula, temDado } = useMemo(() => {
    const horas = Array.from({ length: 24 }, () => ({ ativo: 0, produtivo: 0 }));
    // mapa[dow 0..6][hora 0..23] = minutos ativos
    const mapa = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
    let maxHora = 0;
    let maxCelula = 0;

    for (const p of dados) {
      const h = p.hora;
      const dow = p.diaSemana - 1; // isodow 1..7 -> 0..6
      if (h < 0 || h > 23 || dow < 0 || dow > 6) continue;
      horas[h].ativo += p.minutosAtivos;
      horas[h].produtivo += p.minutosProdutivos;
      mapa[dow][h] += p.minutosAtivos;
      maxHora = Math.max(maxHora, horas[h].ativo);
      maxCelula = Math.max(maxCelula, mapa[dow][h]);
    }
    return { horas, maxHora, mapa, maxCelula, temDado: dados.length > 0 };
  }, [dados]);

  // Só desenha as horas dentro da faixa com atividade, para a curva não ficar
  // espremida por causa das madrugadas vazias.
  const [hIni, hFim] = useMemo(() => {
    let ini = 24;
    let fim = 0;
    horas.forEach((v, h) => {
      if (v.ativo > 0) {
        ini = Math.min(ini, h);
        fim = Math.max(fim, h);
      }
    });
    if (ini > fim) return [8, 18];
    return [Math.max(0, ini - 1), Math.min(23, fim + 1)];
  }, [horas]);

  return (
    <div className="space-y-5">
      <section className="rounded-xl2 border border-borda vidro p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-cyan-400" />
            <h3 className="text-sm font-medium text-slate-200">Ritmo por hora do dia</h3>
          </div>
          <div className="flex items-center gap-3 text-[11px] text-slate-500">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: "#22d3ee" }} />
              Produtivo
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-slate-700" />
              Ativo (demais)
            </span>
          </div>
        </div>

        {!temDado ? (
          <p className="mt-6 rounded-lg border border-dashed border-borda py-8 text-center text-xs text-slate-500">
            Sem atividade no período para calcular o ritmo.
          </p>
        ) : (
          <div className="mt-4 flex items-end gap-1" style={{ height: 140 }}>
            {Array.from({ length: hFim - hIni + 1 }, (_, i) => hIni + i).map((h) => {
              const v = horas[h];
              const altura = maxHora > 0 ? (v.ativo / maxHora) * 100 : 0;
              const pctProd = v.ativo > 0 ? (v.produtivo / v.ativo) * 100 : 0;
              return (
                <div key={h} className="flex flex-1 flex-col items-center gap-1">
                  <div
                    className="relative flex w-full items-end justify-center overflow-hidden rounded-t bg-slate-800/50"
                    style={{ height: `${Math.max(2, altura)}%`, minHeight: v.ativo > 0 ? 3 : 0 }}
                    title={`${hhLabel(h)} · ${formatarHoras(v.ativo)} ativos · ${formatarHoras(v.produtivo)} produtivos`}
                  >
                    <div className="absolute inset-x-0 top-0 h-full bg-slate-700" />
                    <div
                      className="absolute inset-x-0 bottom-0"
                      style={{ height: `${pctProd}%`, background: "#22d3ee" }}
                    />
                  </div>
                  <span className="text-[9px] tabular-nums text-slate-600">
                    {h % 3 === 0 ? h : ""}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {temDado && (
        <section className="rounded-xl2 border border-borda vidro p-5">
          <h3 className="text-sm font-medium text-slate-200">Mapa de calor — semana × hora</h3>
          <p className="text-xs text-slate-500">tempo ativo; quanto mais claro, mais quente</p>

          <div className="mt-4 overflow-x-auto">
            <div className="min-w-[520px]">
              {/* Régua de horas */}
              <div className="mb-1 flex pl-9">
                {Array.from({ length: hFim - hIni + 1 }, (_, i) => hIni + i).map((h) => (
                  <span key={h} className="flex-1 text-center text-[9px] tabular-nums text-slate-600">
                    {h % 3 === 0 ? h : ""}
                  </span>
                ))}
              </div>
              {DIAS.map((nome, dow) => (
                <div key={nome} className="flex items-center">
                  <span className="w-9 shrink-0 text-[10px] text-slate-500">{nome}</span>
                  <div className="flex flex-1 gap-0.5">
                    {Array.from({ length: hFim - hIni + 1 }, (_, i) => hIni + i).map((h) => {
                      const v = mapa[dow][h];
                      const intensidade = maxCelula > 0 ? v / maxCelula : 0;
                      return (
                        <span
                          key={h}
                          className="h-4 flex-1 rounded-[2px]"
                          style={{
                            // De transparente (frio) a ciano (quente).
                            background:
                              v === 0
                                ? "rgba(148,163,184,0.06)"
                                : `rgba(34,211,238,${0.12 + intensidade * 0.85})`,
                          }}
                          title={`${nome} ${hhLabel(h)} · ${formatarHoras(v)} ativos`}
                        />
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
