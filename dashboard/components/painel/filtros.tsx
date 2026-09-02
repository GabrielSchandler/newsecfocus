"use client";

import { Search, SlidersHorizontal } from "lucide-react";
import { Select } from "@/components/ui/select";
import { rotuloPeriodo } from "@/lib/formato";
import type { Dispositivo, EstadoFiltros, PeriodoFiltro } from "@/lib/tipos";

interface Props {
  filtros: EstadoFiltros;
  aoMudar: (f: EstadoFiltros) => void;
  dispositivos: Dispositivo[];
}

/** Barra de filtros avançados: período, dispositivo/funcionário e busca rápida. */
export function Filtros({ filtros, aoMudar, dispositivos }: Props) {
  const opcoesPeriodo = (Object.keys(rotuloPeriodo) as PeriodoFiltro[]).map((p) => ({
    valor: p,
    rotulo: rotuloPeriodo[p],
  }));

  const opcoesDispositivo = [
    { valor: "todos", rotulo: "Todos os dispositivos" },
    ...dispositivos.map((d) => ({
      valor: d.id,
      rotulo: d.os_user ? `${d.machine_name} · ${d.os_user}` : d.machine_name,
    })),
  ];

  return (
    <div className="flex flex-col gap-3 rounded-xl2 border border-borda vidro p-3 sm:flex-row sm:items-center">
      <span className="flex items-center gap-2 px-1 text-xs font-medium uppercase tracking-wide text-slate-500">
        <SlidersHorizontal className="h-3.5 w-3.5" />
        Filtros
      </span>

      <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-3">
        <Select
          aria-label="Período"
          valor={filtros.periodo}
          opcoes={opcoesPeriodo}
          aoMudar={(v) => aoMudar({ ...filtros, periodo: v as PeriodoFiltro })}
        />
        <Select
          aria-label="Dispositivo"
          valor={filtros.dispositivoId}
          opcoes={opcoesDispositivo}
          aoMudar={(v) => aoMudar({ ...filtros, dispositivoId: v })}
        />
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            value={filtros.busca}
            onChange={(e) => aoMudar({ ...filtros, busca: e.target.value })}
            placeholder="Buscar estação, usuário, app…"
            className="w-full rounded-lg border border-borda bg-fundo-suave py-2 pl-9 pr-3 text-sm text-slate-200 outline-none transition-colors placeholder:text-slate-600 hover:border-slate-600 focus:border-cyan-500/60 focus:ring-2 focus:ring-cyan-500/20"
          />
        </div>
      </div>
    </div>
  );
}
