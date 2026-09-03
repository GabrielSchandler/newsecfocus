"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { criarClienteNavegador } from "@/lib/supabase/client";
import { MenuMobile } from "./navegacao-lateral";
import { SeletorEmpresa } from "./seletor-empresa";
import type { ItemNavegacao } from "@/lib/menu";
import { ROTULO_PAPEL } from "@/lib/sessao";
import type { ContextoSessao, EmpresaCliente } from "@/lib/tipos";

interface Props {
  contexto: ContextoSessao;
  itens: ItemNavegacao[];
  /** Só chega preenchido para a operação da NewSec. */
  empresas?: EmpresaCliente[];
  empresaAtual?: string;
}

export function BarraTopo({ contexto, itens, empresas, empresaAtual }: Props) {
  const router = useRouter();

  async function sair() {
    const supabase = criarClienteNavegador();
    await supabase.auth.signOut();
    router.replace("/entrar");
    router.refresh();
  }

  const identificacao = contexto.nome ?? contexto.email;
  const iniciais = identificacao.slice(0, 2).toUpperCase();
  const suspensa =
    contexto.empresa.status === "SUSPENSA" || contexto.empresa.status === "CANCELADA";

  return (
    <header className="sticky top-0 z-20 border-b border-borda bg-fundo/80 backdrop-blur-md">
      <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <MenuMobile itens={itens} />
          <div className="min-w-0 leading-tight">
            <h1 className="truncate text-base font-semibold text-slate-100">
              {contexto.empresa.nome}
            </h1>
            <p className="truncate text-xs text-slate-500">
              {ROTULO_PAPEL[contexto.papel]}
              {contexto.empresa.plano ? ` · plano ${contexto.empresa.plano.toLowerCase()}` : ""}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          {contexto.adminPlataforma && empresas && empresas.length > 0 && (
            <SeletorEmpresa
              empresas={empresas}
              empresaAtual={empresaAtual ?? contexto.empresa.id}
            />
          )}

          <Badge variante="roxo" className="hidden md:inline-flex">
            <ShieldCheck className="h-3 w-3" />
            LGPD
          </Badge>

          <Link
            href="/painel/conta"
            title="Minha conta"
            className="flex items-center gap-2 rounded-lg border border-borda bg-fundo-suave px-2.5 py-1.5 transition-colors hover:border-slate-600"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-cyan-500/30 to-violet-500/30 text-xs font-medium text-cyan-200">
              {iniciais}
            </span>
            <span className="hidden max-w-[180px] truncate text-xs text-slate-400 lg:block">
              {contexto.email}
            </span>
          </Link>

          <Button variante="contorno" tamanho="sm" onClick={sair}>
            <LogOut className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Sair</span>
          </Button>
        </div>
      </div>

      {suspensa && (
        <p className="border-t border-rose-500/20 bg-rose-500/10 px-4 py-2 text-xs text-rose-200 sm:px-5">
          Esta conta está <strong>{contexto.empresa.status.toLowerCase()}</strong>. A coleta nas
          estações está pausada e os dados mostrados são os últimos recebidos.
        </p>
      )}
    </header>
  );
}
