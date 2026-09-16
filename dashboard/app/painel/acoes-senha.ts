"use server";

// ============================================================================
//  Encerra a pendência de senha provisória.
//
//  Vale tanto para quem trocou a senha quanto para quem decidiu mantê-la: o que
//  o produto precisa registrar é que o dono do acesso DECIDIU. A troca em si
//  acontece no navegador, pelo próprio Supabase Auth.
// ============================================================================

import { revalidatePath } from "next/cache";
import { criarClienteServidor } from "@/lib/supabase/server";

export async function confirmarSenha(): Promise<void> {
  const supabase = await criarClienteServidor();
  await supabase.rpc("confirmar_senha_definida");
  revalidatePath("/painel", "layout");
}
