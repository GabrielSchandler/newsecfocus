import * as React from "react";
import {
  Activity,
  AppWindow,
  Gauge,
  Keyboard,
  MousePointerClick,
  TrendingDown,
  TrendingUp,
  Minus,
  Target,
  Users,
} from "lucide-react";
import { GlowCard } from "@/components/efeitos/glow-card";
import { Badge } from "@/components/ui/badge";
import {
  CORES_TIPO,
  ROTULOS_TIPO,
  faixaIndice,
  formatarHoras,
  formatarNumero,
  formatarNumeroCompacto,
  formatarPorcentagem,
  formatarVariacao,
} from "@/lib/formato";
import type { KpisComparados } from "@/lib/tipos";

interface Props {
  dados: KpisComparados;
  rotuloComparacao: string;
}

/**
 * Topo do painel em duas camadas:
 *   1. quatro cartões de leitura imediata (o gestor entende em 5 segundos);
 *   2. uma faixa técnica com a composição do tempo e a densidade de interação,
 *      para quem quer entender o porquê do número.
 */
export function BentoKpis({ dados, rotuloComparacao }: Props) {
  const { atual, variacao } = dados;
  const faixa = faixaIndice(atual.indice);

  const aderencia =
    atual.jornadaEsperada > 0
      ? (atual.minutosAtivos / atual.jornadaEsperada) * 100
      : null;

  const mediaPorPessoaDia =
    atual.colaboradores > 0 && atual.diasComRegistro > 0
      ? atual.minutosAtivos / atual.colaboradores / atual.diasComRegistro
      : 0;

  return (
    <div className="space-y-4">
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Herói: índice de produtividade. */}
        <GlowCard acento="ciano" animar className="sm:col-span-2">
          <div className="flex h-full flex-col justify-between p-6">
            <div className="flex items-start justify-between gap-3">
              <span className="flex items-center gap-2 text-sm text-slate-400">
                <Gauge className="h-4 w-4 text-cyan-400" />
                Índice de produtividade
              </span>
              <Badge variante={atual.indice === null ? "neutro" : "ciano"}>
                {faixa.rotulo}
              </Badge>
            </div>

            {atual.indice === null ? (
              <div className="mt-5">
                <p className="text-3xl font-semibold text-slate-400">Sem classificação</p>
                <p className="mt-2 text-xs leading-relaxed text-slate-500">
                  Nenhum aplicativo do período está classificado ainda. Configure as
                  categorias em Administração para o índice passar a ser calculado.
                </p>
              </div>
            ) : (
              <>
                <div className="mt-4 flex flex-wrap items-end gap-3">
                  <span className="bg-gradient-to-r from-cyan-300 to-violet-300 bg-clip-text text-5xl font-semibold tracking-tight text-transparent sm:text-6xl">
                    {formatarPorcentagem(atual.indice, 1)}
                  </span>
                  <Comparacao
                    valor={variacao.indice}
                    sufixo=" p.p."
                    rotulo={rotuloComparacao}
                  />
                </div>

                <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-slate-800">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-violet-400 transition-all duration-700"
                    style={{ width: `${Math.min(100, atual.indice)}%` }}
                  />
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  tempo produtivo sobre o tempo classificado
                </p>
              </>
            )}
          </div>
        </GlowCard>

        <CartaoKpi
          icone={<Activity className="h-4 w-4 text-emerald-400" />}
          rotulo="Tempo ativo"
          valor={formatarHoras(atual.minutosAtivos)}
          rodape={<Comparacao valor={variacao.minutosAtivos} rotulo={rotuloComparacao} />}
        />

        <CartaoKpi
          icone={<Target className="h-4 w-4 text-violet-400" />}
          rotulo="Aderência à jornada"
          valor={aderencia === null ? "—" : formatarPorcentagem(aderencia, 0)}
          rodape={
            <span className="text-slate-500">
              {atual.jornadaEsperada > 0
                ? `${formatarHoras(atual.minutosAtivos)} de ${formatarHoras(atual.jornadaEsperada)} previstas`
                : "sem jornada configurada"}
            </span>
          }
        />

        <CartaoKpi
          icone={<Users className="h-4 w-4 text-sky-400" />}
          rotulo="Pessoas com registro"
          valor={formatarNumero(atual.colaboradores)}
          rodape={
            <span className="text-slate-500">
              {atual.dispositivos} {atual.dispositivos === 1 ? "estação" : "estações"} ·{" "}
              {atual.diasComRegistro} {atual.diasComRegistro === 1 ? "dia" : "dias"}
            </span>
          }
        />

        <CartaoKpi
          icone={<AppWindow className="h-4 w-4 text-cyan-400" />}
          rotulo="Ferramenta mais usada"
          valor={atual.topAplicacao ?? "—"}
          valorClasse="truncate text-xl"
          rodape={<span className="text-slate-500">maior tempo em primeiro plano</span>}
        />

        <CartaoKpi
          icone={<Keyboard className="h-4 w-4 text-amber-400" />}
          rotulo="Interações"
          valor={formatarNumeroCompacto(atual.teclas + atual.cliques)}
          rodape={
            <span className="flex flex-wrap items-center gap-1 text-slate-500">
              <MousePointerClick className="h-3.5 w-3.5" />
              {formatarNumeroCompacto(atual.cliques)} cliques ·{" "}
              {formatarNumeroCompacto(atual.teclas)} teclas
            </span>
          }
        />
      </section>

      {/* Camada técnica: composição do tempo. */}
      <ComposicaoTempo kpis={dados} mediaPorPessoaDia={mediaPorPessoaDia} />
    </div>
  );
}

