"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { periodoParaParams } from "@/lib/periodos";
import type { Escopo, Periodo, TipoRelatorio } from "@/lib/tipos";

/**
 * Escolha do formato e download. O arquivo sai de /api/relatorios, que monta a
 * tabela com a mesma função da prévia desta tela.
 */
export function GerarRelatorio({
  tipo,
  periodo,
  escopo,
}: {
  tipo: TipoRelatorio;
  periodo: Periodo;
  escopo: Escopo;
}) {
  const [formato, setFormato] = useState<"xlsx" | "csv">("xlsx");
  const [baixando, setBaixando] = useState(false);

  function gerar() {
    const p = periodoParaParams(periodo);
    const q = new URLSearchParams({ tipo, formato, preset: p.preset, ancora: p.ancora });
    if (periodo.preset === "personalizado") {
      q.set("de", p.de);
      q.set("ate", p.ate);
    }
    if (escopo.orgId) q.set("empresa", escopo.orgId);
    if (escopo.equipeId) q.set("equipe", escopo.equipeId);
    if (escopo.colaboradorId) q.set("colaborador", escopo.colaboradorId);
    setBaixando(true);
    window.location.href = `/api/relatorios?${q.toString()}`;
    setTimeout(() => setBaixando(false), 1500);
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium text-slate-600">Formato</span>
        <select
          value={formato}
          onChange={(e) => setFormato(e.target.value as "xlsx" | "csv")}
          className="h-11 w-full rounded-lg border border-borda bg-white px-3 text-[15px] text-slate-900 outline-none focus:border-acao/60 focus:ring-2 focus:ring-acao/15 sm:w-44"
        >
          <option value="xlsx">XLSX (Excel)</option>
          <option value="csv">CSV (;)</option>
        </select>
      </label>
      <button
        type="button"
        onClick={gerar}
        disabled={baixando}
        className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-acao px-5 text-[15px] font-medium text-white hover:bg-acao-escuro disabled:opacity-60"
      >
        {baixando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
        Gerar relatório
      </button>
    </div>
  );
}
