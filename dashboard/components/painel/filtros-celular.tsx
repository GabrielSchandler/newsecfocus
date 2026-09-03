"use client";

import { useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, RotateCcw, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { FolhaInferior } from "@/components/ui/folha-inferior";
import { cn } from "@/lib/utils";
import { criarPeriodo, diaNoFuso, ehPeriodoAtual, navegar, PRESETS } from "@/lib/periodos";
import type { Colaborador, Dispositivo, Equipe, Escopo, Periodo, PresetPeriodo } from "@/lib/tipos";

interface Props {
  periodo: Periodo;
  escopo: Escopo;
  fuso: string;
  equipes: Equipe[];
  colaboradores: Colaborador[];
  dispositivos: Dispositivo[];
  mostrarEquipe: boolean;
  mostrarColaborador: boolean;
  mostrarDispositivo: boolean;
  aoMudarPeriodo: (periodo: Periodo) => void;
  aoAplicar: (mudancas: Record<string, string | null>) => void;
}

/**
 * Filtros do celular: uma faixa de uma linha, e o resto numa folha.
 *
 * No desktop o painel de filtros é um cartão com tudo à vista, e isso está
 * certo lá. No celular o mesmo cartão comia quase uma tela inteira antes de
 * qualquer número aparecer — a pessoa abria o painel e via filtro, não dado.
 *
 * Aqui fica só o que se usa o tempo todo: o período atual e as setas para
 * andar no tempo, que é a ação mais repetida e resolve sem abrir nada. O resto
 * (presets e recortes) mora na folha, a um toque.
 */
export function FiltrosCelular({
  periodo,
  escopo,
  fuso,
  equipes,
  colaboradores,
  dispositivos,
  mostrarEquipe,
  mostrarColaborador,
  mostrarDispositivo,
  aoMudarPeriodo,
  aoAplicar,
}: Props) {
  const [aberta, setAberta] = useState(false);
  const [de, setDe] = useState(() => diaNoFuso(new Date(periodo.inicio), fuso));
  const [ate, setAte] = useState(() =>
    diaNoFuso(new Date(new Date(periodo.fim).getTime() - 1000), fuso),
  );

  const recortes = [escopo.equipeId, escopo.colaboradorId, escopo.dispositivoId].filter(
    Boolean,
  ).length;
  const noPresente = ehPeriodoAtual(periodo);
  const temEscopo = mostrarEquipe || mostrarColaborador || mostrarDispositivo;

  const pessoasVisiveis = escopo.equipeId
    ? colaboradores.filter((c) => c.team_id === escopo.equipeId)
    : colaboradores;

  function escolherPreset(preset: PresetPeriodo) {
    aoMudarPeriodo(
      preset === "personalizado"
        ? criarPeriodo("personalizado", fuso, { de, ate })
        : criarPeriodo(preset, fuso),
    );
  }

  function aplicarIntervalo(novoDe: string, novoAte: string) {
    if (!novoDe || !novoAte) return;
    const [inicio, fim] = novoDe <= novoAte ? [novoDe, novoAte] : [novoAte, novoDe];
    aoMudarPeriodo(criarPeriodo("personalizado", fuso, { de: inicio, ate: fim }));
  }

  return (
    <div className="lg:hidden">
      <div className="flex items-center gap-2 rounded-xl2 border border-borda vidro p-1.5">
        <button
          type="button"
          aria-label="Período anterior"
          disabled={periodo.preset === "geral"}
          onClick={() => aoMudarPeriodo(navegar(periodo, -1, fuso))}
          className="toque-afunda flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-slate-400 active:bg-slate-800/60 disabled:opacity-30"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>

        <button
          type="button"
          onClick={() => setAberta(true)}
          className="toque-afunda flex min-w-0 flex-1 flex-col items-center justify-center rounded-lg px-2 py-1 active:bg-slate-800/60"
        >
          <span className="flex items-center gap-1.5 text-sm font-medium text-slate-100">
            <CalendarDays className="h-3.5 w-3.5 shrink-0 text-cyan-400" />
            <span className="truncate">{periodo.rotulo}</span>
          </span>
          <span className="text-[10px] uppercase tracking-wide text-slate-500">
            tocar para filtrar
          </span>
        </button>

        <button
          type="button"
          aria-label="Próximo período"
          disabled={noPresente || periodo.preset === "geral"}
          onClick={() => aoMudarPeriodo(navegar(periodo, 1, fuso))}
          className="toque-afunda flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-slate-400 active:bg-slate-800/60 disabled:opacity-30"
        >
          <ChevronRight className="h-5 w-5" />
        </button>

        {temEscopo && (
          <button
            type="button"
            aria-label="Filtros"
            onClick={() => setAberta(true)}
            className={cn(
              "toque-afunda relative flex h-10 w-10 shrink-0 items-center justify-center rounded-lg active:bg-slate-800/60",
              recortes > 0 ? "text-cyan-300" : "text-slate-400",
            )}
          >
            <SlidersHorizontal className="h-[18px] w-[18px]" />
            {recortes > 0 && (
              <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-cyan-500 px-1 text-[10px] font-semibold text-slate-950">
                {recortes}
              </span>
            )}
          </button>
        )}
      </div>

      <FolhaInferior
        aberta={aberta}
        aoFechar={() => setAberta(false)}
        titulo="Filtros"
        rodape={
          <div className="flex gap-2">
            {(recortes > 0 || periodo.preset !== "dia") && (
              <Button
                variante="contorno"
                className="flex-1"
                onClick={() => {
                  aoAplicar({ equipe: null, colaborador: null, dispositivo: null });
                  aoMudarPeriodo(criarPeriodo("dia", fuso));
                }}
              >
                <RotateCcw className="h-4 w-4" />
                Limpar
              </Button>
            )}
            <Button className="flex-1" onClick={() => setAberta(false)}>
              Ver resultados
            </Button>
          </div>
        }
      >
        <section className="pb-2">
          <h3 className="text-xs font-medium uppercase tracking-wide text-slate-500">Período</h3>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {PRESETS.map((p) => (
              <button
                key={p.valor}
                type="button"
                onClick={() => escolherPreset(p.valor)}
                aria-pressed={periodo.preset === p.valor}
                className={cn(
                  "toque-afunda rounded-xl border px-2 py-3 text-sm font-medium transition-colors",
                  periodo.preset === p.valor
                    ? "border-cyan-500/40 bg-cyan-500/15 text-cyan-300"
                    : "border-borda bg-fundo-suave text-slate-400",
                )}
              >
                {p.rotulo}
              </button>
            ))}
          </div>

          {periodo.preset !== "geral" && (
            <div className="mt-3 flex items-center gap-2 rounded-xl border border-borda bg-fundo-suave p-1.5">
              <button
                type="button"
                aria-label="Período anterior"
                onClick={() => aoMudarPeriodo(navegar(periodo, -1, fuso))}
                className="toque-afunda flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 active:bg-slate-800/60"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <span className="flex-1 truncate text-center text-sm font-medium text-slate-100">
                {periodo.rotulo}
              </span>
              <button
                type="button"
                aria-label="Próximo período"
                disabled={noPresente}
                onClick={() => aoMudarPeriodo(navegar(periodo, 1, fuso))}
                className="toque-afunda flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 active:bg-slate-800/60 disabled:opacity-30"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>
          )}

          {periodo.preset === "personalizado" && (
            <div className="mt-3 grid grid-cols-2 gap-2">
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
                />
              </label>
            </div>
          )}
        </section>

        {temEscopo && (
          <section className="mt-5 space-y-3 border-t border-borda pt-4">
            <h3 className="text-xs font-medium uppercase tracking-wide text-slate-500">Recorte</h3>

            {mostrarEquipe && (
              <label className="flex flex-col gap-1.5">
                <span className="text-xs text-slate-400">Equipe</span>
                <Select
                  aria-label="Equipe"
                  valor={escopo.equipeId ?? "todos"}
                  aoMudar={(v) =>
                    aoAplicar({ equipe: v === "todos" ? null : v, colaborador: null })
                  }
                  opcoes={[
                    { valor: "todos", rotulo: "Todas as equipes" },
                    ...equipes.map((e) => ({
                      valor: e.id,
                      rotulo: e.total_pessoas ? `${e.nome} (${e.total_pessoas})` : e.nome,
                    })),
                  ]}
                />
              </label>
            )}

            {mostrarColaborador && (
              <label className="flex flex-col gap-1.5">
                <span className="text-xs text-slate-400">Colaborador</span>
                <Select
                  aria-label="Colaborador"
                  valor={escopo.colaboradorId ?? "todos"}
                  aoMudar={(v) => aoAplicar({ colaborador: v === "todos" ? null : v })}
                  opcoes={[
                    { valor: "todos", rotulo: "Todos os colaboradores" },
                    ...pessoasVisiveis.map((c) => ({ valor: c.id, rotulo: c.nome ?? c.os_user })),
                  ]}
                />
              </label>
            )}

            {mostrarDispositivo && (
              <label className="flex flex-col gap-1.5">
                <span className="text-xs text-slate-400">Dispositivo</span>
                <Select
                  aria-label="Dispositivo"
                  valor={escopo.dispositivoId ?? "todos"}
                  aoMudar={(v) => aoAplicar({ dispositivo: v === "todos" ? null : v })}
                  opcoes={[
                    { valor: "todos", rotulo: "Todos os dispositivos" },
                    ...dispositivos.map((d) => ({ valor: d.id, rotulo: d.machine_name })),
                  ]}
                />
              </label>
            )}
          </section>
        )}
      </FolhaInferior>
    </div>
  );
}
