"use client";

import Link from "next/link";
import { Building2 } from "lucide-react";
import { SimboloNewSec } from "@/components/marca";
import { SeletorEmpresa } from "./seletor-empresa";
import { iniciaisDe } from "./navegacao-lateral";
import { ROTULO_PAPEL } from "@/lib/sessao";
import type { ContextoSessao, EmpresaCliente } from "@/lib/tipos";

interface Props {
  contexto: ContextoSessao;
  /** Só chega preenchido para a operação da NewSec. */
  empresas?: EmpresaCliente[];
  empresaAtual?: string;
}

/**
 * Faixa do topo: de quem são os números (a empresa) e quem está olhando.
 *
 * Na operação da NewSec a empresa é um seletor; para a empresa cliente é só o
 * nome, sem seta — não há o que escolher, e uma seta que não abre nada é pior
 * que nenhuma.
 */
export function BarraTopo({ contexto, empresas, empresaAtual }: Props) {
  const identificacao = contexto.nome ?? contexto.email;
  const suspensa =
    contexto.empresa.status === "SUSPENSA" || contexto.empresa.status === "CANCELADA";
  const podeTrocar = contexto.adminPlataforma && empresas && empresas.length > 0;

  return (
    <header className="area-segura-topo sticky top-0 z-20 border-b border-borda bg-white">
      <div className="flex h-16 items-center justify-between gap-3 px-4 sm:px-6 lg:h-[68px]">
        <div className="flex min-w-0 items-center gap-3">
          {/* A marca só aparece no celular: no desktop ela já está na barra
              lateral, e repetir rouba espaço do nome da empresa. */}
          <SimboloNewSec className="h-7 w-auto shrink-0 text-tinta lg:hidden" />

          {podeTrocar ? (
            <SeletorEmpresa empresas={empresas} empresaAtual={empresaAtual ?? contexto.empresa.id} />
          ) : (
            <div className="flex min-w-0 items-center gap-2.5 rounded-lg border-borda lg:h-11 lg:border lg:px-3.5">
              <Building2 className="hidden h-[18px] w-[18px] shrink-0 text-slate-600 lg:block" />
              <div className="min-w-0 leading-tight">
                <p className="truncate text-[15px] font-medium text-slate-900">
                  {contexto.empresa.nome}
                </p>
                <p className="truncate text-xs text-slate-500 lg:hidden">
                  {ROTULO_PAPEL[contexto.papel]}
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-3">
          {contexto.empresa.status === "TRIAL" && (
            <span className="hidden items-center rounded-full border border-acao/20 bg-acao-suave px-3 py-1 text-xs font-medium text-acao sm:inline-flex">
              Período de teste
            </span>
          )}

          {/* No celular, conta e saída moram no "Mais" da barra de abas. */}
          <Link
            href="/painel/conta"
            title={`Minha conta · ${identificacao}`}
            className="hidden h-10 w-10 items-center justify-center rounded-full bg-slate-500 text-sm font-semibold text-white transition-opacity hover:opacity-90 lg:flex"
          >
            {iniciaisDe(identificacao)}
          </Link>
        </div>
      </div>

      {suspensa && (
        <p className="border-t border-rose-200 bg-rose-50 px-4 py-2 text-xs text-rose-800 sm:px-6">
          Esta conta está <strong>{contexto.empresa.status.toLowerCase()}</strong>. A coleta nas
          estações está pausada e os dados mostrados são os últimos recebidos.
        </p>
      )}
    </header>
  );
}
