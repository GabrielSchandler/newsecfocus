"use client";

import { useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  criarPeriodo,
  diaNoFuso,
  ehPeriodoAtual,
  navegar,
  PRESETS,
} from "@/lib/periodos";
import type { Periodo, PresetPeriodo } from "@/lib/tipos";

interface Props {
  periodo: Periodo;
  fuso: string;
  aoMudar: (periodo: Periodo) => void;
}

/**
 * Seletor de período: presets (dia, semana, mês, ano, geral, personalizado),
 * setas para andar no tempo e, no modo personalizado, um intervalo livre.
 *
 * O rótulo no meio das setas é o que orienta o gestor — "Agosto de 2026", não
 * "últimos 30 dias", que nunca fecha um mês.
 */
export function SeletorPeriodo({ periodo, fuso, aoMudar }: Props) {
  const [abrirIntervalo, setAbrirIntervalo] = useState(periodo.preset === "personalizado");
  const [de, setDe] = useState(() => diaNoFuso(new Date(periodo.inicio), fuso));
  const [ate, setAte] = useState(() =>
    diaNoFuso(new Date(new Date(periodo.fim).getTime() - 1000), fuso),
  );

  function escolherPreset(preset: PresetPeriodo) {
    if (preset === "personalizado") {
      setAbrirIntervalo(true);
      aoMudar(criarPeriodo("personalizado", fuso, { de, ate }));
      return;
    }
    setAbrirIntervalo(false);
    aoMudar(criarPeriodo(preset, fuso));
  }

  function aplicarIntervalo(novoDe: string, novoAte: string) {
    if (!novoDe || !novoAte) return;
    // Datas invertidas: troca em vez de devolver um período vazio.
    const [inicio, fim] = novoDe <= novoAte ? [novoDe, novoAte] : [novoAte, novoDe];
    aoMudar(criarPeriodo("personalizado", fuso, { de: inicio, ate: fim }));
  }

  const noPresente = ehPeriodoAtual(periodo);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {/* Presets */}
        <div className="flex flex-wrap gap-1 rounded-lg border border-borda bg-fundo-suave p-1">
          {PRESETS.map((p) => (
            <button
              key={p.valor}
              type="button"
              onClick={() => escolherPreset(p.valor)}
              aria-pressed={periodo.preset === p.valor}
              className={cn(
                "rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
                periodo.preset === p.valor
                  ? "bg-cyan-500/15 text-cyan-300 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.25)]"
                  : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-200",
              )}
            >
              {p.rotulo}
            </button>
          ))}
        </div>

        {/* Navegação no tempo */}
        {periodo.preset !== "geral" && (
          <div className="flex items-center gap-1">
            <Button
              variante="contorno"
              tamanho="sm"
              aria-label="Período anterior"
              onClick={() => aoMudar(navegar(periodo, -1, fuso))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>

            <span className="min-w-[9rem] px-2 text-center text-sm font-medium text-slate-200">
              {periodo.rotulo}
            </span>

            <Button
              variante="contorno"
              tamanho="sm"
              aria-label="Próximo período"
              disabled={noPresente}
              onClick={() => aoMudar(navegar(periodo, 1, fuso))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}

        {periodo.preset === "geral" && (
          <span className="flex items-center gap-1.5 px-2 text-sm text-slate-400">
            <CalendarDays className="h-4 w-4 text-slate-500" />
            {periodo.rotulo}
          </span>
        )}
      </div>

      {/* Intervalo livre */}
      {abrirIntervalo && (
        <div className="flex flex-wrap items-end gap-2 rounded-lg border border-borda bg-fundo-suave/60 p-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-500">De</span>
            <Input
              type="date"
              value={de}
              max={ate}
              onChange={(e) => {
                setDe(e.target.value);
                aplicarIntervalo(e.target.value, ate);
              }}
              className="w-40"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-500">Até</span>
            <Input
              type="date"
              value={ate}
              min={de}
              onChange={(e) => {
                setAte(e.target.value);
                aplicarIntervalo(de, e.target.value);
              }}
              className="w-40"
            />
          </label>
        </div>
      )}
    </div>
  );
}
