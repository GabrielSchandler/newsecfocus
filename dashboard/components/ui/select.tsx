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
  /** Ícone à esquerda do texto (ex.: prédio no seletor de empresa). */
  icone?: React.ReactNode;
  /** Classes extras do <select> — altura e tamanho de fonte, por exemplo. */
  classeCampo?: string;
  "aria-label"?: string;
}

/** Select nativo estilizado — leve, acessível e sem dependência de portal. */
export function Select({
  valor,
  aoMudar,
  opcoes,
  className,
  icone,
  classeCampo,
  ...resto
}: SelectProps) {
  return (
    <div className={cn("relative", className)}>
      {icone && (
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-600">
          {icone}
        </span>
      )}
      <select
        value={valor}
        onChange={(e) => aoMudar(e.target.value)}
        className={cn(
          "w-full appearance-none truncate rounded-lg border border-borda bg-fundo-suave px-3 py-2 pr-9 text-sm text-slate-800 outline-none transition-colors hover:border-slate-300 focus:border-acao/60 focus:ring-2 focus:ring-acao/15",
          icone && "pl-10",
          classeCampo,
        )}
        {...resto}
      >
        {opcoes.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.rotulo}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
    </div>
  );
}
