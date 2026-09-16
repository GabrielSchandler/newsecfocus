"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarDays, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { SeletorPeriodo } from "./seletor-periodo";
import type { Periodo } from "@/lib/tipos";

interface Props {
  periodo: Periodo;
  fuso: string;
  /** "01 – 16 set. 2026" — calculado no servidor, para não divergir na hidratação. */
  rotulo: string;
  aoMudar: (periodo: Periodo) => void;
}

/**
 * Período num botão só, com o seletor completo num painel que abre embaixo.
 *
 * No topo da Visão geral o espaço é de uma linha: o botão mostra o intervalo
 * que os números cobrem de fato, e presets, setas e intervalo livre ficam a um
 * clique. O painel não fecha ao escolher, porque andar para trás e para frente
 * nas setas é justamente o uso repetido.
 */
export function SeletorPeriodoCompacto({ periodo, fuso, rotulo, aoMudar }: Props) {
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    function aoClicarFora(evento: MouseEvent) {
      if (caixa.current && !caixa.current.contains(evento.target as Node)) setAberto(false);
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

  return (
    <div className="relative" ref={caixa}>
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        aria-haspopup="dialog"
        className={cn(
          "flex h-11 items-center gap-3 rounded-lg border bg-white pl-3.5 pr-3 text-[15px] text-slate-900 transition-colors",
          aberto ? "border-acao/60 ring-2 ring-acao/15" : "border-borda hover:border-slate-300",
        )}
      >
        <CalendarDays className="h-[18px] w-[18px] text-slate-600" />
        <span className="numeros-tabulares whitespace-nowrap">{rotulo}</span>
        <ChevronDown className={cn("h-4 w-4 text-slate-500 transition-transform", aberto && "rotate-180")} />
      </button>

      {aberto && (
        <div
          role="dialog"
          aria-label="Escolher período"
          className="absolute right-0 z-30 mt-2 w-max max-w-[calc(100vw-2rem)] rounded-xl2 border border-borda bg-white p-4 shadow-menu"
        >
          <SeletorPeriodo periodo={periodo} fuso={fuso} aoMudar={aoMudar} />
        </div>
      )}
    </div>
  );
}
