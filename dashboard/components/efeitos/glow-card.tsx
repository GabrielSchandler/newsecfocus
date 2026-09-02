import * as React from "react";
import { cn } from "@/lib/utils";

interface GlowCardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Cor de acento do brilho da borda. */
  acento?: "ciano" | "roxo" | "verde" | "ambar";
  /** Liga a animação de giro da borda (padrão: só brilha ao passar o mouse). */
  animar?: boolean;
}

const GRADIENTES: Record<string, string> = {
  ciano: "from-cyan-500/60 via-sky-500/10 to-transparent",
  roxo: "from-violet-500/60 via-fuchsia-500/10 to-transparent",
  verde: "from-emerald-500/60 via-teal-500/10 to-transparent",
  ambar: "from-amber-500/60 via-orange-500/10 to-transparent",
};

/**
 * Cartão com borda em gradiente (Glow Card). A borda é uma camada com
 * `conic-gradient` girando via a custom property --angulo; por cima fica o
 * conteúdo em vidro fosco. Efeito característico do estilo 21st.dev.
 */
export function GlowCard({
  acento = "ciano",
  animar = false,
  className,
  children,
  ...props
}: GlowCardProps) {
  return (
    <div
      className={cn(
        "group relative rounded-xl2 p-[1px] transition-transform duration-300 hover:-translate-y-0.5",
        className,
      )}
      {...props}
    >
      {/* Camada de borda animada. */}
      <div
        aria-hidden
        className={cn(
          "absolute inset-0 rounded-xl2 opacity-60 transition-opacity duration-500 group-hover:opacity-100",
          animar && "animate-borda-girar",
        )}
        style={{
          background:
            "conic-gradient(from var(--angulo), transparent 0deg, rgba(34,211,238,0.7) 90deg, transparent 200deg)",
        }}
      />
      {/* Brilho difuso extra por acento. */}
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute -inset-px rounded-xl2 bg-gradient-to-br opacity-0 blur-md transition-opacity duration-500 group-hover:opacity-40",
          GRADIENTES[acento],
        )}
      />
      <div className="relative h-full rounded-xl2 border border-borda bg-fundo-cartao/90 backdrop-blur-md">
        {children}
      </div>
    </div>
  );
}
