import { MonitorSmartphone } from "lucide-react";
import { redirect } from "next/navigation";
import { AvisoErro, CabecalhoPagina, EstadoVazio } from "@/components/painel/cabecalho";
import { Tabela, type ColunaTabela } from "@/components/painel/tabela";
import { Badge } from "@/components/ui/badge";
import { IndicadorLed } from "@/components/painel/indicador-led";
import { criarClienteServidor } from "@/lib/supabase/server";
import { carregarContexto } from "@/lib/sessao";
import { comFalha } from "@/lib/carregar";
import { buscarDispositivos } from "@/lib/consultas";
import { tempoRelativo } from "@/lib/formato";
import type { Dispositivo } from "@/lib/tipos";

export const dynamic = "force-dynamic";

export default async function PaginaDispositivos() {
  const supabase = await criarClienteServidor();
  const contexto = await carregarContexto(supabase);

  if (!contexto) redirect("/entrar");

  const resultado = await comFalha(buscarDispositivos(supabase), []);
  const dispositivos = resultado.dados;
  const online = dispositivos.filter((d) => d.status_online).length;
  const limite = contexto.empresa.maxDispositivos;
  const ocupacao = limite > 0 ? (dispositivos.length / limite) * 100 : 0;

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
    <div className="space-y-5">
      <CabecalhoPagina
        titulo="Dispositivos"
        descricao={`${dispositivos.length} ${dispositivos.length === 1 ? "estação" : "estações"} · ${online} online`}
        icone={<MonitorSmartphone className="h-5 w-5 text-cyan-400" />}
      />

      {resultado.erro && <AvisoErro mensagem={resultado.erro} />}

      {limite > 0 && (
        <div className="rounded-xl2 border border-borda vidro p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-medium text-slate-200">Licenças do plano</h3>
            <p className="text-xs text-slate-500">
              {dispositivos.length} de {limite} estações do plano{" "}
              {contexto.empresa.plano.toLowerCase()}
            </p>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-800">
            <div
              className={`h-full rounded-full transition-all ${
                ocupacao >= 90
                  ? "bg-rose-400"
                  : ocupacao >= 70
                    ? "bg-amber-400"
                    : "bg-gradient-to-r from-cyan-400 to-violet-400"
              }`}
              style={{ width: `${Math.min(100, ocupacao)}%` }}
            />
          </div>
          {ocupacao >= 90 && (
            <p className="mt-2 text-xs text-rose-300">
              O limite do plano está próximo. Novas estações serão recusadas na matrícula ao
              atingir {limite}.
            </p>
          )}
        </div>
      )}

      {dispositivos.length === 0 ? (
        <EstadoVazio
          titulo="Nenhuma estação matriculada"
          descricao="Instale o agente numa máquina Windows com a chave de matrícula da empresa. Na primeira sincronização ela aparece aqui."
        />
      ) : (
        <Tabela
          colunas={colunas}
          linhas={dispositivos}
          chave={(d) => d.id}
          ordenacaoInicial={{ coluna: "sync", direcao: "desc" }}
        />
      )}
    </div>
  );
}
