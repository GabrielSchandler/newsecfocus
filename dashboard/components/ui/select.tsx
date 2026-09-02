import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface OpcaoSelect {
  valor: string;
  rotulo: string;
}

interface SelectProps {
  valor: string;
  aoMudar: (valor: string) => void;
  opcoes: OpcaoSelect[];
  className?: string;
  "aria-label"?: string;
}

/** Select nativo estilizado — leve, acessível e sem dependência de portal. */
export function Select({ valor, aoMudar, opcoes, className, ...resto }: SelectProps) {
  return (
    <div className={cn("relative", className)}>
      <select
        value={valor}
        onChange={(e) => aoMudar(e.target.value)}
        className="w-full appearance-none rounded-lg border border-borda bg-fundo-suave px-3 py-2 pr-9 text-sm text-slate-200 outline-none transition-colors hover:border-slate-600 focus:border-cyan-500/60 focus:ring-2 focus:ring-cyan-500/20"
        {...resto}
      >
        {opcoes.map((o) => (
          <option key={o.valor} value={o.valor} className="bg-fundo-cartao">
            {o.rotulo}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
    </div>
  );
}
