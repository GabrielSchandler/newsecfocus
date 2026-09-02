"use client";

import { useRouter } from "next/navigation";
import { LogOut, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { criarClienteNavegador } from "@/lib/supabase/client";

interface Props {
  email: string;
  organizacao: string;
}

export function BarraTopo({ email, organizacao }: Props) {
  const router = useRouter();

  async function sair() {
    const supabase = criarClienteNavegador();
    await supabase.auth.signOut();
    router.replace("/entrar");
    router.refresh();
  }

  const iniciais = email.slice(0, 2).toUpperCase();

  return (
    <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-borda bg-fundo/80 px-5 py-3 backdrop-blur-md">
      <div className="flex flex-col">
        <h1 className="text-base font-semibold text-slate-100">Painel de Produtividade</h1>
        <span className="text-xs text-slate-500">{organizacao}</span>
      </div>

      <div className="flex items-center gap-3">
        <Badge variante="roxo" className="hidden sm:inline-flex">
          <ShieldCheck className="h-3 w-3" />
          LGPD
        </Badge>

        <div className="flex items-center gap-2 rounded-lg border border-borda bg-fundo-suave px-2.5 py-1.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-cyan-500/30 to-violet-500/30 text-xs font-medium text-cyan-200">
            {iniciais}
          </span>
          <span className="hidden max-w-[180px] truncate text-xs text-slate-400 sm:block">
            {email}
          </span>
        </div>

        <Button variante="contorno" tamanho="sm" onClick={sair}>
          <LogOut className="h-3.5 w-3.5" />
          Sair
        </Button>
      </div>
    </header>
  );
}
