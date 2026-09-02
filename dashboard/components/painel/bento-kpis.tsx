import * as React from "react";
import {
  Activity,
  Gauge,
  AppWindow,
  MonitorSmartphone,
  TrendingUp,
  Keyboard,
  MousePointerClick,
} from "lucide-react";
import { GlowCard } from "@/components/efeitos/glow-card";
import { Badge } from "@/components/ui/badge";
import { formatarHoras, formatarNumero, formatarPorcentagem } from "@/lib/formato";
import type { KpisPainel } from "@/lib/tipos";

interface Props {
  kpis: KpisPainel;
  totalTeclas: number;
  totalCliques: number;
}

/**
 * Bento Grid dos KPIs principais. O card de índice de produtividade ocupa
 * dois blocos e recebe a borda animada, virando o herói visual do topo.
 */
export function BentoKpis({ kpis, totalTeclas, totalCliques }: Props) {
  const online = kpis.dispositivosOnline;
  const total = kpis.dispositivosTotal;

  return (
    <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {/* Herói: índice de produtividade (2 colunas). */}
      <GlowCard acento="ciano" animar className="sm:col-span-2 lg:col-span-2">
        <div className="flex h-full flex-col justify-between p-6">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-sm text-slate-400">
              <Gauge className="h-4 w-4 text-cyan-400" />
              Índice de Produtividade do Time
            </span>
            <Badge variante="ciano">tempo real</Badge>
          </div>
          <div className="mt-4 flex items-end gap-3">
            <span className="bg-gradient-to-r from-cyan-300 to-violet-300 bg-clip-text text-6xl font-semibold tracking-tight text-transparent">
              {formatarPorcentagem(kpis.indiceProdutividade)}
            </span>
          </div>
          <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-slate-800">
            <div
              className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-violet-400 transition-all duration-700"
              style={{ width: `${Math.min(100, kpis.indiceProdutividade)}%` }}
            />
          </div>
        </div>
      </GlowCard>

      <CartaoKpi
        icone={<Activity className="h-4 w-4 text-emerald-400" />}
        rotulo="Horas Ativas Totais"
        valor={formatarHoras(kpis.horasAtivas * 60)}
        rodape={
          <span className="flex items-center gap-1 text-emerald-400">
            <TrendingUp className="h-3.5 w-3.5" />
            atividade agregada
          </span>
        }
      />

      <CartaoKpi
        icone={<AppWindow className="h-4 w-4 text-violet-400" />}
        rotulo="Top Aplicação Utilizada"
        valor={kpis.topAplicacao}
        valorClasse="truncate text-2xl"
        rodape={<span className="text-slate-500">maior tempo de foco</span>}
      />

      <CartaoKpi
        icone={<MonitorSmartphone className="h-4 w-4 text-sky-400" />}
        rotulo="Dispositivos Sincronizados"
        valor={`${online}/${total}`}
        rodape={
          <span className="flex items-center gap-1.5 text-slate-400">
            <span className="h-2 w-2 animate-pulso-led rounded-full bg-emerald-400" />
            {online} online agora
          </span>
        }
      />

      <CartaoKpi
        icone={<Keyboard className="h-4 w-4 text-cyan-400" />}
        rotulo="Interações no Período"
        valor={formatarNumero(totalTeclas + totalCliques)}
        rodape={
          <span className="flex items-center gap-1 text-slate-500">
            <MousePointerClick className="h-3.5 w-3.5" />
            {formatarNumero(totalCliques)} cliques · {formatarNumero(totalTeclas)} teclas
          </span>
        }
      />
    </section>
  );
}

function CartaoKpi({
  icone,
  rotulo,
  valor,
  rodape,
  valorClasse = "text-3xl",
}: {
  icone: React.ReactNode;
  rotulo: string;
  valor: string;
  rodape?: React.ReactNode;
  valorClasse?: string;
}) {
  return (
    <GlowCard>
      <div className="flex h-full flex-col justify-between p-5">
        <span className="flex items-center gap-2 text-sm text-slate-400">
          {icone}
          {rotulo}
        </span>
        <p className={`mt-3 font-semibold text-slate-100 ${valorClasse}`}>{valor}</p>
        <div className="mt-3 text-xs">{rodape}</div>
      </div>
    </GlowCard>
  );
}
