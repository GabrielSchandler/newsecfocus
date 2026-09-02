import { FormularioLogin } from "./formulario-login";
import { Activity, ShieldCheck } from "lucide-react";

export default function PaginaEntrar() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400 to-violet-500 shadow-glow">
            <Activity className="h-7 w-7 text-slate-950" />
          </div>
          <h1 className="text-2xl font-semibold text-slate-100">NewSec Focus</h1>
          <p className="mt-1 text-sm text-slate-500">
            Acesse o painel de gestão da sua organização
          </p>
        </div>

        <div className="rounded-xl2 border border-borda vidro p-6 shadow-glow">
          <FormularioLogin />
        </div>

        <p className="mt-6 flex items-center justify-center gap-1.5 text-center text-xs text-slate-600">
          <ShieldCheck className="h-3.5 w-3.5" />
          Dados protegidos e coletados em conformidade com a LGPD.
        </p>
      </div>
    </main>
  );
}
