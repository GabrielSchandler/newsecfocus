import * as React from "react";
import { redirect } from "next/navigation";
import { NavegacaoLateral } from "@/components/painel/navegacao-lateral";
import { itensDoMenu } from "@/lib/menu";
import { BarraTopo } from "@/components/painel/barra-topo";
import { BannerPendencias } from "@/components/painel/banner-pendencias";
import { criarClienteServidor } from "@/lib/supabase/server";
import { carregarContexto, podeAdministrar } from "@/lib/sessao";
import { buscarEmpresasClientes } from "@/lib/consultas";
import type { EmpresaCliente } from "@/lib/tipos";

export default async function LayoutPainel({ children }: { children: React.ReactNode }) {
  const supabase = await criarClienteServidor();
  const contexto = await carregarContexto(supabase);

  if (!contexto) redirect("/entrar");

  const itens = itensDoMenu({
    podeAdministrar: podeAdministrar(contexto),
    adminPlataforma: contexto.adminPlataforma,
  });

  // Só a operação da NewSec troca de empresa; para os demais nem carregamos.
  let empresas: EmpresaCliente[] = [];
  if (contexto.adminPlataforma) {
    try {
      empresas = await buscarEmpresasClientes(supabase);
    } catch {
      // Sem a lista, o seletor some e o painel segue na empresa do perfil.
    }
  }

  return (
    <div className="flex min-h-screen">
      <NavegacaoLateral itens={itens} />
      <div className="flex min-w-0 flex-1 flex-col">
        <BarraTopo contexto={contexto} itens={itens} empresas={empresas} />
        <main className="flex-1 space-y-4 p-4 sm:p-6">
          <BannerPendencias />
          {children}
        </main>
      </div>
    </div>
  );
}
