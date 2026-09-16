import { cn } from "@/lib/utils";

type EstadoLed = "ativo" | "ocioso" | "offline";

const CORES: Record<EstadoLed, string> = {
  ativo: "bg-emerald-400 shadow-[0_0_0_3px_rgba(16,185,129,0.18)]",
  ocioso: "bg-amber-400 shadow-[0_0_0_3px_rgba(245,158,11,0.18)]",
  offline: "bg-rose-500 shadow-[0_0_0_3px_rgba(244,63,94,0.15)]",
};

/** Ponto LED verde/âmbar/vermelho usado na timeline de atividade. */
export function IndicadorLed({ estado }: { estado: EstadoLed }) {
  return (
    <span className="relative inline-flex h-2.5 w-2.5">
      <span
        className={cn(
          "inline-flex h-2.5 w-2.5 rounded-full",
          CORES[estado],
          estado === "ativo" && "animate-pulso-led",
        )}
      />
    </span>
  );
}
