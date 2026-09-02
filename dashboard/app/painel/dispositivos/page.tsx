import { MonitorSmartphone } from "lucide-react";
import { redirect } from "next/navigation";
import { AvisoErro, CabecalhoPagina, EstadoVazio } from "@/components/painel/cabecalho";
import { TabelaDispositivos } from "@/components/painel/tabela-dispositivos";
import { criarClienteServidor } from "@/lib/supabase/server";
import { carregarContexto } from "@/lib/sessao";
import { comFalha } from "@/lib/carregar";
import { buscarDispositivos } from "@/lib/consultas";

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
        <TabelaDispositivos linhas={dispositivos} />
      )}
    </div>
  );
}
