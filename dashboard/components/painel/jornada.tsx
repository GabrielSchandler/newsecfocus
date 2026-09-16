import Link from "next/link";
import { TabelaSimples } from "./kit";
import { formatarDuracao, horaCurta } from "@/lib/formato";
import { cn } from "@/lib/utils";
import type { JornadaDia, LinhaJornada } from "@/lib/tipos";

const hhmm = (minuto: number | null) =>
  minuto === null
    ? "—"
    : `${String(Math.floor(minuto / 60)).padStart(2, "0")}:${String(Math.round(minuto) % 60).padStart(2, "0")}`;

const paraMinuto = (hora: string | null) => {
  if (!hora) return null;
  const [h, m] = hora.split(":").map(Number);
  return h * 60 + m;
};

/**
 * Resumo de jornada por pessoa. "Primeiro registro" e "último registro" são a
 * primeira e a última atividade recebida da estação — NÃO são marcação de ponto
 * e não dizem que a pessoa chegou ou saiu naquele horário.
 */
export function TabelaJornada({ linhas, recorte }: { linhas: LinhaJornada[]; recorte: string }) {
  if (linhas.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-borda py-8 text-center text-sm text-slate-500">
        Ninguém com expediente ou registro no período.
      </p>
    );
  }
  const porBloco = linhas.some((l) => l.horariosPorBloco);

  return (
    <>
      <TabelaSimples minimo="min-w-[760px]">
        <thead>
          <tr>
            <th>Pessoa</th>
            <th>Escala</th>
            <th className="!text-right">Dias com registro</th>
            <th className="!text-right">Primeiro registro (média)</th>
            <th className="!text-right">Último registro (média)</th>
            <th className="!text-right">Cobertura</th>
            <th className="!text-right">Fora da escala</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => (
            <tr key={l.colaboradorId} className="hover:bg-slate-50">
              <td>
                <Link
                  href={`/painel/pessoas/${l.colaboradorId}${recorte}`}
                  className="font-medium text-slate-900 hover:text-acao hover:underline"
                >
                  {l.colaborador}
                </Link>
                {l.equipe && <span className="block text-xs text-slate-500">{l.equipe}</span>}
              </td>
              <td className="whitespace-nowrap text-slate-700">{l.escala}</td>
              <td className="numeros-tabulares text-right">
                {l.diasComRegistro} de {l.diasComExpediente}
              </td>
              <td className="numeros-tabulares text-right">{hhmm(l.primeiroRegistroMedio)}</td>
              <td className="numeros-tabulares text-right">{hhmm(l.ultimoRegistroMedio)}</td>
              <td className="numeros-tabulares text-right">{l.cobertura === null ? "—" : `${Math.round(l.cobertura)}%`}</td>
              <td className="numeros-tabulares text-right">{formatarDuracao(l.minutosAtivosFora)}</td>
            </tr>
          ))}
        </tbody>
      </TabelaSimples>
      <p className="mt-3 text-xs leading-relaxed text-slate-500">
        Primeiro e último registro são a primeira e a última atividade recebida da estação no dia — não
        são marcação de ponto. Em “Dias com registro”, a base são só os dias em que a escala prevê expediente.
        {porBloco && " Parte dos dias é anterior à retenção do dado detalhado: nesses, o horário tem precisão de 15 minutos."}
      </p>
    </>
  );
}

/**
 * Um dia, pessoa a pessoa: a escala prevista (contorno tracejado, intervalo
 * vazado) e os blocos de 15 min em que houve registro (cheio dentro da escala,
 * listrado fora dela). Dá para ver de relance quem começa antes, quem estende
 * e onde falta dado — sem transformar nada disso em ponto.
 */
