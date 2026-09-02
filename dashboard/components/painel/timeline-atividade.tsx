"use client";

import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { IndicadorLed } from "./indicador-led";
import { criarClienteNavegador } from "@/lib/supabase/client";
import { buscarTempoReal } from "@/lib/consultas";
import { tempoRelativo } from "@/lib/formato";
import type { LinhaTempoReal } from "@/lib/tipos";

const INTERVALO_ATUALIZACAO = 45_000;

/**
 * Quem está fazendo o quê agora, por pessoa.
 *
 * Atualiza por consulta periódica em vez de Realtime de propósito: o Realtime
 * exige habilitar replicação da tabela no painel do Supabase — um passo manual
 * que, se esquecido na implantação de um cliente, deixaria a tela congelada sem
 * nenhum erro visível.
 */
export function TimelineAtividade({ inicial }: { inicial: LinhaTempoReal[] }) {
  const supabase = useMemo(() => criarClienteNavegador(), []);
  const [linhas, setLinhas] = useState(inicial);
  const [busca, setBusca] = useState("");
  const [atualizadoEm, setAtualizadoEm] = useState(() => new Date().toISOString());

  useEffect(() => setLinhas(inicial), [inicial]);

  useEffect(() => {
    let ativo = true;

    const temporizador = setInterval(async () => {
      try {
        const novas = await buscarTempoReal(supabase);
        if (!ativo) return;
        setLinhas(novas);
        setAtualizadoEm(new Date().toISOString());
      } catch {
        // Falha pontual de rede: mantém o último estado e tenta de novo depois.
      }
    }, INTERVALO_ATUALIZACAO);

    return () => {
      ativo = false;
      clearInterval(temporizador);
    };
  }, [supabase]);

  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return linhas;
    return linhas.filter((l) =>
      [l.colaborador, l.equipe, l.maquina, l.processo, l.dominio]
        .filter(Boolean)
        .some((campo) => String(campo).toLowerCase().includes(termo)),
    );
  }, [linhas, busca]);

  const online = linhas.filter((l) => l.status !== "offline").length;

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-borda p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-medium text-slate-200">Atividade agora</h3>
          <p className="text-xs text-slate-500">
            {online} de {linhas.length} com sinal · atualizado {tempoRelativo(atualizadoEm)}
          </p>
        </div>

        <div className="relative sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar pessoa, equipe, app…"
            aria-label="Buscar na atividade"
            className="pl-9"
          />
        </div>
      </div>

      {filtradas.length === 0 ? (
        <p className="p-10 text-center text-sm text-slate-500">
          {linhas.length === 0
            ? "Nenhum colaborador com atividade registrada ainda."
            : "Nenhum resultado para essa busca."}
        </p>
      ) : (
        <ul className="divide-y divide-slate-800/70">
          {filtradas.map((l) => (
            <li key={l.colaboradorId} className="flex items-start gap-3 p-4 transition-colors hover:bg-slate-800/20">
              <span className="mt-1.5">
                <IndicadorLed estado={l.status} />
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="truncate text-sm font-medium text-slate-100">
                    {l.colaborador}
                  </span>
                  <Badge variante="neutro">{l.equipe}</Badge>
                  {l.maquina && (
                    <span className="hidden text-xs text-slate-600 sm:inline">{l.maquina}</span>
                  )}
                </div>

                <p className="mt-1 truncate text-xs text-slate-400">
                  {l.dominio ?? l.processo}
                  {l.tituloJanela && (
                    <span className="text-slate-600"> · {l.tituloJanela}</span>
                  )}
                </p>
              </div>

              <div className="shrink-0 text-right">
                <Badge
                  variante={
                    l.status === "ativo" ? "ativo" : l.status === "ocioso" ? "ocioso" : "offline"
                  }
                >
                  {l.status}
                </Badge>
                <p className="mt-1 text-xs text-slate-600">{tempoRelativo(l.momento)}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
