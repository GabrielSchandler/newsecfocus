"use client";

import { useEffect, useMemo, useState } from "react";
import { Radio, Search } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { IndicadorLed } from "./indicador-led";
import { criarClienteNavegador } from "@/lib/supabase/client";
import { buscarTimeline } from "@/lib/consultas";
import { tempoRelativo } from "@/lib/formato";
import type { LinhaTimeline } from "@/lib/tipos";

interface Props {
  inicial: LinhaTimeline[];
  busca: string;
}

/**
 * Tabela de atividade "ao vivo" por funcionário/estação. Assina o Realtime do
 * Supabase para novos inserts em activity_logs e re-consulta a última linha por
 * dispositivo, mantendo os LEDs e o nível de interatividade atualizados.
 */
export function TimelineAtividade({ inicial, busca }: Props) {
  const [linhas, setLinhas] = useState<LinhaTimeline[]>(inicial);
  const [aoVivo, setAoVivo] = useState(false);
  const supabase = useMemo(() => criarClienteNavegador(), []);

  useEffect(() => setLinhas(inicial), [inicial]);

  useEffect(() => {
    let ativo = true;

    async function recarregar() {
      try {
        const dados = await buscarTimeline(supabase);
        if (ativo) setLinhas(dados);
      } catch {
        /* silencioso: mantém o último estado bom */
      }
    }

    const canal = supabase
      .channel("timeline-atividade")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "activity_logs" },
        () => recarregar(),
      )
      .subscribe((status) => {
        if (ativo) setAoVivo(status === "SUBSCRIBED");
      });

    // Fallback: atualiza a cada 30s mesmo sem eventos (rede/realtime instável).
    const intervalo = setInterval(recarregar, 30_000);

    return () => {
      ativo = false;
      clearInterval(intervalo);
      supabase.removeChannel(canal);
    };
  }, [supabase]);

  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return linhas;
    return linhas.filter(
      (l) =>
        l.machine_name.toLowerCase().includes(termo) ||
        (l.os_user ?? "").toLowerCase().includes(termo) ||
        l.process_name.toLowerCase().includes(termo) ||
        (l.domain ?? "").toLowerCase().includes(termo),
    );
  }, [linhas, busca]);

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-borda p-5">
        <div>
          <h3 className="text-sm font-medium text-slate-200">Timeline de atividade</h3>
          <p className="text-xs text-slate-500">status por estação, em tempo real</p>
        </div>
        <Badge variante={aoVivo ? "ativo" : "neutro"}>
          <Radio className="h-3 w-3" />
          {aoVivo ? "ao vivo" : "conectando…"}
        </Badge>
      </div>

      <div className="max-h-[420px] overflow-x-auto overflow-y-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="sticky top-0 z-10 bg-fundo-cartao/95 backdrop-blur">
            <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-5 py-3 font-medium">Estação / Usuário</th>
              <th className="px-5 py-3 font-medium">Aplicativo em foco</th>
              <th className="px-5 py-3 font-medium">Interatividade</th>
              <th className="px-5 py-3 font-medium">Status</th>
              <th className="px-5 py-3 text-right font-medium">Última sync</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/70">
            {filtradas.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-5 py-10 text-center text-slate-500">
                  <Search className="mx-auto mb-2 h-5 w-5 opacity-50" />
                  Nenhuma estação corresponde ao filtro.
                </td>
              </tr>
            ) : (
              filtradas.map((l) => <LinhaEstacao key={l.device_id} linha={l} />)
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function LinhaEstacao({ linha }: { linha: LinhaTimeline }) {
  const rotuloProcesso = linha.domain ?? linha.process_name;
  const estadoBadge =
    linha.status === "ativo" ? "ativo" : linha.status === "ocioso" ? "ocioso" : "offline";
  const textoBadge =
    linha.status === "ativo" ? "Ativo" : linha.status === "ocioso" ? "Ocioso" : "Offline";

  return (
    <tr className="animate-entrada-suave transition-colors hover:bg-slate-800/30">
      <td className="px-5 py-3">
        <div className="flex flex-col">
          <span className="font-medium text-slate-200">{linha.machine_name}</span>
          <span className="text-xs text-slate-500">{linha.os_user ?? "—"}</span>
        </div>
      </td>
      <td className="px-5 py-3">
        <div className="flex flex-col">
          <span className="text-slate-300">{rotuloProcesso}</span>
          {linha.window_title && (
            <span className="max-w-[220px] truncate text-xs text-slate-600">
              {linha.window_title}
            </span>
          )}
        </div>
      </td>
      <td className="px-5 py-3">
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-800">
            <div
              className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-emerald-400"
              style={{ width: `${linha.interatividade}%` }}
            />
          </div>
          <span className="w-8 text-xs text-slate-500">{linha.interatividade}</span>
        </div>
      </td>
      <td className="px-5 py-3">
        <span className="inline-flex items-center gap-2">
          <IndicadorLed estado={linha.status} />
          <Badge variante={estadoBadge}>{textoBadge}</Badge>
        </span>
      </td>
      <td className="px-5 py-3 text-right text-xs text-slate-500">
        {tempoRelativo(linha.timestamp)}
      </td>
    </tr>
  );
}
