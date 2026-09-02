import * as React from "react";
import { redirect } from "next/navigation";
import { NavegacaoLateral } from "@/components/painel/navegacao-lateral";
import { itensDoMenu } from "@/lib/menu";
import { BarraTopo } from "@/components/painel/barra-topo";
import { criarClienteServidor } from "@/lib/supabase/server";
import { carregarContexto, podeAdministrar } from "@/lib/sessao";

/**
 * Área da revenda. Só quem está em plataforma_admins entra — quem não está é
 * devolvido para o painel da própria empresa.
 */
export default async function LayoutPlataforma({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await criarClienteServidor();
  const contexto = await carregarContexto(supabase);

  if (!contexto) redirect("/entrar");
  if (!contexto.adminPlataforma) redirect("/painel");

  const itens = itensDoMenu({
    podeAdministrar: podeAdministrar(contexto),
    adminPlataforma: true,
  });

  return (
    <div className="flex min-h-screen">
      <NavegacaoLateral itens={itens} />
      <div className="flex min-w-0 flex-1 flex-col">
        <BarraTopo contexto={contexto} itens={itens} />
        <main className="flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
