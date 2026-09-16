"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AlertTriangle, ArrowRight, MonitorCheck, X } from "lucide-react";
import { criarClienteNavegador } from "@/lib/supabase/client";
import { tempoRelativo } from "@/lib/formato";

const INTERVALO_MS = 20_000;

interface Pendencia {
  limiarMinutos: number;
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
export function BannerPendencias({ ocultarEm }: { ocultarEm?: string } = {}) {
  const caminho = usePathname();
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
      limiarMinutos: Number(linha.limiar_minutos ?? 0),
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

  if (!dados || caminho === ocultarEm) return null;

  // Cadastro pendente é assunto de Pessoas e dos pontos de atenção; aqui, no
  // topo de toda tela, fica só o que invalida os números agora: estação que
  // deveria estar enviando e não está.
  const mostrarParada = dados.estacoesParadas > 0 && !fechados.parada;
  if (!mostrarParada) return null;

  return (
    <div className="space-y-2">
      {mostrarParada && (
        <Aviso
          tom="ambar"
          titulo="Atenção aos dados"
          acao={{ href: "/painel/dispositivos", rotulo: "Ver dispositivos" }}
          aoFechar={() => setFechados((a) => ({ ...a, parada: true }))}
        >
          {dados.estacoesParadas === 1
            ? `1 estação sem enviar dados há mais de ${dados.limiarMinutos} min durante o expediente`
            : `${dados.estacoesParadas} estações sem enviar dados há mais de ${dados.limiarMinutos} min durante o expediente`}
          {dados.estacaoParada && (
            <>
              {" "}
              — <strong className="font-medium">{dados.estacaoParada}</strong>{" "}
              {dados.estacaoParadaEm
                ? `sincronizou pela última vez ${tempoRelativo(dados.estacaoParadaEm)}`
                : "não sincronizou desde a instalação"}
            </>
          )}
          . Atraso de envio não confirma máquina desligada; o tempo aparece como “sem dados” até o envio voltar.
        </Aviso>
      )}
    </div>
  );
}

/**
 * Faixa de aviso: rótulo curto à esquerda (o que é), a frase (o quê) e o
 * atalho à direita (onde resolver). Mesma leitura da esquerda para a direita
 * em todo aviso, para o gestor não precisar reaprender a cada um.
 */
function Aviso({
  tom,
  titulo,
  acao,
  aoFechar,
  children,
}: {
  tom: "verde" | "ambar";
  titulo: string;
  acao: { href: string; rotulo: string };
  aoFechar: () => void;
  children: React.ReactNode;
}) {
  const cores =
    tom === "verde"
      ? {
          caixa: "border-emerald-200 bg-emerald-50",
          icone: "text-emerald-600",
          titulo: "text-emerald-900",
          divisor: "border-emerald-200",
          Icone: MonitorCheck,
        }
      : {
          caixa: "border-amber-200 bg-amber-50",
          icone: "text-amber-500",
          titulo: "text-amber-900",
          divisor: "border-amber-200",
          Icone: AlertTriangle,
        };

  return (
    <div
      role="status"
      className={`flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl2 border px-4 py-3 sm:flex-nowrap sm:px-5 ${cores.caixa}`}
    >
      <span className="flex shrink-0 items-center gap-3">
        <cores.Icone className={`h-5 w-5 ${cores.icone}`} strokeWidth={2} />
        <span className={`text-sm font-semibold ${cores.titulo}`}>{titulo}</span>
      </span>
      <span className={`hidden h-6 border-l sm:block ${cores.divisor}`} aria-hidden />
      <p className="min-w-0 flex-1 basis-full text-sm text-slate-700 sm:basis-auto">{children}</p>
      <Link
        href={acao.href}
        className={`flex shrink-0 items-center gap-1.5 text-sm font-medium hover:underline ${cores.titulo}`}
      >
        {acao.rotulo}
        <ArrowRight className="h-4 w-4" />
      </Link>
      <button
        type="button"
        onClick={aoFechar}
        aria-label="Dispensar aviso"
        className="shrink-0 rounded-md p-1 text-slate-400 transition-colors hover:bg-black/5 hover:text-slate-600"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
