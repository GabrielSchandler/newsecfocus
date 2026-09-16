import { CORES_EXPEDIENTE } from "@/lib/cores-expediente";
import { horaCurta } from "@/lib/formato";
import { cn } from "@/lib/utils";
import type { EstadoLinha, SegmentoLinha } from "@/lib/tipos";

const COR: Record<EstadoLinha, string> = {
  PRODUTIVO: CORES_EXPEDIENTE.produtivos,
  NEUTRO: CORES_EXPEDIENTE.neutros,
  IMPRODUTIVO: CORES_EXPEDIENTE.improdutivos,
  SEM: CORES_EXPEDIENTE.semClassificar,
  OCIOSO: CORES_EXPEDIENTE.ociosos,
  BLOQUEADO: CORES_EXPEDIENTE.bloqueado,
};

const ROTULO: Record<EstadoLinha, string> = {
  PRODUTIVO: "Produtivo",
  NEUTRO: "Neutro",
  IMPRODUTIVO: "Improdutivo",
  SEM: "Sem classificação",
  OCIOSO: "Ocioso",
  BLOQUEADO: "Bloqueado",
};

const minutoDoDia = (iso: string, fuso: string) => {
  const [h, m] = horaCurta(iso, fuso).split(":").map(Number);
  return h * 60 + m;
};
const paraMinuto = (hora: string | null) => {
  if (!hora) return null;
  const [h, m] = hora.split(":").map(Number);
  return h * 60 + m;
};

/**
 * Um dia de uma pessoa, minuto a minuto: cada trecho com a cor do estado, o
 * expediente previsto como moldura tracejada e o intervalo marcado. Buraco é
 * "sem dados" — pode ser máquina desligada, agente parado ou envio atrasado.
 */
export function LinhaDoTempo({
  segmentos,
  fuso,
  escala,
}: {
  segmentos: SegmentoLinha[];
  fuso: string;
  escala: { inicio: string | null; fim: string | null; intervaloInicio: string | null; intervaloFim: string | null } | null;
}) {
  const ini = paraMinuto(escala?.inicio ?? null);
  const fim = paraMinuto(escala?.fim ?? null);
  const intIni = paraMinuto(escala?.intervaloInicio ?? null);
  const intFim = paraMinuto(escala?.intervaloFim ?? null);

  if (segmentos.length === 0 && ini === null) {
    return (
      <p className="rounded-lg border border-dashed border-borda py-8 text-center text-sm text-slate-500">
        Sem registro neste dia e sem expediente previsto.
      </p>
    );
  }

  const trechos = segmentos.map((s) => ({
    ...s,
    de: minutoDoDia(s.inicio, fuso),
    ate: Math.max(minutoDoDia(s.inicio, fuso) + 1, minutoDoDia(s.fim, fuso)),
  }));
  const menor = Math.min(ini ?? 24 * 60, ...trechos.map((t) => t.de));
  const maior = Math.max(fim ?? 0, ...trechos.map((t) => t.ate));
  const eixoIni = Math.max(0, Math.floor(menor / 60) * 60 - 60);
  const eixoFim = Math.min(24 * 60, Math.ceil(maior / 60) * 60 + 60);
  const largura = eixoFim - eixoIni;
  const pos = (m: number) => `${((m - eixoIni) / largura) * 100}%`;
  const tam = (a: number, b: number) => `${(Math.max(0, b - a) / largura) * 100}%`;
  const horas = Array.from({ length: largura / 60 + 1 }, (_, i) => eixoIni + i * 60);
  const presentes = new Set(trechos.map((t) => t.estado));

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[640px] px-3">
        <div className="relative mb-1 h-5 text-[11px] text-slate-500">
          {horas.map((h) => (
            <span key={h} className="numeros-tabulares absolute -translate-x-1/2" style={{ left: pos(h) }}>
              {String(h / 60).padStart(2, "0")}h
            </span>
          ))}
        </div>
        <div className="listrado-sem-dados relative h-12 overflow-hidden rounded-md">
          {trechos.map((t) => (
            <span
              key={t.inicio}
              title={`${ROTULO[t.estado]} · ${horaCurta(t.inicio, fuso)}–${horaCurta(t.fim, fuso)} (${t.minutos} min)`}
              className="absolute top-0 h-full"
              style={{ left: pos(t.de), width: tam(t.de, t.ate), background: COR[t.estado] }}
            />
          ))}
          {ini !== null && fim !== null && (
            <span
              aria-hidden
              className="pointer-events-none absolute top-0 h-full rounded-md border-2 border-dashed border-slate-500/50"
              style={{ left: pos(ini), width: tam(ini, fim) }}
            />
          )}
        </div>
        {intIni !== null && intFim !== null && (
          <div className="relative h-7">
            <span
              className="absolute top-1 -translate-x-0 whitespace-nowrap rounded border border-dashed border-slate-300 bg-white px-1.5 text-[11px] text-slate-600"
              style={{ left: pos(intIni) }}
            >
              Intervalo {escala?.intervaloInicio}–{escala?.intervaloFim}
            </span>
          </div>
        )}
        <div className={cn("flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-600", intIni === null && "mt-3")}>
          {(Object.keys(ROTULO) as EstadoLinha[])
            .filter((e) => presentes.has(e))
            .map((e) => (
              <span key={e} className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: COR[e] }} />
                {ROTULO[e]}
              </span>
            ))}
          <span className="flex items-center gap-1.5">
            <span className="listrado-sem-dados h-2.5 w-4 rounded-sm border border-slate-300" />
            Sem dados
          </span>
          {ini !== null && (
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-4 rounded-sm border-2 border-dashed border-slate-500/50" />
              Expediente {escala?.inicio}–{escala?.fim}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
