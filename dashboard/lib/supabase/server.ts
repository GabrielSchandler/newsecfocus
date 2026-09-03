import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { cache } from "react";

/** Formato dos cookies que o Supabase pede para gravar na resposta. */
type CookieParaDefinir = { name: string; value: string; options?: CookieOptions };

/**
 * Cliente Supabase para Server Components e Route Handlers. No Next 15, cookies()
 * é assíncrono. Em Server Components a escrita de cookie pode falhar (contexto
 * somente-leitura) — engolimos o erro; a renovação de sessão fica a cargo do middleware.
 *
 * cache() faz o mesmo request devolver sempre a MESMA instância. Sem isso, o
 * layout e a página (que sempre criam o cliente de novo) tinham instâncias
 * diferentes, e carregarContexto() perdia a chance de deduplicar a consulta
 * de perfil/empresa entre os dois — dobrando uma ida ao banco em toda
 * navegação. O middleware já revalida a sessão a cada request, então
 * reaproveitar o cliente dentro do MESMO request é seguro.
 */
export const criarClienteServidor = cache(async () => {
  const armazenamento = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return armazenamento.getAll();
        },
        setAll(cookiesParaDefinir: CookieParaDefinir[]) {
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
});
