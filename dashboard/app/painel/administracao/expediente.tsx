"use client";

import { useMemo, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { CalendarClock, Check, Loader2, RotateCcw, TriangleAlert } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { salvarEscala, removerEscala } from "./acoes-escala";
import type { ResultadoAcao } from "./acoes";
import type { Colaborador, Equipe, LinhaEscala } from "@/lib/tipos";

/**
 * Escala de expediente — a base de tudo que o painel mede agora.
 *
 * O índice e a aderência são calculados contra o expediente, então esta tela
 * deixou de ser detalhe de cadastro: se a escala estiver errada, todo número do
 * produto fica errado junto.
 *
 * A cascata é empresa → equipe → pessoa, e o nível mais específico que tiver
 * escala vence a semana inteira. Por isso a tela diz, em letras, de onde a
 * escala do alvo escolhido está vindo hoje.
 */

const DIAS = [
  { n: 1, nome: "Segunda" },
  { n: 2, nome: "Terça" },
  { n: 3, nome: "Quarta" },
  { n: 4, nome: "Quinta" },
  { n: 5, nome: "Sexta" },
  { n: 6, nome: "Sábado" },
  { n: 7, nome: "Domingo" },
];

const PADRAO = { trabalha: false, inicio: "08:00", fim: "18:00", intIni: "", intFim: "" };

type Escopo = "EMPRESA" | "EQUIPE" | "PESSOA";

interface DiaForm {
  trabalha: boolean;
  inicio: string;
  fim: string;
  intIni: string;
  intFim: string;
}

function BotaoEnviar({ children = "Salvar escala" }: { children?: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
      {children}
    </Button>
  );
}

function Aviso({ resultado }: { resultado: ResultadoAcao | null }) {
  if (!resultado) return null;
  const cor = resultado.ok ? "text-emerald-700" : "text-rose-700";
  return (
    <p className={"flex items-start gap-2 text-xs " + cor}>
      {resultado.ok ? (
        <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      ) : (
        <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      )}
      {resultado.mensagem}
    </p>
  );
}

export function PainelExpediente({
  equipes,
  colaboradores,
  escalas,
}: {
  equipes: Equipe[];
  colaboradores: Colaborador[];
  escalas: LinhaEscala[];
}) {
  const [escopo, setEscopo] = useState<Escopo>("EMPRESA");
  const [alvo, setAlvo] = useState<string>("");
  const [estado, acao] = useFormState(salvarEscala, null);
  const [estadoRemocao, acaoRemocao] = useFormState(removerEscala, null);

  // Escala já gravada para o alvo escolhido (se houver).
  const doAlvo = useMemo(
    () =>
      escalas.filter((e) =>
        escopo === "EMPRESA"
          ? e.escopo === "EMPRESA"
          : escopo === "EQUIPE"
            ? e.escopo === "EQUIPE" && e.equipeId === alvo
            : e.escopo === "PESSOA" && e.colaboradorId === alvo,
      ),
    [escalas, escopo, alvo],
  );

  const personalizado = doAlvo.length > 0;

  // De onde vem a escala que está valendo hoje para este alvo.
  const herdadoDe = useMemo(() => {
    if (escopo === "EMPRESA" || personalizado) return null;
    if (escopo === "PESSOA") {
      const pessoa = colaboradores.find((c) => c.id === alvo);
      const temEquipe =
        !!pessoa?.team_id &&
        escalas.some((e) => e.escopo === "EQUIPE" && e.equipeId === pessoa.team_id);
      return temEquipe ? "equipe " + (pessoa?.equipe_nome ?? "") : "empresa";
    }
    return "empresa";
  }, [escopo, personalizado, alvo, colaboradores, escalas]);

  // Valores do formulário: o que está gravado ou, se herda, a escala da empresa
  // como ponto de partida — começar do zero faria o gestor redigitar tudo.
  const referencia = useMemo(() => {
    const base = personalizado ? doAlvo : escalas.filter((e) => e.escopo === "EMPRESA");
    const mapa = new Map<number, DiaForm>();
    for (const d of DIAS) mapa.set(d.n, { ...PADRAO });
    for (const l of base) {
      mapa.set(l.diaSemana, {
        trabalha: l.trabalha,
        inicio: l.inicio,
        fim: l.fim,
        intIni: l.intervaloInicio ?? "",
        intFim: l.intervaloFim ?? "",
      });
    }
    return mapa;
  }, [doAlvo, escalas, personalizado]);

  const precisaAlvo = escopo !== "EMPRESA";
  const semAlvo = precisaAlvo && !alvo;

  // A chave força o formulário a recarregar os defaults ao trocar de alvo.
  const chaveForm = escopo + "-" + alvo + "-" + String(personalizado);

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100">
            <CalendarClock className="h-5 w-5 text-cyan-700" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-medium text-slate-800">Escalas</h3>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">
              Horário de trabalho por dia da semana, com intervalo. É contra ele que o painel
              calcula o <strong>tempo produtivo / expediente</strong> e a{" "}
              <strong>cobertura de dados</strong>; o que acontece fora dele aparece à parte, como
              estimativa. A equipe herda a empresa; a pessoa herda a equipe.
            </p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Configurar
            </span>
            <Select
              aria-label="Escopo da escala"
              valor={escopo}
              aoMudar={(v) => {
                setEscopo(v as Escopo);
                setAlvo("");
              }}
              opcoes={[
                { valor: "EMPRESA", rotulo: "Escala padrão da empresa" },
                { valor: "EQUIPE", rotulo: "Escala de uma equipe" },
                { valor: "PESSOA", rotulo: "Escala de uma pessoa" },
              ]}
            />
          </label>

          {precisaAlvo && (
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                {escopo === "EQUIPE" ? "Equipe" : "Pessoa"}
              </span>
              <Select
                aria-label={escopo === "EQUIPE" ? "Equipe" : "Pessoa"}
                valor={alvo}
                aoMudar={setAlvo}
                opcoes={[
                  { valor: "", rotulo: "Escolha…" },
                  ...(escopo === "EQUIPE"
                    ? equipes.map((e) => ({ valor: e.id, rotulo: e.nome }))
                    : colaboradores.map((c) => ({
                        valor: c.id,
                        rotulo: c.nome ?? c.os_user,
                      }))),
                ]}
              />
            </label>
          )}
        </div>

        {precisaAlvo && alvo && (
          <p className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            {personalizado ? (
              <>
                <Badge variante="ciano">escala própria</Badge>
                {escopo === "EQUIPE" ? "Esta equipe tem" : "Esta pessoa tem"} escala personalizada.
              </>
            ) : (
              <>
                <Badge variante="neutro">herdando</Badge>
                Hoje usa a escala{" "}
                {herdadoDe === "empresa" ? "padrão da empresa" : "da " + herdadoDe}. Salvar aqui
                cria uma escala própria.
              </>
            )}
          </p>
        )}
      </Card>

      <Card className="p-5">
        {semAlvo ? (
          <p className="py-6 text-center text-xs text-slate-500">
            Escolha {escopo === "EQUIPE" ? "a equipe" : "a pessoa"} para editar a escala.
          </p>
        ) : (
          <form key={chaveForm} action={acao} className="space-y-4">
            <input type="hidden" name="escopo" value={escopo} />
            <input type="hidden" name="alvo" value={alvo} />

            <div className="space-y-2">
              {DIAS.map((d) => {
                const v = referencia.get(d.n) ?? PADRAO;
                return (
                  <div
                    key={d.n}
                    className="grid grid-cols-2 items-center gap-2 rounded-lg border border-borda px-3 py-2 sm:grid-cols-[130px_repeat(4,minmax(0,1fr))]"
                  >
                    <label className="col-span-2 flex items-center gap-2 text-sm text-slate-800 sm:col-span-1">
                      <input
                        type="checkbox"
                        name={"d" + d.n + "_trabalha"}
                        defaultChecked={v.trabalha}
                        className="h-4 w-4 rounded border-slate-300 bg-slate-50 accent-cyan-700"
                      />
                      {d.nome}
                    </label>

                    <CampoHora rotulo="Entrada" nome={"d" + d.n + "_inicio"} valor={v.inicio} />
                    <CampoHora rotulo="Saída" nome={"d" + d.n + "_fim"} valor={v.fim} />
                    <CampoHora rotulo="Almoço de" nome={"d" + d.n + "_int_inicio"} valor={v.intIni} />
                    <CampoHora rotulo="até" nome={"d" + d.n + "_int_fim"} valor={v.intFim} />
                  </div>
                );
              })}
            </div>

            <p className="text-[11px] leading-relaxed text-slate-500">
              Desmarque o dia para folga. Para incluir sábado (ou qualquer outro dia com horário
              próprio), basta marcar e preencher. O intervalo é descontado do expediente — deixe em
              branco se não houver.
            </p>

            <div className="flex flex-wrap items-center gap-3">
              <BotaoEnviar />
              <Aviso resultado={estado} />
            </div>
          </form>
        )}
      </Card>

      {precisaAlvo && alvo && personalizado && (
        <Card className="flex flex-wrap items-center gap-3 p-4">
          <form action={acaoRemocao} className="flex items-center gap-3">
            <input type="hidden" name="escopo" value={escopo} />
            <input type="hidden" name="alvo" value={alvo} />
            <Button type="submit" variante="contorno" tamanho="sm">
              <RotateCcw className="h-3.5 w-3.5" />
              Voltar a herdar
            </Button>
          </form>
          <span className="text-xs text-slate-500">
            Remove a escala própria e volta a seguir o nível de cima.
          </span>
          <Aviso resultado={estadoRemocao} />
        </Card>
      )}
    </div>
  );
}

function CampoHora({ rotulo, nome, valor }: { rotulo: string; nome: string; valor: string }) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-wide text-slate-500">{rotulo}</span>
      <input
        type="time"
        name={nome}
        defaultValue={valor}
        className="rounded-md border border-borda bg-fundo-suave px-2 py-1 text-sm text-slate-800"
      />
    </label>
  );
}
