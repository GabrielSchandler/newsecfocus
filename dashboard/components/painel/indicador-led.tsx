import { cn } from "@/lib/utils";

type EstadoLed = "ativo" | "ocioso" | "offline";

const CORES: Record<EstadoLed, string> = {
  ativo: "bg-emerald-400 shadow-[0_0_10px_2px_rgba(52,211,153,0.7)]",
  ocioso: "bg-amber-400 shadow-[0_0_10px_2px_rgba(251,191,36,0.6)]",
  offline: "bg-rose-500 shadow-[0_0_8px_1px_rgba(244,63,94,0.5)]",
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
