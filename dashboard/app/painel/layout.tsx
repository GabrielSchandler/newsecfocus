import * as React from "react";
import { redirect } from "next/navigation";
import { NavegacaoLateral } from "@/components/painel/navegacao-lateral";
import { NavegacaoInferior } from "@/components/painel/navegacao-inferior";
import { itensDoMenu } from "@/lib/menu";
import { BarraTopo } from "@/components/painel/barra-topo";
import { PrimeiroAcesso } from "@/components/painel/primeiro-acesso";
import { BannerPendencias } from "@/components/painel/banner-pendencias";
import { ConviteInstalar } from "@/components/painel/convite-instalar";
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

  // Senha criada por um administrador: o dono decide trocar ou manter antes de
  // usar o painel. Fica sobre tudo, porque adiar essa decisão é nunca tomá-la.
  if (contexto.senhaProvisoria) {
    return <PrimeiroAcesso nome={contexto.nome} />;
  }

  return (
    <div className="flex min-h-screen">
      <NavegacaoLateral itens={itens} contexto={contexto} />
      <div className="flex min-w-0 flex-1 flex-col">
        <BarraTopo contexto={contexto} empresas={empresas} />
        {/* espaco-navegacao: reserva a altura da barra de abas do celular
            (mais a área segura do iPhone) para o fim do conteúdo não ficar
            embaixo dela. No desktop a barra não existe e a classe some. */}
        <main className="espaco-navegacao mx-auto w-full max-w-[1480px] flex-1 space-y-4 p-4 sm:p-5 lg:px-6 lg:pb-8">
          <ConviteInstalar />
          {/* A Visão geral desenha o aviso de estação parada no meio da tela,
              junto dos números que ele afeta; nas demais ele fica no topo. */}
          <BannerPendencias ocultarEm="/painel" />
          {children}
        </main>
      </div>

      <NavegacaoInferior itens={itens} contexto={contexto} />
    </div>
  );
}
