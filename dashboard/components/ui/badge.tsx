import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const variantesBadge = cva(
  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
  {
    variants: {
      variante: {
        neutro: "border-slate-700 bg-slate-800/60 text-slate-300",
        ativo: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
        ocioso: "border-amber-500/30 bg-amber-500/10 text-amber-300",
        offline: "border-rose-500/30 bg-rose-500/10 text-rose-300",
        ciano: "border-cyan-500/30 bg-cyan-500/10 text-cyan-300",
        roxo: "border-violet-500/30 bg-violet-500/10 text-violet-300",
      },
    },
    defaultVariants: { variante: "neutro" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof variantesBadge> {}

export function Badge({ className, variante, ...props }: BadgeProps) {
  return <span className={cn(variantesBadge({ variante }), className)} {...props} />;
}
