"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BentoKpis } from "./bento-kpis";
import { Filtros } from "./filtros";
import { GraficoArea } from "./grafico-area";
import { GraficoDonut } from "./grafico-donut";
import { TimelineAtividade } from "./timeline-atividade";
import { Skeleton } from "@/components/ui/skeleton";
import { criarClienteNavegador } from "@/lib/supabase/client";
import {
  buscarDistribuicao,
  buscarKpis,
  buscarSerieTemporal,
} from "@/lib/consultas";
import type {
  Dispositivo,
  EstadoFiltros,
  FatiaDistribuicao,
  KpisPainel,
  LinhaTimeline,
  PontoSerieTemporal,
} from "@/lib/tipos";

interface DadosPainel {
  kpis: KpisPainel;
  totalTeclas: number;
  totalCliques: number;
  serie: PontoSerieTemporal[];
  distribuicao: FatiaDistribuicao[];
}

interface Props {
  dispositivos: Dispositivo[];
  timelineInicial: LinhaTimeline[];
  inicial: DadosPainel;
}

/**
 * Orquestra o painel: mantém o estado dos filtros e re-consulta KPIs, série e
 * distribuição sempre que período ou dispositivo mudam. A primeira renderização
 * usa os dados vindos do servidor (SSR), então não há "flash" de carregamento.
 */
export function PainelCliente({ dispositivos, timelineInicial, inicial }: Props) {
  const supabase = useMemo(() => criarClienteNavegador(), []);
  const [filtros, setFiltros] = useState<EstadoFiltros>({
    periodo: "hoje",
    dispositivoId: "todos",
    busca: "",
  });
  const [dados, setDados] = useState<DadosPainel>(inicial);
  const [carregando, setCarregando] = useState(false);
  const primeiraRenderizacao = useRef(true);

  const online = dispositivos.filter((d) => d.status_online).length;

  const recarregar = useCallback(
    async (f: EstadoFiltros) => {
      setCarregando(true);
      try {
        const [resumo, serie, distribuicao] = await Promise.all([
          buscarKpis(supabase, f.periodo, f.dispositivoId, dispositivos.length, online),
          buscarSerieTemporal(supabase, f.periodo, f.dispositivoId),
          buscarDistribuicao(supabase, f.periodo, f.dispositivoId),
        ]);
        setDados({
          kpis: resumo.kpis,
          totalTeclas: resumo.totalTeclas,
          totalCliques: resumo.totalCliques,
          serie,
          distribuicao,
        });
      } catch (e) {
        console.error("Falha ao recarregar o painel:", e);
      } finally {
        setCarregando(false);
      }
    },
    [supabase, dispositivos.length, online],
  );

  // Refetch quando período ou dispositivo mudam (busca é filtro só de cliente).
  useEffect(() => {
    if (primeiraRenderizacao.current) {
      primeiraRenderizacao.current = false;
      return;
    }
    recarregar(filtros);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtros.periodo, filtros.dispositivoId]);

  return (
    <div className="space-y-5">
      <Filtros filtros={filtros} aoMudar={setFiltros} dispositivos={dispositivos} />

      <div className={carregando ? "pointer-events-none opacity-60 transition-opacity" : "transition-opacity"}>
        <BentoKpis
          kpis={dados.kpis}
          totalTeclas={dados.totalTeclas}
          totalCliques={dados.totalCliques}
        />
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-5">
        <div className="xl:col-span-3">
          {carregando ? <Skeleton className="h-[352px] w-full" /> : <GraficoArea dados={dados.serie} />}
        </div>
        <div className="xl:col-span-2">
          {carregando ? <Skeleton className="h-[352px] w-full" /> : <GraficoDonut dados={dados.distribuicao} />}
        </div>
      </div>

      <TimelineAtividade inicial={timelineInicial} busca={filtros.busca} />
    </div>
  );
}
