import * as React from "react";
import { Gauge, Minus, Target, TrendingDown, TrendingUp, Users, CalendarClock } from "lucide-react";
import { GlowCard } from "@/components/efeitos/glow-card";
import { Badge } from "@/components/ui/badge";
import { formatarHoras, formatarNumero, formatarPorcentagem } from "@/lib/formato";
import type { ComposicaoExpediente, ResumoProdutividade } from "@/lib/tipos";
import { variacaoPP } from "@/lib/produtividade";
import {
  CORES_EXPEDIENTE as CORES,
  ORDEM_EXPEDIENTE as ORDEM,
  ROTULOS_EXPEDIENTE as ROTULOS,
} from "@/lib/cores-expediente";

/**
 * Topo do painel: produtividade medida contra o EXPEDIENTE.
 *
 * O índice antigo era "do tempo classificado, quanto foi produtivo" — e dava
 * 90% para quem ficou duas horas online no dia inteiro, porque o denominador
 * encolhia junto. Agora o denominador é o expediente decorrido: máquina
 * desligada, tela bloqueada e ociosidade entram na conta e puxam para baixo.
 * É um número mais duro e é o que o gestor realmente quer saber.
 */


/**
 * Faixas recalibradas para a métrica nova. Com o expediente inteiro no
 * denominador, 50% já é um time muito bom — as faixas antigas (80% = bom)
 * pintariam qualquer operação real de vermelho.
 */
function faixa(indice: number | null): { rotulo: string; variante: "ciano" | "neutro" } {
  if (indice === null) return { rotulo: "sem expediente", variante: "neutro" };
  if (indice >= 60) return { rotulo: "excelente", variante: "ciano" };
  if (indice >= 45) return { rotulo: "bom", variante: "ciano" };
  if (indice >= 30) return { rotulo: "atenção", variante: "neutro" };
  return { rotulo: "crítico", variante: "neutro" };
}

export function ResumoExpediente({
  resumo,
  anterior,
  rotuloComparacao,
}: {
  resumo: ResumoProdutividade;
  anterior: ResumoProdutividade | null;
  rotuloComparacao: string | null;
}) {
  const f = faixa(resumo.indiceMedio);
  const varIndice = variacaoPP(resumo.indiceMedio, anterior?.indiceMedio ?? null);
  const varAderencia = variacaoPP(resumo.aderenciaMedia, anterior?.aderenciaMedia ?? null);

  return (
    <div className="space-y-4">
      <section className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <GlowCard acento="ciano" animar className="col-span-2">
          <div className="flex h-full flex-col justify-between p-5 sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <span className="flex items-center gap-2 text-sm text-slate-400">
                <Gauge className="h-4 w-4 text-cyan-400" />
                Índice de produtividade
              </span>
              <Badge variante={f.variante}>{f.rotulo}</Badge>
            </div>

            {resumo.indiceMedio === null ? (
              <div className="mt-5">
                <p className="text-3xl font-semibold text-slate-400">Sem expediente</p>
                <p className="mt-2 text-xs leading-relaxed text-slate-500">
                  Ninguém do recorte tem expediente previsto no período. Configure a escala em
                  Administração &rsaquo; Empresa.
                </p>
              </div>
            ) : (
              <>
                <div className="mt-4 flex flex-wrap items-end gap-3">
                  <span className="bg-gradient-to-r from-cyan-300 to-violet-300 bg-clip-text text-5xl font-semibold tracking-tight text-transparent sm:text-6xl">
                    {formatarPorcentagem(resumo.indiceMedio, 1)}
                  </span>
                  <Comparacao valor={varIndice} rotulo={rotuloComparacao} />
                </div>

                <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-slate-800">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-violet-400 transition-all duration-700"
                    style={{ width: `${Math.min(100, resumo.indiceMedio)}%` }}
                  />
                </div>
                <p className="mt-2 text-xs leading-relaxed text-slate-500">
                  do expediente virou trabalho produtivo · média das {resumo.pessoas}{" "}
                  {resumo.pessoas === 1 ? "pessoa" : "pessoas"} (cada uma pesa igual)
                </p>
              </>
            )}
          </div>
        </GlowCard>

        <Cartao
          icone={<Target className="h-4 w-4 text-violet-400" />}
          rotulo="Aderência ao expediente"
          valor={resumo.aderenciaMedia === null ? "—" : formatarPorcentagem(resumo.aderenciaMedia, 0)}
          rodape={<Comparacao valor={varAderencia} rotulo={rotuloComparacao} />}
          detalhe="estação ligada dentro do expediente"
        />

        <Cartao
          icone={<CalendarClock className="h-4 w-4 text-cyan-400" />}
          rotulo="Expediente no período"
          valor={formatarHoras(resumo.totais.expediente)}
          rodape={
            <span className="text-slate-500">
              {formatarHoras(resumo.totais.produtivos)} produtivos
            </span>
          }
          detalhe={`${formatarHoras(resumo.totais.desligado)} com a máquina desligada`}
        />

        <Cartao
          icone={<Users className="h-4 w-4 text-sky-400" />}
          rotulo="Pessoas com expediente"
          valor={formatarNumero(resumo.pessoas)}
          rodape={
            <span className="text-slate-500">
              {formatarHoras(resumo.totais.registrados)} com a estação ligada
            </span>
          }
        />
      </section>

      <Composicao composicao={resumo.composicao} totalMinutos={resumo.totais.expediente} />
    </div>
  );
}

