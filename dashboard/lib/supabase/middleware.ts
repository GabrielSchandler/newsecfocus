import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/** Formato dos cookies que o Supabase pede para gravar na resposta. */
type CookieParaDefinir = { name: string; value: string; options?: CookieOptions };

/** Rotas que exigem sessão. */
const ROTAS_PROTEGIDAS = ["/painel", "/plataforma"];

/**
 * Renova a sessão do Supabase a cada request e protege as rotas autenticadas.
 * Sem sessão em rota protegida -> redireciona para /entrar. Com sessão em
 * /entrar -> manda para /painel.
 */
export async function atualizarSessao(request: NextRequest) {
  let resposta = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesParaDefinir: CookieParaDefinir[]) {
          cookiesParaDefinir.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          resposta = NextResponse.next({ request });
          cookiesParaDefinir.forEach(({ name, value, options }) =>
            resposta.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const caminho = request.nextUrl.pathname;
  const rotaProtegida = ROTAS_PROTEGIDAS.some(
    (rota) => caminho === rota || caminho.startsWith(`${rota}/`),
  );
  const rotaEntrada = caminho.startsWith("/entrar");

  if (rotaProtegida && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/entrar";
    return NextResponse.redirect(url);
  }

  if (rotaEntrada && user) {
    const url = request.nextUrl.clone();
    url.pathname = "/painel";
    return NextResponse.redirect(url);
  }

  return resposta;
}
