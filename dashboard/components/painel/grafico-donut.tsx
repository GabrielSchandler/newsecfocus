"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Check, Loader2, TriangleAlert } from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import {
  ROTULOS_TIPO,
  ehProcessoWindows,
  formatarHoras,
  formatarPorcentagem,
} from "@/lib/formato";
import { classificarApp } from "@/app/painel/administracao/acoes";
import type { Categoria, FatiaDistribuicao } from "@/lib/tipos";

interface Props {
  dados: FatiaDistribuicao[];
  titulo?: string;
  /** Passadas só para quem administra: habilitam classificar sem sair do painel. */
  categorias?: Categoria[];
  podeClassificar?: boolean;
}

/** Donut de distribuição de tempo por aplicativo/site, com a categoria ao lado. */
export function GraficoDonut({
  dados,
  titulo = "Distribuição por aplicativo / site",
  categorias = [],
  podeClassificar = false,
}: Props) {
  const total = dados.reduce((s, d) => s + d.minutos, 0);
  const semCategoria = dados.filter((d) => !d.tipo).length;
  const classificarAqui = podeClassificar && categorias.length > 0;

  return (
    <Card className="p-5">
      <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-medium text-slate-200">{titulo}</h3>
          <p className="text-xs text-slate-500">tempo em primeiro plano no período</p>
        </div>
        {classificarAqui && semCategoria > 0 && (
          <Badge variante="ocioso">{semCategoria} sem categoria</Badge>
        )}
      </div>

      {total === 0 ? (
        <div className="flex h-[288px] items-center justify-center text-center text-sm text-slate-500">
          Sem uso registrado no período
        </div>
      ) : (
        <div className="flex flex-col items-center gap-5 xl:flex-row">
          <div className="relative h-[200px] w-[200px] shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={dados}
                  dataKey="minutos"
                  nameKey="nome"
                  innerRadius={62}
                  outerRadius={92}
                  paddingAngle={2}
                  stroke="none"
                >
                  {dados.map((d) => (
                    <Cell key={d.nome} fill={d.cor} />
                  ))}
                </Pie>
                <Tooltip content={<TooltipDonut total={total} />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-xl font-semibold text-slate-100">
                {formatarHoras(total)}
              </span>
              <span className="text-xs text-slate-500">total</span>
            </div>
          </div>

          <ul className="w-full space-y-2">
            {dados.map((d) => {
              const pct = (d.minutos / total) * 100;
              return (
                <li key={d.nome} className="space-y-1.5">
                  <div className="flex items-center gap-2.5 text-sm">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ background: d.cor }}
                    />
                    <span className="min-w-0 flex-1 truncate text-slate-300" title={d.nome}>
                      {d.nome}
                    </span>
                    {!d.tipo && !classificarAqui && (
                      <Badge variante="neutro" className="hidden shrink-0 sm:inline-flex">
                        sem categoria
                      </Badge>
                    )}
                    <span className="w-10 shrink-0 text-right text-xs text-slate-500">
                      {formatarPorcentagem(pct, 0)}
                    </span>
                    <span className="w-16 shrink-0 text-right text-slate-400">
                      {formatarHoras(d.minutos)}
                    </span>
                  </div>

                  {!d.tipo && classificarAqui && (
                    <ClassificarInline alvo={d.nome} categorias={categorias} />
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Card>
  );
}

/**
 * Classificar sem sair do painel. Tempo sem categoria fica de fora do índice,
 * e o lugar onde isso incomoda é justamente aqui — olhando a distribuição e
 * vendo "sem categoria" no que mais consumiu tempo. Obrigar a ir até
 * Administração para resolver era atrito à toa.
 */
function ClassificarInline({ alvo, categorias }: { alvo: string; categorias: Categoria[] }) {
  const [estado, enviar] = useFormState(classificarApp, null);
  const [categoriaId, setCategoriaId] = useState("");

  if (estado?.ok) {
    return (
      <p className="flex items-center gap-1.5 pl-5 text-xs text-emerald-400">
        <Check className="h-3.5 w-3.5" />
        classificado — o índice já considera
      </p>
    );
  }

  return (
    <form action={enviar} className="flex flex-wrap items-center gap-2 pl-5">
      <input type="hidden" name="alvo" value={alvo} />
      <input type="hidden" name="eh_processo" value={String(ehProcessoWindows(alvo))} />
      <input type="hidden" name="category_id" value={categoriaId} />

      <Select
        aria-label={`Categoria de ${alvo}`}
        className="w-40"
        valor={categoriaId}
        aoMudar={setCategoriaId}
        opcoes={[
          { valor: "", rotulo: "sem categoria" },
          ...categorias.map((c) => ({ valor: c.id, rotulo: c.name })),
        ]}
      />
      <BotaoClassificar desabilitado={!categoriaId} />
      {estado && !estado.ok && (
        <span className="flex items-center gap-1 text-xs text-rose-400">
          <TriangleAlert className="h-3.5 w-3.5" />
          {estado.mensagem}
        </span>
      )}
    </form>
  );
}

function BotaoClassificar({ desabilitado }: { desabilitado: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={desabilitado || pending}
      className="inline-flex items-center gap-1.5 rounded-lg border border-borda px-2.5 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:border-cyan-500/40 hover:text-cyan-300 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {pending && <Loader2 className="h-3 w-3 animate-spin" />}
      Classificar
    </button>
  );
}

function TooltipDonut({ active, payload, total }: any) {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  const fatia = p.payload as FatiaDistribuicao;
  const pct = total > 0 ? (p.value / total) * 100 : 0;

  return (
    <div className="rounded-lg border border-borda bg-fundo-cartao/95 px-3 py-2 text-xs shadow-glow backdrop-blur">
      <p className="flex items-center gap-2 text-slate-200">
        <span className="h-2 w-2 rounded-full" style={{ background: fatia.cor }} />
        {p.name}
      </p>
      <p className="mt-1 text-slate-400">
        {formatarHoras(p.value)} · {formatarPorcentagem(pct, 1)}
      </p>
      <p className="mt-0.5 text-slate-500">
        {ROTULOS_TIPO[fatia.tipo ?? "SEM"]} · {fatia.pessoas}{" "}
        {fatia.pessoas === 1 ? "pessoa" : "pessoas"}
      </p>
    </div>
  );
}
