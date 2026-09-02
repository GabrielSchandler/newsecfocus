// ============================================================================
//  Utilitários compartilhados pelas Edge Functions.
//  Cliente Supabase com service_role (ignora RLS — usado só no servidor),
//  hashing de token e helpers de resposta JSON.
// ============================================================================
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

export const cabecalhosCors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/** Cliente com a service_role key. Só existe dentro da Edge Function, nunca no cliente. */
export function clienteAdministrativo(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL")!;
  const chaveServico = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(url, chaveServico, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** SHA-256 do token, em hex. Guardamos só o hash no banco; o texto vive na máquina. */
export async function hashToken(token: string): Promise<string> {
  const dados = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", dados);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Gera um token de dispositivo opaco (32 bytes aleatórios em hex). */
export function gerarToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function json(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...cabecalhosCors, "Content-Type": "application/json" },
  });
}

export function erro(mensagem: string, status = 400): Response {
  return json({ error: mensagem }, status);
}

/** Extrai o token do cabeçalho Authorization: Bearer <token>. */
export function tokenDoCabecalho(req: Request): string | null {
  const auth = req.headers.get("authorization") ?? "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}
