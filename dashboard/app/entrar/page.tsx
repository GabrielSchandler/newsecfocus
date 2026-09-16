import { FormularioLogin } from "./formulario-login";
import { BaixarAgente } from "@/components/painel/baixar-agente";
import { ShieldCheck } from "lucide-react";
import { SimboloNewSec } from "@/components/marca";

export default function PaginaEntrar() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <SimboloNewSec className="mb-5 h-12 w-auto text-tinta" />
          <h1 className="text-2xl font-semibold text-slate-900">NewSec Focus</h1>
          <p className="mt-1 text-sm text-slate-500">
            Acesse o painel de gestão da sua organização
          </p>
        </div>

        <div className="rounded-xl2 border border-borda vidro p-6 shadow-glow">
          <FormularioLogin />
        </div>

        <BaixarAgente />

        <p className="mt-6 flex items-center justify-center gap-1.5 text-center text-xs text-slate-500">
          <ShieldCheck className="h-3.5 w-3.5" />
          Dados protegidos e coletados em conformidade com a LGPD.
        </p>
      </div>
    </main>
  );
}
