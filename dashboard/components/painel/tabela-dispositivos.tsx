"use client";

import { Tabela, type ColunaTabela } from "./tabela";
import { Badge } from "@/components/ui/badge";
import { IndicadorLed } from "./indicador-led";
import { tempoRelativo } from "@/lib/formato";
import type { Dispositivo } from "@/lib/tipos";

/** Estações matriculadas. Colunas montadas no cliente (ver TabelaEquipes). */
export function TabelaDispositivos({ linhas }: { linhas: Dispositivo[] }) {
  const colunas: ColunaTabela<Dispositivo>[] = [
    {
      chave: "maquina",
      rotulo: "Estação",
      principal: true,
      valorOrdenacao: (d) => d.machine_name,
      render: (d) => (
        <span className="flex items-center gap-2">
          <IndicadorLed estado={d.status_online ? "ativo" : "offline"} />
          <span className="truncate font-medium text-slate-100">{d.machine_name}</span>
        </span>
      ),
    },
    {
      chave: "usuario",
      rotulo: "Último usuário",
      valorOrdenacao: (d) => d.os_user ?? "",
      render: (d) => <span className="truncate text-slate-400">{d.os_user ?? "—"}</span>,
    },
    {
      chave: "status",
      rotulo: "Status",
      render: (d) => (
        <Badge variante={d.status_online ? "ativo" : "offline"}>
          {d.status_online ? "online" : "offline"}
        </Badge>
      ),
    },
    {
      chave: "versao",
      rotulo: "Versão do agente",
      ocultarMobile: true,
      valorOrdenacao: (d) => d.agent_version ?? "",
      render: (d) => (
        <span className="font-mono text-xs text-slate-500">{d.agent_version ?? "—"}</span>
      ),
    },
    {
      chave: "sync",
      rotulo: "Última sincronização",
      alinhar: "direita",
      valorOrdenacao: (d) => d.last_sync_at ?? "",
      render: (d) => <span className="text-slate-400">{tempoRelativo(d.last_sync_at)}</span>,
    },
  ];

  return (
    <Tabela
      colunas={colunas}
      linhas={linhas}
      chave={(d) => d.id}
      ordenacaoInicial={{ coluna: "sync", direcao: "desc" }}
      vazio="Nenhuma estação matriculada."
    />
  );
}
