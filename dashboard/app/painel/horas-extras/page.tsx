import { redirect } from "next/navigation";
import type { ParamsPagina } from "@/lib/filtros-url";

/**
 * Horas extras virou parte de Jornada ("fora da escala"). O endereço antigo
 * continua valendo para links salvos e leva ao mesmo recorte.
 */
export default async function PaginaHorasExtras({
  searchParams,
}: {
  searchParams: Promise<ParamsPagina>;
}) {
  const params = await searchParams;
  const busca = new URLSearchParams();
  for (const [chave, valor] of Object.entries(params)) {
    const v = Array.isArray(valor) ? valor[0] : valor;
    if (v) busca.set(chave, v);
  }
  const q = busca.toString();
  redirect(`/painel/jornada${q ? `?${q}` : ""}`);
}
