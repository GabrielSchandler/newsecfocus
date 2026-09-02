import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Cliente Supabase para Server Components e Route Handlers. No Next 15, cookies()
 * é assíncrono. Em Server Components a escrita de cookie pode falhar (contexto
 * somente-leitura) — engolimos o erro; a renovação de sessão fica a cargo do middleware.
 */
export async function criarClienteServidor() {
  const armazenamento = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return armazenamento.getAll();
        },
        setAll(cookiesParaDefinir) {
          try {
            cookiesParaDefinir.forEach(({ name, value, options }) =>
              armazenamento.set(name, value, options),
            );
          } catch {
            // Server Component sem permissão de escrita: ignorado de propósito.
          }
        },
      },
    },
  );
}
