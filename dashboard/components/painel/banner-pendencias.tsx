"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { PartyPopper, PlugZap, X } from "lucide-react";
import { criarClienteNavegador } from "@/lib/supabase/client";
import { tempoRelativo } from "@/lib/formato";

const INTERVALO_MS = 20_000;

interface Pendencia {
  colaboradoresPendentes: number;
  ultimaEstacao: string | null;
  ultimaEstacaoEm: string | null;
  estacoesParadas: number;
  estacaoParada: string | null;
  estacaoParadaEm: string | null;
}

type TipoAviso = "novo" | "parada";

/**
 * O que precisa de atenção agora, no topo de qualquer tela do painel.
 *
 * São dois avisos de naturezas opostas e por isso separados: chegou máquina
 * nova (boa notícia, só falta configurar) e máquina parou de enviar (má
 * notícia, e a mais traiçoeira deste produto — a tela continua bonita com os
 * números de ontem enquanto a coleta está morta).
 *
 * Sondagem a cada 20s em vez de Realtime: o Realtime do Supabase exige
 * habilitar replicação manualmente no projeto, um passo frágil que este
 * produto já evitou antes (ver timeline-atividade.tsx).
 */
export function BannerPendencias() {
  const supabase = useMemo(() => criarClienteNavegador(), []);
  const [dados, setDados] = useState<Pendencia | null>(null);
  const [fechados, setFechados] = useState<Record<TipoAviso, boolean>>({
    novo: false,
    parada: false,
  });

  // Ref e não estado: serve só para comparar com a leitura anterior, e não
  // deve provocar renderização por si.
  const vistos = useRef<Record<TipoAviso, number | null>>({ novo: null, parada: null });

  const consultar = useCallback(async () => {
    const { data, error } = await supabase.rpc("contar_pendencias");
    if (error) return;
    const linha = Array.isArray(data) ? data[0] : data;
    if (!linha) return;

    const atual: Pendencia = {
      colaboradoresPendentes: Number(linha.colaboradores_pendentes ?? 0),
      ultimaEstacao: linha.ultima_estacao ?? null,
      ultimaEstacaoEm: linha.ultima_estacao_em ?? null,
      estacoesParadas: Number(linha.estacoes_paradas ?? 0),
      estacaoParada: linha.estacao_parada ?? null,
      estacaoParadaEm: linha.estacao_parada_em ?? null,
    };
    setDados(atual);

    // Um aviso dispensado volta se o número CRESCER: máquina nova (ou máquina
    // que caiu) depois da dispensa é notícia nova, não a mesma de antes.
    setFechados((antes) => {
      const novo = { ...antes };
      if (vistos.current.novo !== null && atual.colaboradoresPendentes > vistos.current.novo) {
        novo.novo = false;
      }
      if (vistos.current.parada !== null && atual.estacoesParadas > vistos.current.parada) {
        novo.parada = false;
      }
      return novo;
    });

    vistos.current = { novo: atual.colaboradoresPendentes, parada: atual.estacoesParadas };
  }, [supabase]);

  useEffect(() => {
    consultar();
    const id = setInterval(consultar, INTERVALO_MS);
    return () => clearInterval(id);
  }, [consultar]);

  if (!dados) return null;

  const mostrarNovo = dados.colaboradoresPendentes > 0 && !fechados.novo;
  const mostrarParada = dados.estacoesParadas > 0 && !fechados.parada;
  if (!mostrarNovo && !mostrarParada) return null;

  return (
    <div className="space-y-2">
      {mostrarNovo && (
        <Aviso
          tom="verde"
          icone={<PartyPopper className="h-5 w-5 shrink-0 text-emerald-400" />}
          acao={{ href: "/painel/administracao?aba=pessoas", rotulo: "Configurar agora" }}
          aoFechar={() => setFechados((a) => ({ ...a, novo: true }))}
        >
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
        </Aviso>
      )}

      {mostrarParada && (
        <Aviso
          tom="ambar"
          icone={<PlugZap className="h-5 w-5 shrink-0 text-amber-400" />}
          acao={{ href: "/painel/dispositivos", rotulo: "Ver estações" }}
          aoFechar={() => setFechados((a) => ({ ...a, parada: true }))}
        >
          <strong>
            {dados.estacoesParadas === 1
              ? "1 estação parou de enviar"
              : `${dados.estacoesParadas} estações pararam de enviar`}
          </strong>
          {dados.estacaoParada && (
            <>
              {" "}
              — <strong>{dados.estacaoParada}</strong> não sincroniza{" "}
              {dados.estacaoParadaEm ? tempoRelativo(dados.estacaoParadaEm) : "desde a instalação"}
            </>
          )}
          . O tempo dessas máquinas não entra nos números até voltarem.
        </Aviso>
      )}
    </div>
  );
}

function Aviso({
  tom,
  icone,
  acao,
  aoFechar,
  children,
}: {
  tom: "verde" | "ambar";
  icone: React.ReactNode;
  acao: { href: string; rotulo: string };
  aoFechar: () => void;
  children: React.ReactNode;
}) {
  const cores =
    tom === "verde"
      ? {
          caixa: "border-emerald-500/30 bg-emerald-500/10",
          texto: "text-emerald-100",
          botao: "bg-emerald-500 text-slate-950 hover:bg-emerald-400",
          fechar: "text-emerald-300/70 hover:bg-emerald-500/20 hover:text-emerald-200",
        }
      : {
          caixa: "border-amber-500/30 bg-amber-500/10",
          texto: "text-amber-100",
          botao: "bg-amber-500 text-slate-950 hover:bg-amber-400",
          fechar: "text-amber-300/70 hover:bg-amber-500/20 hover:text-amber-200",
        };

  return (
    <div className={`flex flex-wrap items-center gap-3 rounded-xl2 border px-4 py-3 ${cores.caixa}`}>
      {icone}
      <p className={`min-w-0 flex-1 text-sm ${cores.texto}`}>{children}</p>
      <Link
        href={acao.href}
        className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${cores.botao}`}
      >
        {acao.rotulo}
      </Link>
      <button
        type="button"
        onClick={aoFechar}
        aria-label="Dispensar aviso"
        className={`shrink-0 rounded-md p-1 transition-colors ${cores.fechar}`}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
