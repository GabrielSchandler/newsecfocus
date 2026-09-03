"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { PartyPopper, X } from "lucide-react";
import { criarClienteNavegador } from "@/lib/supabase/client";
import { tempoRelativo } from "@/lib/formato";

const INTERVALO_MS = 20_000;

interface Pendencia {
  colaboradoresPendentes: number;
  ultimaEstacao: string | null;
  ultimaEstacaoEm: string | null;
}

/**
 * Avisa, sem precisar esperar a próxima hora cheia, que uma instalação nova
 * chegou e está esperando ser configurada (equipe, cargo, jornada).
 *
 * Não é notificação push de verdade — é sondagem a cada 20s enquanto o painel
 * está aberto. Decisão consciente: Realtime do Supabase exige habilitar
 * replicação manualmente no projeto, um passo frágil que este produto já
 * evitou antes (ver timeline-atividade.tsx). Sondagem rápida dá a mesma
 * sensação de imediato sem esse risco.
 */
export function BannerPendencias() {
  const supabase = useMemo(() => criarClienteNavegador(), []);
  const [dados, setDados] = useState<Pendencia | null>(null);
  const [fechado, setFechado] = useState(false);
  const [ultimaContagemVista, setUltimaContagemVista] = useState<number | null>(null);

  const consultar = useCallback(async () => {
    const { data, error } = await supabase.rpc("contar_pendencias");
    if (error) return;
    const linha = Array.isArray(data) ? data[0] : data;
    if (!linha) return;

    const atual: Pendencia = {
      colaboradoresPendentes: Number(linha.colaboradores_pendentes ?? 0),
      ultimaEstacao: linha.ultima_estacao ?? null,
      ultimaEstacaoEm: linha.ultima_estacao_em ?? null,
    };
    setDados(atual);

    // Uma nova pendência reabre o banner mesmo que a pessoa tenha fechado a
    // anterior — instalação nova é sempre notícia nova.
    setUltimaContagemVista((anterior) => {
      if (anterior !== null && atual.colaboradoresPendentes > anterior) {
        setFechado(false);
      }
      return atual.colaboradoresPendentes;
    });
  }, [supabase]);

  useEffect(() => {
    consultar();
    const id = setInterval(consultar, INTERVALO_MS);
    return () => clearInterval(id);
  }, [consultar]);

  if (!dados || dados.colaboradoresPendentes === 0 || fechado) return null;

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl2 border border-emerald-500/30 bg-emerald-500/10 px-4 py-3">
      <PartyPopper className="h-5 w-5 shrink-0 text-emerald-400" />
      <p className="min-w-0 flex-1 text-sm text-emerald-100">
        <strong>
          {dados.colaboradoresPendentes === 1
            ? "1 estação nova"
            : `${dados.colaboradoresPendentes} estações novas`}
        </strong>{" "}
        {dados.colaboradoresPendentes === 1 ? "está" : "estão"} aguardando configuração
        {dados.ultimaEstacao && (
          <>
            {" "}
            — a mais recente foi <strong>{dados.ultimaEstacao}</strong>
            {dados.ultimaEstacaoEm && `, ${tempoRelativo(dados.ultimaEstacaoEm)}`}
          </>
        )}
        .
      </p>
      <Link
        href="/painel/administracao?aba=pessoas"
        className="shrink-0 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-medium text-slate-950 transition-colors hover:bg-emerald-400"
      >
        Configurar agora
      </Link>
      <button
        type="button"
        onClick={() => setFechado(true)}
        aria-label="Dispensar aviso"
        className="shrink-0 rounded-md p-1 text-emerald-300/70 transition-colors hover:bg-emerald-500/20 hover:text-emerald-200"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
