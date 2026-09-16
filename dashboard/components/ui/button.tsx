import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const variantesBotao = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acao/40 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variante: {
        primario:
          "bg-acao text-white hover:bg-acao-escuro shadow-glow",
        contorno:
          "border border-borda bg-white text-slate-800 hover:border-slate-300 hover:bg-slate-50",
        fantasma: "text-slate-700 hover:bg-slate-100",
        // Ação secundária de destaque, como o "Exportar" do topo da Visão geral.
        destaque:
          "border border-acao/70 bg-white text-acao hover:border-acao hover:bg-acao-suave",
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
