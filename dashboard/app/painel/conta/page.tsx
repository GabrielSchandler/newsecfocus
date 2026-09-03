import { UserCog } from "lucide-react";
import { redirect } from "next/navigation";
import { CabecalhoPagina } from "@/components/painel/cabecalho";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FormularioConta } from "./formulario-conta";
import { criarClienteServidor } from "@/lib/supabase/server";
import { ROTULO_PAPEL, carregarContexto } from "@/lib/sessao";

export const dynamic = "force-dynamic";

export default async function PaginaConta() {
  const supabase = await criarClienteServidor();
  const contexto = await carregarContexto(supabase);

  if (!contexto) redirect("/entrar");

  return (
    <div className="max-w-3xl space-y-5">
      <CabecalhoPagina
        titulo="Minha conta"
        descricao="Seu nome, sua senha e o que você enxerga no painel."
        icone={<UserCog className="h-5 w-5 text-cyan-400" />}
      />

      <Card className="p-5">
        <h3 className="text-sm font-medium text-slate-200">Seu acesso</h3>
        <dl className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs text-slate-500">E-mail</dt>
            <dd className="mt-0.5 break-all text-sm text-slate-200">{contexto.email}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Empresa</dt>
            <dd className="mt-0.5 text-sm text-slate-200">{contexto.empresa.nome}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Papel</dt>
            <dd className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-slate-200">
              {ROTULO_PAPEL[contexto.papel]}
              {contexto.adminPlataforma && <Badge variante="roxo">operação da plataforma</Badge>}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Alcance</dt>
            <dd className="mt-0.5 text-sm text-slate-200">
              {contexto.equipeEscopo
                ? "Somente a sua equipe"
                : "A empresa inteira"}
            </dd>
          </div>
        </dl>
        <p className="mt-4 text-xs leading-relaxed text-slate-600">
          Papel e alcance são definidos por quem administra a conta, em Administração ›
          Acessos. Se precisar de mais permissão, fale com o proprietário da conta.
        </p>
      </Card>

      <FormularioConta nomeAtual={contexto.nome} />
    </div>
  );
}
