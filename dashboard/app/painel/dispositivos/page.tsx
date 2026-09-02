import { MonitorSmartphone } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { IndicadorLed } from "@/components/painel/indicador-led";
import { criarClienteServidor } from "@/lib/supabase/server";
import { buscarDispositivos } from "@/lib/consultas";
import { tempoRelativo } from "@/lib/formato";
import type { Dispositivo } from "@/lib/tipos";

export const dynamic = "force-dynamic";

export default async function PaginaDispositivos() {
  const supabase = await criarClienteServidor();

  let dispositivos: Dispositivo[] = [];
  try {
    dispositivos = await buscarDispositivos(supabase);
  } catch {
    /* renderiza vazio */
  }

  const online = dispositivos.filter((d) => d.status_online).length;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <MonitorSmartphone className="h-5 w-5 text-cyan-400" />
        <div>
          <h2 className="text-lg font-semibold text-slate-100">Dispositivos</h2>
          <p className="text-sm text-slate-500">
            {dispositivos.length} estações · {online} online
          </p>
        </div>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="border-b border-borda">
              <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-5 py-3 font-medium">Estação</th>
                <th className="px-5 py-3 font-medium">Usuário</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Versão do agente</th>
                <th className="px-5 py-3 text-right font-medium">Última sincronização</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {dispositivos.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-12 text-center text-slate-500">
                    Nenhum dispositivo matriculado ainda.
                  </td>
                </tr>
              ) : (
                dispositivos.map((d) => (
                  <tr key={d.id} className="transition-colors hover:bg-slate-800/30">
                    <td className="px-5 py-3 font-medium text-slate-200">{d.machine_name}</td>
                    <td className="px-5 py-3 text-slate-400">{d.os_user ?? "—"}</td>
                    <td className="px-5 py-3">
                      <span className="inline-flex items-center gap-2">
                        <IndicadorLed estado={d.status_online ? "ativo" : "offline"} />
                        <Badge variante={d.status_online ? "ativo" : "offline"}>
                          {d.status_online ? "Online" : "Offline"}
                        </Badge>
                      </span>
                    </td>
                    <td className="px-5 py-3 font-mono text-xs text-slate-500">
                      {d.agent_version ?? "—"}
                    </td>
                    <td className="px-5 py-3 text-right text-xs text-slate-500">
                      {tempoRelativo(d.last_sync_at)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
