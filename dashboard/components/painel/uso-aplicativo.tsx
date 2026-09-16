"use client";

import { useMemo } from "react";
import Link from "next/link";
import { BarChart3, Users } from "lucide-react";
import { formatarHoras, formatarPorcentagem } from "@/lib/formato";
import type { LinhaAppPessoa, PontoAppSerie } from "@/lib/tipos";

/**
 * Visão de UM aplicativo: quem usa, qual setor usa e como o uso se espalha no
 * tempo.
 *
 * Tudo aparece em tempo e em percentual do total do próprio app — é a leitura
 * que responde "esse app é de uma pessoa só ou do time inteiro?", que o ranking
 * geral não responde.
 */

function Ranking({
  titulo,
  icone,
  linhas,
  total,
  href,
}: {
  titulo: string;
  icone: React.ReactNode;
  linhas: { id: string; nome: string; minutos: number; detalhe?: string }[];
  total: number;
  href?: (id: string) => string;
}) {
  return (
    <section className="rounded-xl2 border border-borda vidro p-5">
      <div className="flex items-center gap-2">
        {icone}
        <h3 className="text-sm font-medium text-slate-200">{titulo}</h3>
      </div>

      {linhas.length === 0 ? (
        <p className="mt-4 text-xs text-slate-500">Sem uso no período.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {linhas.map((l) => {
            const pct = total > 0 ? (l.minutos / total) * 100 : 0;
            return (
              <li key={l.id} className="flex items-center gap-3">
                <span className="w-36 shrink-0 truncate text-sm text-slate-200">
                  {href ? (
                    <Link href={href(l.id)} className="hover:text-cyan-300">
                      {l.nome}
                    </Link>
                  ) : (
                    l.nome
                  )}
                  {l.detalhe && (
                    <span className="block truncate text-xs text-slate-600">{l.detalhe}</span>
                  )}
                </span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-slate-800">
                  <span
                    className="block h-full rounded-full bg-gradient-to-r from-cyan-400 to-violet-400"
                    style={{ width: `${pct}%` }}
                  />
                </span>
                <span className="w-28 shrink-0 text-right text-xs tabular-nums text-slate-400">
                  {formatarHoras(l.minutos)}
                  <span className="ml-1 text-slate-600">{formatarPorcentagem(pct, 0)}</span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export function UsoAplicativo({
  pessoas,
  serie,
  porHora,
  fuso,
  recorte,
}: {
  pessoas: LinhaAppPessoa[];
  serie: PontoAppSerie[];
  porHora: boolean;
  fuso: string;
  recorte: string;
}) {
  const total = pessoas.reduce((s, p) => s + p.minutos, 0);

  const equipes = useMemo(() => {
    const mapa = new Map<string, { id: string; nome: string; minutos: number }>();
    for (const p of pessoas) {
      const id = p.equipeId ?? "__sem__";
      const atual = mapa.get(id);
      if (atual) atual.minutos += p.minutos;
      else mapa.set(id, { id, nome: p.equipe ?? "Sem equipe", minutos: p.minutos });
    }
    return [...mapa.values()].sort((a, b) => b.minutos - a.minutos);
  }, [pessoas]);

  const fmt = useMemo(
    () =>
      new Intl.DateTimeFormat("pt-BR", {
        timeZone: fuso,
        ...(porHora
          ? { hour: "2-digit", minute: "2-digit", hour12: false }
          : { day: "2-digit", month: "2-digit" }),
      }),
    [fuso, porHora],
  );

  const maxSerie = serie.reduce((m, p) => Math.max(m, p.minutos), 0);
  const totalSerie = serie.reduce((s, p) => s + p.minutos, 0);

  return (
    <div className="space-y-5">
      <section className="rounded-xl2 border border-borda vidro p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-cyan-400" />
            <h3 className="text-sm font-medium text-slate-200">
              {porHora ? "Uso ao longo do dia" : "Uso ao longo do período"}
            </h3>
          </div>
          <p className="text-xs text-slate-500">
            {porHora ? "por hora" : "por dia"} · tempo e % do total do app
          </p>
        </div>

        {serie.length === 0 ? (
          <p className="mt-6 rounded-lg border border-dashed border-borda py-8 text-center text-xs text-slate-500">
            Sem uso registrado no período.
          </p>
        ) : (
          <div className="mt-4 flex items-end gap-1 overflow-x-auto" style={{ height: 150 }}>
            {serie.map((p) => {
              const altura = maxSerie > 0 ? (p.minutos / maxSerie) * 100 : 0;
              const pct = totalSerie > 0 ? (p.minutos / totalSerie) * 100 : 0;
              return (
                <div
                  key={p.balde}
                  className="flex min-w-[18px] flex-1 flex-col items-center gap-1"
                  title={`${fmt.format(new Date(p.balde))} · ${formatarHoras(p.minutos)} · ${formatarPorcentagem(pct, 1)} do total`}
                >
                  <div
                    className="w-full rounded-t bg-gradient-to-t from-cyan-500/70 to-violet-400/70"
                    style={{ height: `${Math.max(2, altura)}%` }}
                  />
                  <span className="truncate text-[9px] tabular-nums text-slate-600">
                    {fmt.format(new Date(p.balde))}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Ranking
          titulo="Quem mais usa"
          icone={<Users className="h-4 w-4 text-cyan-400" />}
          total={total}
          href={(id) => `/painel/pessoas/${id}${recorte}`}
          linhas={pessoas.map((p) => ({
            id: p.colaboradorId,
            nome: p.colaborador,
            minutos: p.minutos,
            detalhe: `${p.dias} ${p.dias === 1 ? "dia" : "dias"}${p.equipe ? " · " + p.equipe : ""}`,
          }))}
        />

        <Ranking
          titulo="Setor que mais usa"
          icone={<Users className="h-4 w-4 text-violet-400" />}
          total={total}
          linhas={equipes.map((e) => ({ id: e.id, nome: e.nome, minutos: e.minutos }))}
        />
      </div>
    </div>
  );
}
