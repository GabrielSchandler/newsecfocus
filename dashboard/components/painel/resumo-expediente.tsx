import * as React from "react";
import { Activity, Clock, Database, LineChart, UserRound, Users } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatarDuracao, formatarNumero, formatarPorcentagemEnxuta } from "@/lib/formato";
import { GradeIndicadores, Indicador, Variacao } from "./kit";
import type { MinutosExpediente, ResumoProdutividade } from "@/lib/tipos";
import {
  CLASSE_FATIA,
  CORES_EXPEDIENTE as CORES,
  ORDEM_EXPEDIENTE as ORDEM,
  ROTULOS_EXPEDIENTE as ROTULOS,
} from "@/lib/cores-expediente";

/**
 * Topo das telas de leitura: produtividade medida contra o EXPEDIENTE.
 *
 * Duas medidas convivem e cada cartão diz qual é:
 *   • o índice é a MÉDIA POR PESSOA (cada pessoa pesa igual — é o que torna uma
 *     equipe de 3 comparável com uma de 10);
 *   • horas e cobertura são SOMAS do recorte ("190h de 200h" dá exatamente 95%).
 */

export interface ForaDoExpediente {
  minutos: number;
  pessoas: number;
}

export const DEFINICOES = {
  indice:
    "Média, por pessoa, de: minutos em aplicativos produtivos ÷ minutos de expediente previstos até agora. Cada pessoa pesa igual.",
  ativo: "Soma do tempo em aplicativos produtivos, neutros, improdutivos e sem classificação, dentro do expediente.",
  fora: "Tempo ativo fora da escala de cada pessoa, inclusive em dias sem expediente. Estimado por blocos de 15 minutos; não é marcação de ponto nem banco de horas.",
  cobertura:
    "Minutos com registro dentro do expediente ÷ minutos de expediente previstos. Não indica presença física nem qualidade do trabalho.",
} as const;

/** Os quatro números do topo. */
export function CartoesIndicadores({
  resumo,
  variacao,
  rotuloComparacao,
  foraDoExpediente,
}: {
  resumo: ResumoProdutividade;
  /** Variação do índice já validada (compararIndice); null = sem base. */
  variacao: number | null;
  rotuloComparacao: string | null;
  /** Sem isto, o terceiro cartão mostra quantas pessoas têm expediente. */
  foraDoExpediente?: ForaDoExpediente;
}) {
  const semExpediente = resumo.indiceMedio === null;
  const m = resumo.minutos;

  return (
    <GradeIndicadores>
      <Indicador
        icone={<Clock />}
        rotulo="Tempo produtivo / expediente"
        definicao={DEFINICOES.indice}
        valor={semExpediente ? "—" : formatarPorcentagemEnxuta(resumo.indiceMedio)}
        rodape={
          semExpediente ? (
            "Ninguém do recorte tem expediente previsto no período."
          ) : (
            <Variacao valor={variacao} rotulo={variacao === null ? null : rotuloComparacao} />
          )
        }
      />

      <Indicador
        icone={<Activity />}
        rotulo="Tempo ativo"
        definicao={DEFINICOES.ativo}
        valor={formatarDuracao(m.ativos)}
        rodape="Produtivo + neutro + improdutivo + sem classificação"
      />

      {foraDoExpediente ? (
        <Indicador
          icone={<UserRound />}
          rotulo="Atividade fora do expediente"
          definicao={DEFINICOES.fora}
          valor={formatarDuracao(foraDoExpediente.minutos)}
          rodape={
            foraDoExpediente.pessoas === 0
              ? "Ninguém acima de 15 min fora da escala"
              : `${foraDoExpediente.pessoas} ${foraDoExpediente.pessoas === 1 ? "pessoa" : "pessoas"} · estimativa por 15 min`
          }
        />
      ) : (
        <Indicador
          icone={<Users />}
          rotulo="Pessoas com expediente"
          valor={formatarNumero(resumo.pessoas)}
          rodape="com expediente previsto no período"
        />
      )}

      <Indicador
        icone={<Database />}
        rotulo="Cobertura de dados"
        definicao={DEFINICOES.cobertura}
        valor={resumo.cobertura === null ? "—" : `${Math.round(resumo.cobertura)}%`}
        rodape={
          resumo.cobertura === null
            ? "Sem expediente previsto no período"
            : `${formatarDuracao(Math.min(m.registrados, m.expediente))} registradas de ${formatarDuracao(m.expediente)} previstas`
        }
      />
    </GradeIndicadores>
  );
}

/**
 * Como o expediente foi ocupado, em HORAS SOMADAS do recorte; o percentual de
 * cada fatia é sobre o expediente total. Por isso o "Produtivo" daqui pode
 * diferir do índice do topo, que é média por pessoa — e o subtítulo diz isso.
 */