function Cartao({
  icone,
  rotulo,
  valor,
  rodape,
  detalhe,
}: {
  icone: React.ReactNode;
  rotulo: string;
  valor: string;
  rodape?: React.ReactNode;
  detalhe?: React.ReactNode;
}) {
  return (
    <GlowCard>
      <div className="flex h-full flex-col justify-between p-4 sm:p-5">
        <span className="flex items-start gap-2 text-xs leading-tight text-slate-400 sm:text-sm">
          <span className="mt-0.5 shrink-0">{icone}</span>
          {rotulo}
        </span>
        <p className="mt-3 text-2xl font-semibold text-slate-100">{valor}</p>
        <div className="mt-3 space-y-1 text-[11px] sm:text-xs">
          {rodape}
          {detalhe && <div className="text-slate-600">{detalhe}</div>}
        </div>
      </div>
    </GlowCard>
  );
}

function Comparacao({ valor, rotulo }: { valor: number | null; rotulo: string | null }) {
  if (valor === null || !rotulo) {
    return <span className="text-slate-600">sem base de comparação</span>;
  }
  const neutro = Math.abs(valor) < 0.05;
  const positivo = valor > 0;
  const Icone = neutro ? Minus : positivo ? TrendingUp : TrendingDown;
  const cor = neutro ? "text-slate-500" : positivo ? "text-emerald-400" : "text-rose-400";

  return (
    <span className={`flex flex-wrap items-center gap-1 ${cor}`}>
      <Icone className="h-3.5 w-3.5" />
      {valor > 0 ? "+" : valor < 0 ? "−" : ""}
      {Math.abs(valor).toFixed(1).replace(".", ",")} p.p.
      <span className="text-slate-600">{rotulo}</span>
    </span>
  );
}

/**
 * Como o expediente foi ocupado, em %. Diferente da composição antiga, que só
 * olhava o tempo ATIVO: aqui entram ocioso, bloqueado e desligado, que é onde
 * costuma estar a resposta para "por que o índice está baixo".
 */
function Composicao({
  composicao,
  totalMinutos,
}: {
  composicao: ComposicaoExpediente;
  totalMinutos: number;
}) {
  const soma = ORDEM.reduce((s, k) => s + composicao[k], 0);

  return (
    <section className="rounded-xl2 border border-borda vidro p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-medium text-slate-200">Composição do expediente</h3>
        <p className="text-xs text-slate-500">
          {soma <= 0 ? "sem expediente no período" : "média do percentual de cada pessoa"}
        </p>
      </div>

      {soma <= 0 ? (
        <p className="mt-4 text-sm text-slate-500">Nada a compor: ninguém tem expediente aqui.</p>
      ) : (
        <>
          <div className="mt-4 flex h-3 w-full overflow-hidden rounded-full bg-slate-800">
            {ORDEM.map((k) => {
              const pct = (composicao[k] / soma) * 100;
              if (pct <= 0) return null;
              return (
                <div
                  key={k}
                  className="h-full transition-all duration-500"
                  style={{ width: `${pct}%`, background: CORES[k] }}
                  title={`${ROTULOS[k]}: ${formatarPorcentagem(composicao[k], 1)}`}
                />
              );
            })}
          </div>

          <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {ORDEM.map((k) => (
              <div key={k} className="flex flex-col gap-1">
                <dt className="flex items-center gap-1.5 text-xs text-slate-400">
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: CORES[k] }}
                  />
                  {ROTULOS[k]}
                </dt>
                <dd className="text-sm font-medium text-slate-100">
                  {formatarPorcentagem(composicao[k], 1)}
                  <span className="block text-xs font-normal text-slate-600">
                    {formatarHoras((composicao[k] / 100) * totalMinutos)} no total
                  </span>
                </dd>
              </div>
            ))}
          </dl>
        </>
      )}
    </section>
  );
}
