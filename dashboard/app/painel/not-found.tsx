import Link from "next/link";
import { SearchX } from "lucide-react";
import { Card } from "@/components/ui/card";

/**
 * Equipe ou pessoa que não existe — ou que existe, mas fica fora do alcance de
 * quem pediu (o líder abrindo a equipe de outro líder). As duas situações têm a
 * mesma resposta de propósito: dizer "sem permissão" confirmaria que o registro
 * existe. Fica dentro do layout do painel, então o menu continua à mão.
 */
export default function NaoEncontradoNoPainel() {
  return (
    <Card className="mx-auto mt-4 flex max-w-xl flex-col items-center gap-2 p-8 text-center sm:mt-10 sm:p-10">
      <SearchX className="h-7 w-7 text-slate-400" strokeWidth={1.75} />
      <h1 className="mt-1 text-lg font-semibold text-slate-900">Não encontrado</h1>
      <p className="text-sm leading-relaxed text-slate-500">
        Esta página não existe ou não faz parte do que o seu acesso alcança. Se precisar dela,
        fale com quem administra a conta da empresa.
      </p>
      <Link
        href="/painel"
        className="mt-3 inline-flex h-10 items-center rounded-lg border border-acao/70 px-4 text-sm font-medium text-acao hover:bg-acao-suave"
      >
        Voltar para a visão geral
      </Link>
    </Card>
  );
}
