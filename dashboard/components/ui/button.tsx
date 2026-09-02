import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const variantesBotao = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/50 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variante: {
        primario:
          "bg-cyan-500 text-slate-950 hover:bg-cyan-400 shadow-glow",
        contorno:
          "border border-borda bg-transparent text-slate-200 hover:bg-slate-800/60",
        fantasma: "text-slate-300 hover:bg-slate-800/60",
      },
      tamanho: {
        md: "h-10 px-4",
        sm: "h-8 px-3 text-xs",
        icone: "h-9 w-9",
      },
    },
    defaultVariants: { variante: "primario", tamanho: "md" },
  },
);

export interface BotaoProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof variantesBotao> {}

export const Button = React.forwardRef<HTMLButtonElement, BotaoProps>(
  ({ className, variante, tamanho, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(variantesBotao({ variante, tamanho }), className)}
      {...props}
    />
  ),
);
Button.displayName = "Button";
