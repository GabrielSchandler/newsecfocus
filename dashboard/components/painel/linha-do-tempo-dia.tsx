"use client";

import { useMemo } from "react";
import { CalendarClock } from "lucide-react";
import type { EstadoLinha, SegmentoLinha } from "@/lib/tipos";

/**
 * Linha do tempo do dia: para cada dia, uma faixa horizontal que mostra, hora a
 * hora, se a estação estava produtiva/neutra/improdutiva, ociosa, bloqueada ou
 * desligada. Os buracos entre os segmentos (o banco não devolve "desligado", é
 * ausência de dado) viram o fundo "desligado" da faixa.
 *
 * Responde de relance "como foi o dia dessa pessoa" — muito mais legível que uma
 * tabela de minutos.
 */

type Estado = EstadoLinha | "DESLIGADO";

const CORES: Record<Estado, string> = {
  PRODUTIVO: "#22d3ee",
  NEUTRO: "#a78bfa",
  IMPRODUTIVO: "#fb7185",
  SEM: "#94a3b8",
  OCIOSO: "#f59e0b",
  BLOQUEADO: "#6366f1",
  DESLIGADO: "transparent",
};

const ROTULOS: Record<Estado, string> = {
  PRODUTIVO: "Produtivo",
  NEUTRO: "Neutro",
  IMPRODUTIVO: "Improdutivo",
  SEM: "Sem classificação",
  OCIOSO: "Ocioso",
  BLOQUEADO: "Bloqueado",
  DESLIGADO: "Desligado",
};

// Ordem da legenda e do resumo: do "melhor" ao "ausente".
const ORDEM: Estado[] = [
  "PRODUTIVO", "NEUTRO", "IMPRODUTIVO", "SEM", "OCIOSO", "BLOQUEADO", "DESLIGADO",
];

const MAX_DIAS = 31;

function fmtHora(fuso: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: fuso, hour: "2-digit", minute: "2-digit", hour12: false,
  });
}

function minutoDoDia(iso: string, fmt: Intl.DateTimeFormat): number {
  const p = fmt.formatToParts(new Date(iso));
  const h = Number(p.find((x) => x.type === "hour")?.value ?? "0");
  const m = Number(p.find((x) => x.type === "minute")?.value ?? "0");
  return (h % 24) * 60 + m;
}

function rotuloDia(dia: string): string {
  // Meio-dia UTC evita o dia "pular" para trás ao formatar em fuso negativo.
  const d = new Date(`${dia}T12:00:00Z`);
  const txt = new Intl.DateTimeFormat("pt-BR", {
    weekday: "short", day: "2-digit", month: "2-digit",
  }).format(d);
  return txt.replace(".", "");
}