export function ComparativoJornada({ dias, fuso, recorte }: { dias: JornadaDia[]; fuso: string; recorte: string }) {
  const comAlgo = dias.filter((d) => d.trabalha || d.blocos.length > 0);
  if (comAlgo.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-borda py-8 text-center text-sm text-slate-500">
        Nenhum expediente previsto nem registro neste dia.
      </p>
    );
  }

  // Eixo: da menor hora relevante à maior, com folga de uma hora.
  const minutos = comAlgo.flatMap((d) => [
    paraMinuto(d.escalaInicio) ?? 24 * 60,
    ...(d.blocos.length ? [d.blocos[0][0]] : []),
  ]);
  const maximos = comAlgo.flatMap((d) => [
    paraMinuto(d.escalaFim) ?? 0,
    ...(d.blocos.length ? [d.blocos[d.blocos.length - 1][0] + 15] : []),
  ]);
  const inicio = Math.max(0, Math.floor(Math.min(...minutos) / 60) * 60 - 60);
  const fim = Math.min(24 * 60, Math.ceil(Math.max(...maximos) / 60) * 60 + 60);
  const largura = fim - inicio;
  const pos = (m: number) => `${((m - inicio) / largura) * 100}%`;
  const horas = Array.from({ length: largura / 60 + 1 }, (_, i) => inicio + i * 60);

  return (
    <div>
      <div className="overflow-x-auto">
        <div className="min-w-[720px]">
          {/* Mesmas margens das linhas (nome à esquerda, "fora" à direita): sem
              isso as horas do eixo não caem em cima das barras. */}
          <div className="relative ml-40 mr-20 h-6 text-[11px] text-slate-500">
            {horas.map((h) => (
              <span key={h} className="absolute -translate-x-1/2 numeros-tabulares" style={{ left: pos(h) }}>
                {String(h / 60).padStart(2, "0")}h
              </span>
            ))}
          </div>
          <ul className="space-y-2">
            {comAlgo.map((d) => {
              const ini = paraMinuto(d.escalaInicio);
              const fimEscala = paraMinuto(d.escalaFim);
              const intIni = paraMinuto(d.intervaloInicio);
              const intFim = paraMinuto(d.intervaloFim);
              const dentro = (m: number) =>
                d.trabalha && ini !== null && fimEscala !== null && m >= ini && m < fimEscala && !(intIni !== null && intFim !== null && m >= intIni && m < intFim);
              return (
                <li key={d.colaboradorId} className="flex items-center">
                  <Link
                    href={`/painel/pessoas/${d.colaboradorId}${recorte}`}
                    className="w-40 shrink-0 truncate pr-3 text-sm text-slate-800 hover:text-acao hover:underline"
                    title={
                      d.primeiroRegistro
                        ? `Primeiro registro ${horaCurta(d.primeiroRegistro, fuso)} · último ${horaCurta(d.ultimoRegistro, fuso)}`
                        : "Sem registro no dia"
                    }
                  >
                    {d.colaborador}
                  </Link>
                  <div className="relative h-7 flex-1 rounded bg-slate-50">
                    {horas.map((h) => (
                      <span key={h} className="absolute top-0 h-full w-px bg-slate-200/70" style={{ left: pos(h) }} />
                    ))}
                    {d.trabalha && ini !== null && fimEscala !== null && (
                      <span
                        className="absolute top-0.5 h-6 rounded border border-dashed border-slate-400"
                        style={{ left: pos(ini), width: `${((fimEscala - ini) / largura) * 100}%` }}
                      />
                    )}
                    {d.blocos.map(([m, registrados]) =>
                      registrados > 0 ? (
                        <span
                          key={m}
                          title={`${hhmm(m)}–${hhmm(m + 15)} · ${Math.round(registrados)} min com registro`}
                          className={cn(
                            "absolute top-1.5 h-4",
                            dentro(m) ? "bg-marca" : "bg-marca/40 [background-image:repeating-linear-gradient(135deg,rgba(255,255,255,.6)_0,rgba(255,255,255,.6)_2px,transparent_2px,transparent_5px)]",
                          )}
                          style={{
                            left: pos(m),
                            width: `${(15 / largura) * 100}%`,
                            opacity: Math.max(0.35, Math.min(1, registrados / 15)),
                          }}
                        />
                      ) : null,
                    )}
                    {intIni !== null && intFim !== null && d.trabalha && (
                      <span
                        className="absolute top-0.5 flex h-6 items-center justify-center rounded border border-dashed border-slate-300 bg-white text-[10px] text-slate-500"
                        style={{ left: pos(intIni), width: `${((intFim - intIni) / largura) * 100}%` }}
                      >
                        intervalo
                      </span>
                    )}
                  </div>
                  <span className="numeros-tabulares w-20 shrink-0 text-right text-xs text-slate-500">
                    {formatarDuracao(d.minutosAtivosFora)} fora
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
      {/* Fora da rolagem: dentro dela a legenda quebrava na largura mínima
          do gráfico e ficava cortada no celular. */}
      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-slate-600 md:ml-40">
        <span className="flex items-center gap-2">
          <span className="h-3 w-6 rounded border border-dashed border-slate-400" /> Expediente previsto
        </span>
        <span className="flex items-center gap-2">
          <span className="h-3 w-6 rounded bg-marca" /> Registro dentro da escala
        </span>
        <span className="flex items-center gap-2">
          <span className="h-3 w-6 rounded bg-marca/40 [background-image:repeating-linear-gradient(135deg,rgba(255,255,255,.6)_0,rgba(255,255,255,.6)_2px,transparent_2px,transparent_5px)]" />
          Registro fora da escala
        </span>
        <span>Blocos de 15 min · barra mais clara = poucos minutos com registro no bloco</span>
      </div>
    </div>
  );
}
