import Link from "next/link";
import { ChevronLeft, ShieldCheck } from "lucide-react";
import { SimboloNewSec } from "@/components/marca";
import { FormularioRecuperar } from "./formulario-recuperar";

export const metadata = { title: "Recuperar acesso — NewSec Focus" };

export default function PaginaRecuperar() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <SimboloNewSec className="mb-5 h-12 w-auto text-tinta" />
          <h1 className="text-2xl font-semibold text-slate-900">Recuperar acesso</h1>
          <p className="mt-1 text-sm text-slate-500">
            Enviamos um link para você definir uma senha nova
          </p>
        </div>

        <div className="rounded-xl2 border border-borda vidro p-6 shadow-glow">
          <FormularioRecuperar />
        </div>

        <Link
          href="/entrar"
          className="mt-6 flex items-center justify-center gap-1 text-xs text-slate-500 transition-colors hover:text-cyan-700"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Voltar para o login
        </Link>

        <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-xs text-slate-500">
          <ShieldCheck className="h-3.5 w-3.5" />
          Dados protegidos e coletados em conformidade com a LGPD.
        </p>
      </div>
    </main>
  );
}
