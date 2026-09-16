"use client";

import { createBrowserClient } from "@supabase/ssr";
import { criarClienteLocal } from "./local";

/**
 * Cliente Supabase para uso no navegador (Client Components). Usa a chave anon;
 * o RLS garante que o usuário só enxerga a própria organização.
 */
export function criarClienteNavegador() {
  // Banco local de desenvolvimento: o navegador fala com a rota de ponte.
  if (process.env.NODE_ENV === "development" && process.env.NEXT_PUBLIC_FOCUS_BANCO_LOCAL === "1") {
    return criarClienteLocal({ base: "/api/banco-local" }) as unknown as ReturnType<typeof createBrowserClient>;
  }
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
