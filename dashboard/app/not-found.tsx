import Link from "next/link";
import { MarcaFocus } from "@/components/marca";

/** Endereço que não existe. Sem isso o Next mostra a página padrão, em inglês. */
export default function NaoEncontrado() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-fundo px-4 text-center">
      <MarcaFocus className="text-tinta" tomProduto="text-acao" />
      <div className="space-y-2">
        <h1 className="text-xl font-semibold text-slate-900">Página não encontrada</h1>
        <p className="max-w-sm text-sm leading-relaxed text-slate-500">
          O endereço pode ter mudado ou sido digitado errado.
        </p>
      </div>
      <Link
        href="/"
        className="inline-flex h-10 items-center rounded-lg bg-acao px-4 text-sm font-medium text-white hover:bg-acao-escuro"
      >
        Ir para o painel
      </Link>
    </main>
  );
}