function CartaoKpi({
  icone,
  rotulo,
  valor,
  rodape,
  valorClasse = "text-2xl",
}: {
  icone: React.ReactNode;
  rotulo: string;
  valor: string;
  rodape?: React.ReactNode;
  valorClasse?: string;
}) {
  return (
    <GlowCard>
      <div className="flex h-full flex-col justify-between p-5">
        <span className="flex items-center gap-2 text-sm text-slate-400">
          {icone}
          {rotulo}
        </span>
        <p className={`mt-3 font-semibold text-slate-100 ${valorClasse}`}>{valor}</p>
        <div className="mt-3 text-xs">{rodape}</div>
      </div>
    </GlowCard>
  );
}

/** Variação vs. período anterior, com direção explícita além da cor. */
function Comparacao({
  valor,
  rotulo,
  sufixo = "%",
}: {
  valor: number | null;
  rotulo: string;
  sufixo?: string;
}) {
  if (valor === null) {
    return <span className="text-slate-600">sem base de comparação</span>;
  }

  const neutro = Math.abs(valor) < 0.05;
  const positivo = valor > 0;
  const Icone = neutro ? Minus : positivo ? TrendingUp : TrendingDown;
  const cor = neutro
    ? "text-slate-500"
    : positivo
      ? "text-emerald-400"
      : "text-rose-400";

  const texto =
    sufixo === "%"
      ? formatarVariacao(valor)
      : `${valor > 0 ? "+" : valor < 0 ? "−" : ""}${Math.abs(valor).toFixed(1).replace(".", ",")}${sufixo}`;

  return (
    <span className={`flex items-center gap-1 ${cor}`}>
      <Icone className="h-3.5 w-3.5" />
      {texto}
      <span className="text-slate-600">vs. {rotulo}</span>
    </span>
  );
}

function ComposicaoTempo({
  kpis,
  mediaPorPessoaDia,
}: {
  kpis: KpisComparados;
  mediaPorPessoaDia: number;
}) {
  const { atual } = kpis;

  const faixas = [
    { chave: "PRODUCTIVE", minutos: atual.minutosProdutivos },
    { chave: "NEUTRAL", minutos: atual.minutosNeutros },
    { chave: "UNPRODUCTIVE", minutos: atual.minutosImprodutivos },
    { chave: "SEM", minutos: atual.minutosSemClassificar },
  ];

  const totalAtivo = faixas.reduce((s, f) => s + f.minutos, 0);

  return (
    <section className="rounded-xl2 border border-borda vidro p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-medium text-slate-200">Composição do tempo ativo</h3>
        <p className="text-xs text-slate-500">
          média de {formatarHoras(mediaPorPessoaDia)} ativos por pessoa/dia
        </p>
      </div>

      {totalAtivo === 0 ? (
        <p className="mt-4 text-sm text-slate-500">Sem tempo ativo registrado no período.</p>
      ) : (
        <>
          <div className="mt-4 flex h-3 w-full overflow-hidden rounded-full bg-slate-800">
            {faixas.map((f) => {
              const pct = (f.minutos / totalAtivo) * 100;
              if (pct === 0) return null;
              return (
                <div
                  key={f.chave}
                  className="h-full transition-all duration-500"
                  style={{ width: `${pct}%`, background: CORES_TIPO[f.chave] }}
                  title={`${ROTULOS_TIPO[f.chave]}: ${formatarHoras(f.minutos)}`}
                />
              );
            })}
          </div>

          <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {faixas.map((f) => {
              const pct = (f.minutos / totalAtivo) * 100;
              return (
                <div key={f.chave} className="flex flex-col gap-1">
                  <dt className="flex items-center gap-1.5 text-xs text-slate-400">
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ background: CORES_TIPO[f.chave] }}
                    />
                    {ROTULOS_TIPO[f.chave]}
                  </dt>
                  <dd className="text-sm font-medium text-slate-100">
                    {formatarHoras(f.minutos)}
                    <span className="ml-1.5 text-xs font-normal text-slate-500">
                      {formatarPorcentagem(pct, 0)}
                    </span>
                  </dd>
                </div>
              );
            })}
          </dl>

          {atual.minutosSemClassificar > 0 && (
            <p className="mt-4 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-300/90">
              {formatarPorcentagem((atual.minutosSemClassificar / totalAtivo) * 100, 0)} do
              tempo ativo está em aplicativos ainda sem categoria — esse tempo fica de fora
              do índice. Classifique em Administração para o número refletir a operação.
            </p>
          )}
        </>
      )}
    </section>
  );
}
