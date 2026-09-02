import { Building2, ShieldCheck } from "lucide-react";
import { redirect } from "next/navigation";
import { AvisoErro, CabecalhoPagina } from "@/components/painel/cabecalho";
import { Card } from "@/components/ui/card";
import { FormularioNovaEmpresa, TabelaEmpresas } from "./formularios";
import { criarClienteServidor } from "@/lib/supabase/server";
import { carregarContexto } from "@/lib/sessao";
import { comFalha } from "@/lib/carregar";
import { buscarEmpresasClientes } from "@/lib/consultas";
import { formatarNumero } from "@/lib/formato";

export const dynamic = "force-dynamic";

export default async function PaginaPlataforma() {
  const supabase = await criarClienteServidor();
  const contexto = await carregarContexto(supabase);

  if (!contexto) redirect("/entrar");
  if (!contexto.adminPlataforma) redirect("/painel");

  const resultado = await comFalha(buscarEmpresasClientes(supabase), []);
  const empresas = resultado.dados;

  const ativas = empresas.filter((e) => e.status === "ATIVA").length;
  const avaliacao = empresas.filter((e) => e.status === "TRIAL").length;
  const estacoes = empresas.reduce((s, e) => s + e.dispositivos, 0);
  const online = empresas.reduce((s, e) => s + e.dispositivosOnline, 0);

  return (
    <div className="space-y-5">
      <CabecalhoPagina
        titulo="Plataforma"
        descricao="Carteira de empresas clientes, planos e licenças."
        icone={<Building2 className="h-5 w-5 text-cyan-400" />}
      />

      <Card className="flex items-start gap-3 border-violet-500/20 p-4">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-violet-400" />
        <p className="text-xs leading-relaxed text-slate-400">
          Esta área administra <strong>contas</strong>. Por desenho, a operação da plataforma não
          tem acesso de leitura à telemetria das empresas clientes — as políticas de segurança do
          banco liberam organizações, usuários e dispositivos, e nunca a atividade coletada. Os
          dados de produtividade pertencem a cada empresa contratante.
        </p>
      </Card>

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Indicador rotulo="Empresas" valor={formatarNumero(empresas.length)} />
        <Indicador rotulo="Contas ativas" valor={formatarNumero(ativas)} />
        <Indicador rotulo="Em avaliação" valor={formatarNumero(avaliacao)} />
        <Indicador
          rotulo="Estações"
          valor={formatarNumero(estacoes)}
          detalhe={`${formatarNumero(online)} online agora`}
        />
      </section>

      {resultado.erro && <AvisoErro mensagem={resultado.erro} />}

      <FormularioNovaEmpresa />

      <TabelaEmpresas empresas={empresas} />
    </div>
  );
}

function Indicador({
  rotulo,
  valor,
  detalhe,
}: {
  rotulo: string;
  valor: string;
  detalhe?: string;
}) {
  return (
    <Card className="p-5">
      <p className="text-xs uppercase tracking-wide text-slate-500">{rotulo}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-100">{valor}</p>
      {detalhe && <p className="mt-1 text-xs text-slate-500">{detalhe}</p>}
    </Card>
  );
}
