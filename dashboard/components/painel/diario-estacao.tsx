"use client";

import { useMemo, useState } from "react";
import {
  Lock,
  LockOpen,
  Moon,
  Power,
  PowerOff,
  Sunrise,
  CircleStop,
  History,
} from "lucide-react";
import type { EventoEstacao, TipoEventoEstacao } from "@/lib/tipos";

/**
 * Linha do tempo do ciclo de vida das estações: ligou, bloqueou a tela,
 * suspendeu, desligou. Responde a pergunta do gestor "o que aconteceu com as
 * máquinas?", que a telemetria de produtividade sozinha não conta.
 *
 * Não é medição de tempo — é diário de bordo. Por isso vive aqui, separado dos
 * indicadores, e não soma nada.
 */

interface EstiloEvento {
  rotulo: string;
  Icone: typeof Power;
  // Classes completas: o Tailwind não enxerga classe montada em tempo de execução.
  cor: string;
  ponto: string;
}

const ESTILOS: Record<TipoEventoEstacao, EstiloEvento> = {
  AGENTE_INICIADO: { rotulo: "Ligou", Icone: Power, cor: "text-emerald-400", ponto: "bg-emerald-400/15" },
  RETOMADA: { rotulo: "Retomou", Icone: Sunrise, cor: "text-cyan-400", ponto: "bg-cyan-400/15" },
  DESBLOQUEADA: { rotulo: "Desbloqueou", Icone: LockOpen, cor: "text-sky-400", ponto: "bg-sky-400/15" },
  BLOQUEADA: { rotulo: "Bloqueou a tela", Icone: Lock, cor: "text-amber-400", ponto: "bg-amber-400/15" },
  SUSPENSA: { rotulo: "Suspendeu / hibernou", Icone: Moon, cor: "text-violet-400", ponto: "bg-violet-400/15" },
  DESLIGANDO: { rotulo: "Desligou", Icone: PowerOff, cor: "text-rose-400", ponto: "bg-rose-400/15" },
  AGENTE_PARADO: { rotulo: "Agente encerrado", Icone: CircleStop, cor: "text-slate-400", ponto: "bg-slate-500/15" },
};

// Ordem dos filtros: o que o gestor mais procura primeiro.
const ORDEM_FILTRO: TipoEventoEstacao[] = [
  "AGENTE_INICIADO", "BLOQUEADA", "DESBLOQUEADA", "SUSPENSA", "RETOMADA", "DESLIGANDO", "AGENTE_PARADO",
];

const FUSO = "America/Sao_Paulo";
const fmtHora = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, hour: "2-digit", minute: "2-digit" });
const fmtDiaLongo = new Intl.DateTimeFormat("pt-BR", {
  timeZone: FUSO, weekday: "short", day: "2-digit", month: "short",
});
// Chave de dia estável no fuso de São Paulo (evita agrupar errado perto da meia-noite).
const fmtChaveDia = new Intl.DateTimeFormat("en-CA", {
  timeZone: FUSO, year: "numeric", month: "2-digit", day: "2-digit",
});

function rotuloDia(chave: string, hojeChave: string, ontemChave: string, exemplo: Date): string {
  if (chave === hojeChave) return "Hoje";
  if (chave === ontemChave) return "Ontem";
  return fmtDiaLongo.format(exemplo);
}

export function DiarioEstacao({ eventos, dias }: { eventos: EventoEstacao[]; dias: number }) {
  const [ativos, setAtivos] = useState<Set<TipoEventoEstacao>>(() => new Set(ORDEM_FILTRO));

  // Só oferece filtro para os tipos que realmente apareceram no período.
  const tiposPresentes = useMemo(() => {
    const vistos = new Set(eventos.map((e) => e.tipo));
    return ORDEM_FILTRO.filter((t) => vistos.has(t));
  }, [eventos]);

  const filtrados = useMemo(
    () => eventos.filter((e) => ativos.has(e.tipo)),
    [eventos, ativos],
  );

  const grupos = useMemo(() => {
    const hoje = fmtChaveDia.format(new Date());
    const ontem = fmtChaveDia.format(new Date(Date.now() - 86400000));
    const mapa = new Map<string, EventoEstacao[]>();
    for (const e of filtrados) {
      const chave = fmtChaveDia.format(new Date(e.momento));
      (mapa.get(chave) ?? mapa.set(chave, []).get(chave)!).push(e);
    }
    return [...mapa.entries()].map(([chave, lista]) => ({
      chave,
      titulo: rotuloDia(chave, hoje, ontem, new Date(lista[0].momento)),
      lista,
    }));
  }, [filtrados]);

  function alternar(tipo: TipoEventoEstacao) {
    setAtivos((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(tipo)) proximo.delete(tipo);
      else proximo.add(tipo);
      // Nunca deixa tudo desmarcado: sem isso a lista some e parece bug.
      return proximo.size === 0 ? new Set(ORDEM_FILTRO) : proximo;
    });
  }

  return (
    <div className="rounded-xl2 border border-borda vidro p-5">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-800/60">
          <History className="h-5 w-5 text-cyan-400" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-medium text-slate-200">Linha do tempo das estações</h3>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">
            Quando cada máquina ligou, bloqueou a tela, hibernou e desligou nos últimos {dias} dias.
            É o diário de bordo — não entra em nenhum cálculo de produtividade.
          </p>
        </div>
      </div>

      {tiposPresentes.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {tiposPresentes.map((tipo) => {
            const { rotulo, Icone, cor } = ESTILOS[tipo];
            const on = ativos.has(tipo);
            return (
              <button
                key={tipo}
                type="button"
                onClick={() => alternar(tipo)}
                className={`toque-afunda inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                  on
                    ? "border-borda bg-slate-800/60 text-slate-200"
                    : "border-transparent bg-slate-900/40 text-slate-600"
                }`}
                aria-pressed={on}
              >
                <Icone className={`h-3 w-3 ${on ? cor : "text-slate-600"}`} />
                {rotulo}
              </button>
            );
          })}
        </div>
      )}

      {grupos.length === 0 ? (
        <p className="mt-6 rounded-lg border border-dashed border-borda py-8 text-center text-xs text-slate-500">
          Nenhum evento registrado no período. Ligar, bloquear e desligar aparecem aqui a partir da
          versão 1.6 do agente — as estações se atualizam sozinhas.
        </p>
      ) : (
        <div className="mt-5 space-y-5">
          {grupos.map((grupo) => (
            <div key={grupo.chave}>
              <h4 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                {grupo.titulo}
              </h4>
              <ul className="space-y-1">
                {grupo.lista.map((e) => {
                  const { rotulo, Icone, cor, ponto } = ESTILOS[e.tipo];
                  return (
                    <li
                      key={e.id}
                      className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-slate-800/40"
                    >
                      <span className="w-11 shrink-0 font-mono text-xs text-slate-500">
                        {fmtHora.format(new Date(e.momento))}
                      </span>
                      <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${ponto}`}>
                        <Icone className={`h-3.5 w-3.5 ${cor}`} />
                      </span>
                      <span className="min-w-0 flex-1 text-sm text-slate-200">{rotulo}</span>
                      <span className="truncate text-xs text-slate-500">{e.maquina}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
