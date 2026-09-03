import * as React from "react";
import Link from "next/link";
import {
  Activity,
  AlarmClockCheck,
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
import type { Kpis, KpisComparados, KpisEscala } from "@/lib/tipos";

interface Props {
  dados: KpisComparados;
  rotuloComparacao: string;
  /** Corte por janela de jornada. Só aparece quando há janela configurada. */
  escala: KpisEscala;
}

/**
 * Média de tempo ativo por pessoa e por dia.
 *
 * É o número que responde "quanto minha equipe trabalha", e por isso virou o
 * protagonista do painel. O TOTAL do período não julga nada: 297 horas pode ser
 * uma equipe excelente de cinco pessoas ou uma equipe fraca de vinte, e a mesma
 * equipe muda de total só porque o mês tem mais dias úteis.
 */
function mediaDiariaPorPessoa(k: Kpis): number | null {
  if (k.colaboradores === 0 || k.diasComRegistro === 0) return null;
  return k.minutosAtivos / k.colaboradores / k.diasComRegistro;
}

function mediaInteracoesPorPessoaDia(k: Kpis): number | null {
  if (k.colaboradores === 0 || k.diasComRegistro === 0) return null;
  return (k.teclas + k.cliques) / k.colaboradores / k.diasComRegistro;
}

/** Variação percentual entre duas médias. NULL quando não há base. */
function variacao(atual: number | null, anterior: number | null): number | null {
  if (atual === null || anterior === null || anterior === 0) return null;
  return Number((((atual - anterior) / anterior) * 100).toFixed(1));
}

/**
 * Topo do painel em duas camadas:
 *   1. cartões de leitura imediata, em MÉDIA por pessoa/dia — números
 *      comparáveis entre equipes de tamanhos diferentes e entre períodos de
 *      durações diferentes;
 *   2. uma faixa técnica com a composição do tempo, para quem quer entender o
 *      porquê do número.
 */
export function BentoKpis({ dados, rotuloComparacao, escala }: Props) {
  const { atual, anterior } = dados;
  const faixa = faixaIndice(atual.indice);
  const mostrarEscala = escala.temJanela && escala.indiceEscala !== null;

  const media = mediaDiariaPorPessoa(atual);
  const mediaAnterior = mediaDiariaPorPessoa(anterior);

  const interacoes = mediaInteracoesPorPessoaDia(atual);
  const interacoesAnterior = mediaInteracoesPorPessoaDia(anterior);

  const aderencia =
    atual.jornadaEsperada > 0 ? (atual.minutosAtivos / atual.jornadaEsperada) * 100 : null;
  const aderenciaAnterior =
    anterior.jornadaEsperada > 0
      ? (anterior.minutosAtivos / anterior.jornadaEsperada) * 100
      : null;

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
              <Badge variante={atual.indice === null ? "neutro" : "ciano"}>{faixa.rotulo}</Badge>
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
                    valor={dados.variacao.indice}
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

                {/* O índice geral mistura expediente e hora extra. Para avaliar
                    desempenho, o que vale é o horário contratado. */}
                {mostrarEscala && (
                  <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-borda pt-3">
                    <div>
                      <dt className="text-xs text-slate-500">Dentro da escala</dt>
                      <dd className="mt-0.5 text-lg font-semibold text-cyan-300">
                        {formatarPorcentagem(escala.indiceEscala, 1)}
                        <span className="ml-1.5 text-xs font-normal text-slate-500">
                          em {formatarHoras(escala.minutosAtivosEscala)}
                        </span>
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500">Fora da escala</dt>
                      <dd className="mt-0.5 text-lg font-semibold text-slate-300">
                        {escala.minutosAtivosExtra === 0
                          ? "nenhuma"
                          : formatarHoras(escala.minutosAtivosExtra)}
                        {escala.pessoasComExtra > 0 && (
                          <span className="ml-1.5 text-xs font-normal text-slate-500">
                            · {escala.pessoasComExtra}{" "}
                            {escala.pessoasComExtra === 1 ? "pessoa" : "pessoas"}
                          </span>
                        )}
                      </dd>
                    </div>
                  </dl>
                )}
              </>
            )}
          </div>
        </GlowCard>

        {/* O número que responde "quanto minha equipe trabalha". */}
        <CartaoKpi
          icone={<Activity className="h-4 w-4 text-emerald-400" />}
          rotulo="Média por pessoa/dia"
          valor={media === null ? "—" : formatarHoras(media)}
          rodape={<Comparacao valor={variacao(media, mediaAnterior)} rotulo={rotuloComparacao} />}
          detalhe={`${formatarHoras(atual.minutosAtivos)} no total do período`}
        />

        <CartaoKpi
          icone={<Target className="h-4 w-4 text-violet-400" />}
          rotulo="Aderência à jornada"
          valor={aderencia === null ? "—" : formatarPorcentagem(aderencia, 0)}
          rodape={
            <Comparacao
              valor={variacao(aderencia, aderenciaAnterior)}
              sufixo=" p.p."
              rotulo={rotuloComparacao}
            />
          }
          detalhe={
            atual.jornadaEsperada > 0
              ? `${formatarHoras(atual.minutosAtivos)} ativos de ${formatarHoras(atual.jornadaEsperada)} previstas`
              : "sem jornada configurada"
          }
        />

        <CartaoKpi
          icone={<Users className="h-4 w-4 text-sky-400" />}
          rotulo="Pessoas com registro"
          valor={formatarNumero(atual.colaboradores)}
          rodape={
            <span className="text-slate-500">
              {atual.dispositivos} {atual.dispositivos === 1 ? "estação" : "estações"} ·{" "}
              {atual.diasComRegistro} {atual.diasComRegistro === 1 ? "dia" : "dias"} com dado
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
          rotulo="Interações por pessoa/dia"
          valor={interacoes === null ? "—" : formatarNumeroCompacto(interacoes)}
          rodape={
            <Comparacao
              valor={variacao(interacoes, interacoesAnterior)}
              rotulo={rotuloComparacao}
            />
          }
          detalhe={
            <span className="flex flex-wrap items-center gap-1">
              <MousePointerClick className="h-3 w-3" />
              {formatarNumeroCompacto(atual.cliques)} cliques ·{" "}
              {formatarNumeroCompacto(atual.teclas)} teclas no total
            </span>
          }
        />
      </section>

      <ComposicaoTempo kpis={dados} media={media} escala={escala} />
    </div>
  );
}