function hhmm(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function LinhaDoTempoDia({
  segmentos,
  fuso,
}: {
  segmentos: SegmentoLinha[];
  fuso: string;
}) {
  const fmt = useMemo(() => fmtHora(fuso), [fuso]);

  const { dias, janelaIni, janelaFim, resumo, totalMin } = useMemo(() => {
    const fmtLocal = fmtHora(fuso);
    const porDia = new Map<string, { estado: Estado; ini: number; fim: number }[]>();
    const resumo: Record<string, number> = {};
    let minIni = 24 * 60;
    let maxFim = 0;

    for (const s of segmentos) {
      let ini = minutoDoDia(s.inicio, fmtLocal);
      let fim = minutoDoDia(s.fim, fmtLocal);
      if (fim <= ini) fim = 24 * 60; // segmento que cruza a meia-noite
      minIni = Math.min(minIni, ini);
      maxFim = Math.max(maxFim, fim);
      const lista = porDia.get(s.dia) ?? porDia.set(s.dia, []).get(s.dia)!;
      lista.push({ estado: s.estado, ini, fim });
      resumo[s.estado] = (resumo[s.estado] ?? 0) + s.minutos;
    }

    // Janela alinhada em horas cheias, para todos os dias baterem na comparação.
    let janelaIni = Math.floor(minIni / 60) * 60;
    let janelaFim = Math.ceil(maxFim / 60) * 60;
    if (janelaFim <= janelaIni) janelaFim = janelaIni + 60;
    janelaIni = Math.max(0, janelaIni);
    janelaFim = Math.min(24 * 60, janelaFim);

    const dias = [...porDia.entries()]
      .sort((a, b) => (a[0] < b[0] ? 1 : -1)) // mais recente primeiro
      .slice(0, MAX_DIAS);

    const totalMin = Object.values(resumo).reduce((s, n) => s + n, 0);
    return { dias, janelaIni, janelaFim, resumo, totalMin };
  }, [segmentos, fuso]);

  const vazio = segmentos.length === 0;
  const larguraJanela = janelaFim - janelaIni;

  // Marcas de hora a cada 2h dentro da janela.
  const marcas: number[] = [];
  for (let m = janelaIni; m <= janelaFim; m += 120) marcas.push(m);

  return (
    <section className="rounded-xl2 border border-borda vidro p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-cyan-400" />
          <h3 className="text-sm font-medium text-slate-200">Linha do tempo do dia</h3>
        </div>
        <p className="text-xs text-slate-500">ligado, ocioso, bloqueado e desligado ao longo do dia</p>
      </div>

      {/* Legenda + resumo do período no mesmo lugar. */}
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
        {ORDEM.map((e) => {
          const min = e === "DESLIGADO" ? 0 : resumo[e] ?? 0;
          if (e === "DESLIGADO") {
            return (
              <span key={e} className="flex items-center gap-1.5 text-[11px] text-slate-500">
                <span className="h-2.5 w-2.5 shrink-0 rounded-sm border border-slate-700 bg-slate-900" />
                {ROTULOS[e]}
              </span>
            );
          }
          return (
            <span key={e} className="flex items-center gap-1.5 text-[11px] text-slate-400">
              <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: CORES[e] }} />
              {ROTULOS[e]}
              {min > 0 && (
                <span className="tabular-nums text-slate-600">
                  {Math.floor(min / 60)}h{String(min % 60).padStart(2, "0")}
                </span>
              )}
            </span>
          );
        })}
      </div>

      {vazio ? (
        <p className="mt-6 rounded-lg border border-dashed border-borda py-8 text-center text-xs text-slate-500">
          Sem atividade registrada no período para desenhar a linha do tempo.
        </p>
      ) : (
        <div className="mt-4">
          {/* Eixo de horas. */}
          <div className="mb-1 flex items-center">
            <span className="w-24 shrink-0" />
            <div className="relative h-4 flex-1">
              {marcas.map((m) => (
                <span
                  key={m}
                  className="absolute -translate-x-1/2 text-[10px] tabular-nums text-slate-600"
                  style={{ left: `${((m - janelaIni) / larguraJanela) * 100}%` }}
                >
                  {hhmm(m)}
                </span>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            {dias.map(([dia, lista]) => (
              <div key={dia} className="flex items-center">
                <span className="w-24 shrink-0 text-xs text-slate-400">{rotuloDia(dia)}</span>
                <div
                  className="relative h-6 flex-1 overflow-hidden rounded-md border border-slate-800 bg-slate-900/60"
                  style={{
                    // Fundo "desligado": listras discretas, para buraco parecer ausência.
                    backgroundImage:
                      "repeating-linear-gradient(45deg, rgba(148,163,184,0.06) 0 6px, transparent 6px 12px)",
                  }}
                >
                  {marcas.slice(1, -1).map((m) => (
                    <span
                      key={m}
                      className="absolute top-0 h-full w-px bg-slate-800/70"
                      style={{ left: `${((m - janelaIni) / larguraJanela) * 100}%` }}
                    />
                  ))}
                  {lista.map((seg, i) => {
                    const left = ((seg.ini - janelaIni) / larguraJanela) * 100;
                    const largura = ((seg.fim - seg.ini) / larguraJanela) * 100;
                    return (
                      <span
                        key={i}
                        className="absolute top-0 h-full"
                        style={{
                          left: `${Math.max(0, left)}%`,
                          width: `${Math.max(0.4, largura)}%`,
                          background: CORES[seg.estado],
                        }}
                        title={`${hhmm(seg.ini)}–${hhmm(seg.fim)} · ${ROTULOS[seg.estado]} · ${seg.fim - seg.ini} min`}
                      />
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {totalMin > 0 && (
            <p className="mt-3 text-[11px] text-slate-600">
              Cada faixa vai de {hhmm(janelaIni)} a {hhmm(janelaFim)}. Trechos vazios são a máquina
              desligada ou sem envio.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
