import { redirect } from "next/navigation";
import { criarClienteServidor } from "@/lib/supabase/server";

export default async function Inicio() {
  const supabase = await criarClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  redirect(user ? "/painel" : "/entrar");
}
