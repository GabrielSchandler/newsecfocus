import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return (
      <input
        ref={ref}
        className={cn(
          "w-full rounded-lg border border-borda bg-fundo-suave px-3 py-2 text-sm text-slate-200 outline-none transition-colors",
          "placeholder:text-slate-600 hover:border-slate-600",
          "focus:border-cyan-500/60 focus:ring-2 focus:ring-cyan-500/20",
          "disabled:cursor-not-allowed disabled:opacity-50",
          // O ícone nativo do input date é escuro demais no tema; clareia.
          "[&::-webkit-calendar-picker-indicator]:invert-[0.7]",
          className,
        )}
        {...props}
      />
    );
  },
);

interface CampoProps {
  rotulo: string;
  dica?: string;
  children: React.ReactNode;
  className?: string;
}

/** Rótulo + controle, com espaçamento consistente em todos os formulários. */
export function Campo({ rotulo, dica, children, className }: CampoProps) {
  return (
    <label className={cn("flex flex-col gap-1.5", className)}>
      <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {rotulo}
      </span>
      {children}
      {dica && <span className="text-xs text-slate-600">{dica}</span>}
    </label>
  );
}
