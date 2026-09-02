import { AppWindow } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { criarClienteServidor } from "@/lib/supabase/server";
import { buscarDistribuicao } from "@/lib/consultas";
import { formatarHoras } from "@/lib/formato";
import type { FatiaDistribuicao } from "@/lib/tipos";

export const dynamic = "force-dynamic";

export default async function PaginaAplicativos() {
  const supabase = await criarClienteServidor();

  let apps: FatiaDistribuicao[] = [];
  try {
    apps = await buscarDistribuicao(supabase, "7dias", "todos");
  } catch {
    /* renderiza vazio */
  }

  const maior = apps.reduce((m, a) => Math.max(m, a.minutos), 0);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <AppWindow className="h-5 w-5 text-violet-400" />
        <div>
          <h2 className="text-lg font-semibold text-slate-100">Aplicativos e sites</h2>
          <p className="text-sm text-slate-500">tempo de foco nos últimos 7 dias</p>
        </div>
      </div>

      <Card className="p-5">
        {apps.length === 0 ? (
          <p className="py-12 text-center text-slate-500">
            Sem uso registrado nos últimos 7 dias.
          </p>
        ) : (
          <ul className="space-y-4">
            {apps.map((a) => (
              <li key={a.nome}>
                <div className="mb-1.5 flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 text-slate-200">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: a.cor }} />
                    {a.nome}
                  </span>
                  <span className="flex items-center gap-3">
                    <Badge variante="neutro">{formatarHoras(a.minutos)}</Badge>
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${maior > 0 ? (a.minutos / maior) * 100 : 0}%`,
                      background: a.cor,
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
