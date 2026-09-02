"use client";

import { useEffect, useRef, useState } from "react";
import { Download, FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { periodoParaParams } from "@/lib/periodos";
import type { Escopo, Periodo, TipoRelatorio } from "@/lib/tipos";
import { RELATORIOS } from "@/lib/tipos";

interface Props {
  periodo: Periodo;
  escopo: Escopo;
  /** Relatórios oferecidos nesta tela. Padrão: todos. */
  tipos?: TipoRelatorio[];
  rotulo?: string;
}

/**
 * Menu de exportação. O arquivo é gerado no servidor (rota /api/relatorios) e
 * baixado pelo navegador — nada é montado no cliente, então relatório de mês
 * inteiro não trava a aba.
 */
export function BotaoExportar({
  periodo,
  escopo,
  tipos = ["diario", "colaboradores", "equipes", "aplicativos"],
  rotulo = "Exportar",
}: Props) {
  const [aberto, setAberto] = useState(false);
  const [baixando, setBaixando] = useState<string | null>(null);
  const caixa = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;

    function aoClicarFora(evento: MouseEvent) {
      if (caixa.current && !caixa.current.contains(evento.target as Node)) {
        setAberto(false);
      }
    }
    function aoTeclar(evento: KeyboardEvent) {
      if (evento.key === "Escape") setAberto(false);
    }

    document.addEventListener("mousedown", aoClicarFora);
    document.addEventListener("keydown", aoTeclar);
    return () => {
      document.removeEventListener("mousedown", aoClicarFora);
      document.removeEventListener("keydown", aoTeclar);
    };
  }, [aberto]);

  function montarUrl(tipo: TipoRelatorio, formato: "xlsx" | "csv") {
    const p = periodoParaParams(periodo);
    const params = new URLSearchParams({ tipo, formato, preset: p.preset, ancora: p.ancora });

    if (periodo.preset === "personalizado") {
      params.set("de", p.de);
      params.set("ate", p.ate);
    }
    if (escopo.orgId) params.set("empresa", escopo.orgId);
    if (escopo.equipeId) params.set("equipe", escopo.equipeId);
    if (escopo.colaboradorId) params.set("colaborador", escopo.colaboradorId);
    if (escopo.dispositivoId) params.set("dispositivo", escopo.dispositivoId);

    return `/api/relatorios?${params.toString()}`;
  }

  function baixar(tipo: TipoRelatorio, formato: "xlsx" | "csv") {
    setBaixando(`${tipo}-${formato}`);
    // Navegação direta: o Content-Disposition da rota cuida do download.
    window.location.href = montarUrl(tipo, formato);
    setTimeout(() => {
      setBaixando(null);
      setAberto(false);
    }, 1200);
  }

  return (
    <div className="relative" ref={caixa}>
      <Button
        variante="contorno"
        tamanho="sm"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        aria-haspopup="menu"
      >
        <Download className="h-3.5 w-3.5" />
        {rotulo}
      </Button>

      {aberto && (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-2 w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-xl2 border border-borda bg-fundo-cartao/95 shadow-glow backdrop-blur-md"
        >
          <p className="border-b border-borda px-4 py-2.5 text-xs text-slate-500">
            {periodo.rotulo}
          </p>

          <ul className="divide-y divide-slate-800/70">
            {tipos.map((tipo) => (
              <li key={tipo} className="px-4 py-3">
                <p className="text-sm font-medium text-slate-200">{RELATORIOS[tipo].titulo}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
                  {RELATORIOS[tipo].descricao}
                </p>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => baixar(tipo, "xlsx")}
                    disabled={baixando !== null}
                    className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-300 transition-colors hover:bg-emerald-500/20 disabled:opacity-50"
                  >
                    {baixando === `${tipo}-xlsx` ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <FileSpreadsheet className="h-3.5 w-3.5" />
                    )}
                    XLSX
                  </button>
                  <button
                    type="button"
                    onClick={() => baixar(tipo, "csv")}
                    disabled={baixando !== null}
                    className="inline-flex items-center gap-1.5 rounded-md border border-borda px-2.5 py-1 text-xs font-medium text-slate-300 transition-colors hover:bg-slate-800/60 disabled:opacity-50"
                  >
                    {baixando === `${tipo}-csv` ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <FileText className="h-3.5 w-3.5" />
                    )}
                    CSV
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
