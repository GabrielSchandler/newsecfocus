"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Activity, LogOut, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { criarClienteNavegador } from "@/lib/supabase/client";
import { SeletorEmpresa } from "./seletor-empresa";
import { ROTULO_PAPEL } from "@/lib/sessao";
import type { ContextoSessao, EmpresaCliente } from "@/lib/tipos";

interface Props {
  contexto: ContextoSessao;
  /** Só chega preenchido para a operação da NewSec. */
  empresas?: EmpresaCliente[];
  empresaAtual?: string;
}

export function BarraTopo({ contexto, empresas, empresaAtual }: Props) {
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
    <header className="area-segura-topo sticky top-0 z-20 border-b border-borda bg-fundo/80 backdrop-blur-md">
      <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-2.5">
          {/* A marca só aparece no celular: no desktop ela já está na barra
              lateral, e repetir rouba espaço do nome da empresa. */}
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400 to-violet-500 shadow-glow lg:hidden">
            <Activity className="h-[18px] w-[18px] text-slate-950" />
          </span>
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

          {/* Conta e saída moram no "Mais" da barra de abas no celular; aqui
              ficam só para o desktop, que não tem essa barra. */}
          <Link
            href="/painel/conta"
            title="Minha conta"
            className="hidden items-center gap-2 rounded-lg border border-borda bg-fundo-suave px-2.5 py-1.5 transition-colors hover:border-slate-600 lg:flex"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-cyan-500/30 to-violet-500/30 text-xs font-medium text-cyan-200">
              {iniciais}
            </span>
            <span className="max-w-[180px] truncate text-xs text-slate-400">
              {contexto.email}
            </span>
          </Link>

          <Button variante="contorno" tamanho="sm" onClick={sair} className="hidden lg:inline-flex">
            <LogOut className="h-3.5 w-3.5" />
            Sair
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
