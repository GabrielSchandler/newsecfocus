// Ponte do navegador para o banco local de desenvolvimento (npm run dev:local).
// Fora desse modo a rota não existe: responde 404 sempre.
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { bancoLocalAtivo } from "@/lib/supabase/local";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!bancoLocalAtivo()) return new NextResponse(null, { status: 404 });
  const pedido = await request.json();
  const usuario = (await cookies()).get("focus_local_usuario")?.value;
  const resposta = await fetch(process.env.FOCUS_BANCO_LOCAL!, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...pedido, usuario }),
  });
  return new NextResponse(await resposta.text(), {
    headers: { "content-type": "application/json" },
  });
}

/** Troca o papel simulado: /api/banco-local?usuario=lider (dono, gestor, lider, leitor). */
export async function GET(request: NextRequest) {
  if (!bancoLocalAtivo()) return new NextResponse(null, { status: 404 });
  const usuario = request.nextUrl.searchParams.get("usuario") ?? "dono";
  const destino = request.nextUrl.searchParams.get("voltar") ?? "/painel";
  const resposta = NextResponse.redirect(new URL(destino, request.url));
  resposta.cookies.set("focus_local_usuario", usuario, { path: "/" });
  return resposta;
}