function CartaoKpi({
  icone,
  rotulo,
  valor,
  rodape,
  detalhe,
  valorClasse = "text-2xl",
}: {
  icone: React.ReactNode;
  rotulo: string;
  valor: string;
  rodape?: React.ReactNode;
  detalhe?: React.ReactNode;
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
        <div className="mt-3 space-y-1 text-xs">
          {rodape}
          {detalhe && <div className="text-slate-600">{detalhe}</div>}
        </div>
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
  const cor = neutro ? "text-slate-500" : positivo ? "text-emerald-400" : "text-rose-400";

  const texto =
    sufixo === "%"
      ? formatarVariacao(valor)
      : `${valor > 0 ? "+" : valor < 0 ? "−" : ""}${Math.abs(valor).toFixed(1).replace(".", ",")}${sufixo}`;

  return (
    <span className={`flex flex-wrap items-center gap-1 ${cor}`}>
      <Icone className="h-3.5 w-3.5" />
      {texto}
      <span className="text-slate-600">vs. {rotulo}</span>
    </span>
  );
}

function ComposicaoTempo({
  kpis,
  media,
  escala,
}: {
  kpis: KpisComparados;
  media: number | null;
  escala: KpisEscala;
}) {
  const { atual } = kpis;

  const faixas = [
    { chave: "PRODUCTIVE", minutos: atual.minutosProdutivos },
    { chave: "NEUTRAL", minutos: atual.minutosNeutros },
    { chave: "UNPRODUCTIVE", minutos: atual.minutosImprodutivos },
    { chave: "SEM", minutos: atual.minutosSemClassificar },
  ];

  const totalAtivo = faixas.reduce((s, f) => s + f.minutos, 0);
  const podeMediar = atual.colaboradores > 0 && atual.diasComRegistro > 0;

  return (
    <section className="rounded-xl2 border border-borda vidro p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-medium text-slate-200">Composição do tempo ativo</h3>
        <p className="text-xs text-slate-500">
          {media === null
            ? "sem registro no período"
            : `média de ${formatarHoras(media)} ativos por pessoa/dia`}
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
              // Mesmo raciocínio do topo, aplicado à composição: média por
              // pessoa/dia dentro de cada faixa.
              const mediaFaixa = podeMediar
                ? f.minutos / atual.colaboradores / atual.diasComRegistro
                : null;

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
                    {formatarHoras(mediaFaixa ?? f.minutos)}
                    <span className="ml-1.5 text-xs font-normal text-slate-500">
                      {formatarPorcentagem(pct, 0)}
                    </span>
                    {mediaFaixa !== null && (
                      <span className="block text-xs font-normal text-slate-600">
                        por pessoa/dia
                      </span>
                    )}
                  </dd>
                </div>
              );
            })}
          </dl>

          {/* O gráfico acima só cobre o tempo ATIVO. Sem esta linha, o tempo
              ocioso e o de tela bloqueada não apareciam em lugar nenhum do
              painel — e é justamente o que explica uma jornada longa com
              pouca entrega. */}
          <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-2 border-t border-borda pt-3 text-xs">
            <div className="flex items-center gap-1.5">
              <dt className="text-slate-500">Ocioso:</dt>
              <dd className="text-slate-300">
                {formatarHoras(atual.minutosOciosos)}
                {atual.minutosRegistrados > 0 && (
                  <span className="ml-1 text-slate-600">
                    ({formatarPorcentagem((atual.minutosOciosos / atual.minutosRegistrados) * 100, 0)}{" "}
                    do tempo registrado)
                  </span>
                )}
              </dd>
            </div>
            <div className="flex items-center gap-1.5">
              <dt className="text-slate-500">Tela bloqueada:</dt>
              <dd className="text-slate-300">{formatarHoras(atual.minutosBloqueado)}</dd>
            </div>
            {escala.temJanela && escala.minutosAtivosExtra > 0 && (
              <div className="flex items-center gap-1.5">
                <dt className="flex items-center gap-1 text-slate-500">
                  <AlarmClockCheck className="h-3.5 w-3.5 text-amber-400" />
                  Fora da escala:
                </dt>
                <dd className="text-amber-300">
                  <Link href="/painel/horas-extras" className="hover:underline">
                    {formatarHoras(escala.minutosAtivosExtra)}
                  </Link>
                </dd>
              </div>
            )}
          </dl>

          {atual.minutosSemClassificar > 0 && (
            <p className="mt-4 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs leading-relaxed text-amber-300/90">
              {formatarPorcentagem((atual.minutosSemClassificar / totalAtivo) * 100, 0)} do
              tempo ativo está em aplicativos ainda sem categoria — esse tempo fica de fora do
              índice.{" "}
              <Link
                href="/painel/administracao?aba=classificacao"
                className="font-medium underline underline-offset-2 hover:text-amber-100"
              >
                Classificar agora
              </Link>{" "}
              para o número refletir a operação.
            </p>
          )}
        </>
      )}
    </section>
  );
}
