import { PainelCliente } from "@/components/painel/painel-cliente";
import { criarClienteServidor } from "@/lib/supabase/server";
import {
  buscarDispositivos,
  buscarDistribuicao,
  buscarKpis,
  buscarSerieTemporal,
  buscarTimeline,
  type ResumoKpis,
} from "@/lib/consultas";
import type {
  Dispositivo,
  FatiaDistribuicao,
  KpisPainel,
  LinhaTimeline,
  PontoSerieTemporal,
} from "@/lib/tipos";

// Sempre renderiza no request (dados de telemetria mudam a cada minuto).
export const dynamic = "force-dynamic";

export default async function PaginaPainel() {
  const supabase = await criarClienteServidor();

  // Carrega o snapshot inicial no servidor (SSR) para o primeiro paint já vir com dados.
  let dispositivos: Dispositivo[] = [];
  let timeline: LinhaTimeline[] = [];

  try {
    [dispositivos, timeline] = await Promise.all([
      buscarDispositivos(supabase),
      buscarTimeline(supabase),
    ]);
  } catch {
    // Banco ainda não provisionado / sem permissão: renderiza vazio sem quebrar.
  }

  const online = dispositivos.filter((d) => d.status_online).length;

  let resumo: ResumoKpis = {
    kpis: kpisVazio(dispositivos.length, online),
    totalTeclas: 0,
    totalCliques: 0,
  };
  let serie: PontoSerieTemporal[] = [];
  let distribuicao: FatiaDistribuicao[] = [];

  try {
    [resumo, serie, distribuicao] = await Promise.all([
      buscarKpis(supabase, "hoje", "todos", dispositivos.length, online),
      buscarSerieTemporal(supabase, "hoje", "todos"),
      buscarDistribuicao(supabase, "hoje", "todos"),
    ]);
  } catch {
    /* mantém os defaults vazios */
  }

  return (
    <PainelCliente
      dispositivos={dispositivos}
      timelineInicial={timeline}
      inicial={{
        kpis: resumo.kpis,
        totalTeclas: resumo.totalTeclas,
        totalCliques: resumo.totalCliques,
        serie,
        distribuicao,
      }}
    />
  );
}

function kpisVazio(total: number, online: number): KpisPainel {
  return {
    horasAtivas: 0,
    indiceProdutividade: 0,
    topAplicacao: "—",
    dispositivosOnline: online,
    dispositivosTotal: total,
    variacaoHorasAtivas: 0,
  };
}