export function UsoExpediente({
  minutos,
  dividida = false,
  aproximado = false,
  className,
}: {
  minutos: MinutosExpediente;
  /**
   * O cartão divide a linha com outro no desktop (Visão geral). Aí a legenda só
   * cabe em sete colunas a partir de 2xl; no xl ela quebra em quatro.
   */
  dividida?: boolean;
  aproximado?: boolean;
  className?: string;
}) {
  const total = minutos.expediente;

  return (
    <Card className={cn("flex flex-col p-5 sm:px-6", className)}>
      <div className="flex items-start gap-3">
        <LineChart className="mt-0.5 h-6 w-6 shrink-0 text-acao" strokeWidth={1.75} />
        <div>
          <h2 className="text-[17px] font-semibold text-slate-900">Como o expediente foi utilizado</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            {total <= 0
              ? "Sem expediente previsto no período"
              : `${formatarDuracao(total)} de expediente previsto · horas somadas do recorte`}
          </p>
        </div>
      </div>

      {total <= 0 ? (
        <p className="mt-6 text-sm text-slate-500">
          Nada a compor: ninguém do recorte tem expediente aqui. A escala é configurada em
          Administração › Escalas.
        </p>
      ) : (
        <>
          <BarraExpediente minutos={minutos} className="mt-5 h-12" rotulos />

          {/* Sete colunas do tamanho do conteúdo, espalhadas: com colunas iguais,
              "Sem classificação" invadia a vizinha. */}
          <dl
            className={cn(
              "mt-5 grid grid-cols-2 gap-y-4 sm:grid-cols-4 lg:grid-cols-[repeat(7,auto)] lg:justify-between",
              dividida && "xl:grid-cols-4 xl:justify-normal",
            )}
          >
            {ORDEM.map((k, i) => (
              <div
                key={k}
                className={cn(
                  "flex min-w-0 flex-col gap-1 pr-3",
                  i > 0 && "lg:border-l lg:border-borda lg:pl-3",
                  i > 0 && dividida && "xl:border-l-0 xl:pl-0",
                )}
              >
                <dt className="flex items-center gap-1.5 whitespace-nowrap text-xs text-slate-600">
                  <span
                    className={cn("h-2.5 w-2.5 shrink-0 rounded-full", CLASSE_FATIA[k] && "border border-slate-300")}
                    style={{ background: CLASSE_FATIA[k] ? undefined : CORES[k] }}
                  />
                  {ROTULOS[k]}
                </dt>
                <dd className="numeros-tabulares whitespace-nowrap pl-4 text-sm font-semibold text-slate-900">
                  {formatarDuracao(minutos[k])}
                </dd>
              </div>
            ))}
          </dl>

          <p className="mt-auto pt-4 text-xs text-slate-500">
            Sem dados pode indicar máquina desligada, atraso de envio ou interrupção da coleta.
            {aproximado && " Parte das fronteiras de escala foi rateada dentro de blocos de 15 min."}
          </p>
        </>
      )}
    </Card>
  );
}

/** A barra empilhada em si. `rotulos` escreve o % dentro das fatias largas. */
export function BarraExpediente({
  minutos,
  rotulos = false,
  className,
}: {
  minutos: MinutosExpediente;
  rotulos?: boolean;
  className?: string;
}) {
  const total = minutos.expediente;
  if (total <= 0) return <span className="text-xs text-slate-500">—</span>;

  return (
    <div className={cn("flex w-full overflow-hidden rounded-md bg-slate-100", className ?? "h-3")}>
      {ORDEM.map((k) => {
        const pct = (minutos[k] / total) * 100;
        if (pct <= 0) return null;
        const escuro = k === "produtivos" || k === "neutros" || k === "improdutivos";
        return (
          <div
            key={k}
            className={cn(
              "numeros-tabulares flex h-full min-w-0 items-center justify-center overflow-hidden border-r border-white/70 text-xs font-semibold last:border-r-0",
              escuro ? "text-white" : "text-slate-800",
              CLASSE_FATIA[k],
            )}
            style={{ width: `${pct}%`, background: CLASSE_FATIA[k] ? undefined : CORES[k] }}
            title={`${ROTULOS[k]}: ${formatarDuracao(minutos[k])} (${formatarPorcentagemEnxuta(pct)})`}
          >
            {/* Rótulo só onde cabe: número cortado pela metade confunde mais que ajuda. */}
            {rotulos && pct >= 4 && (
              <span className={pct < 12 ? "hidden sm:inline" : undefined}>{formatarPorcentagemEnxuta(pct)}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Legenda horizontal curta das fatias (para barras sem legenda própria). */
export function LegendaExpediente({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-600", className)}>
      {ORDEM.map((k) => (
        <span key={k} className="flex items-center gap-1.5">
          <span
            className={cn("h-2.5 w-2.5 rounded-full", CLASSE_FATIA[k] && "border border-slate-300")}
            style={{ background: CLASSE_FATIA[k] ? undefined : CORES[k] }}
          />
          {ROTULOS[k]}
        </span>
      ))}
    </div>
  );
}
