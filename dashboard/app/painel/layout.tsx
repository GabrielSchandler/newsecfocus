import * as React from "react";
import { redirect } from "next/navigation";
import { NavegacaoLateral } from "@/components/painel/navegacao-lateral";
import { BarraTopo } from "@/components/painel/barra-topo";
import { criarClienteServidor } from "@/lib/supabase/server";

export default async function LayoutPainel({ children }: { children: React.ReactNode }) {
  const supabase = await criarClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/entrar");

  const { data: perfil } = await supabase
    .from("profiles")
    .select("full_name, organizations(name)")
    .eq("id", user.id)
    .maybeSingle();

  // A junção to-one pode vir como objeto ou array conforme a versão do client.
  const orgBruta = perfil?.organizations as
    | { name?: string }
    | { name?: string }[]
    | null
    | undefined;
  const organizacao =
    (Array.isArray(orgBruta) ? orgBruta[0]?.name : orgBruta?.name) ?? "Sua organização";

  return (
    <div className="flex min-h-screen">
      <NavegacaoLateral />
      <div className="flex min-w-0 flex-1 flex-col">
        <BarraTopo email={user.email ?? "usuário"} organizacao={organizacao} />
        <main className="flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
