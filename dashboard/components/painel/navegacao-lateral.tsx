"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { MarcaFocus } from "@/components/marca";
import { criarClienteNavegador } from "@/lib/supabase/client";
import { ROTULO_PAPEL } from "@/lib/sessao";
import type { ItemNavegacao } from "@/lib/menu";
import type { ContextoSessao } from "@/lib/tipos";
import { ICONES_MENU, itemAtivo } from "./icones-menu";

function Links({ itens, caminho }: { itens: ItemNavegacao[]; caminho: string }) {
  return (
    <ul className="flex flex-col gap-1">
      {itens.map(({ href, rotulo, icone }) => {
        const Icone = ICONES_MENU[icone];
        const ativo = itemAtivo(caminho, href);
        return (
          <li key={href}>
            <Link
              href={href}
              aria-current={ativo ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-3 text-[15px] transition-colors",
                ativo
                  ? "bg-marinho-ativo font-medium text-white"
                  : "text-marinho-texto hover:bg-white/5 hover:text-white",
              )}
            >
              <Icone
                className={cn("h-5 w-5 shrink-0", ativo ? "text-cyan-300" : "text-marinho-texto/80")}
                strokeWidth={1.75}
              />
              {rotulo}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Barra lateral fixa — desktop. O único bloco escuro da tela: ancora a
 * navegação e deixa o conteúdo inteiro para os números.
 *
 * Embaixo ficam o que é gestão (Administração, Plataforma) e quem está logado.
 * Conta e saída moravam no topo; aqui o topo fica livre para o recorte.
 */
export function NavegacaoLateral({
  itens,
  contexto,
}: {
  itens: ItemNavegacao[];
  contexto: ContextoSessao;
}) {
  const caminho = usePathname();
  const router = useRouter();
  const [saindo, setSaindo] = useState(false);

  const consulta = itens.filter((i) => i.grupo === "consulta");
  const gestao = itens.filter((i) => i.grupo === "gestao");

  const identificacao = contexto.nome ?? contexto.email;
  const iniciais = iniciaisDe(identificacao);

  async function sair() {
    setSaindo(true);
    const supabase = criarClienteNavegador();
    await supabase.auth.signOut();
    router.replace("/entrar");
    router.refresh();
  }

  return (
    <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col bg-marinho text-white lg:flex">
      <Link href="/painel" className="px-7 pb-7 pt-6" aria-label="NewSec Focus — Visão geral">
        <MarcaFocus />
      </Link>

      <nav aria-label="Navegação principal" className="flex flex-1 flex-col px-3">
        <Links itens={consulta} caminho={caminho} />
        {gestao.length > 0 && (
          <div className="mt-auto pb-4">
            <Links itens={gestao} caminho={caminho} />
          </div>
        )}
      </nav>

      <div className="mx-4 flex items-center gap-3 border-t border-marinho-borda px-1 py-5">
        <Link
          href="/painel/conta"
          title="Minha conta"
          className="flex min-w-0 flex-1 items-center gap-3 rounded-lg transition-opacity hover:opacity-90"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-500/60 text-sm font-semibold text-white">
            {iniciais}
          </span>
          <span className="min-w-0 leading-tight">
            <span className="block truncate text-sm font-medium text-white">{identificacao}</span>
            <span className="block truncate text-xs text-marinho-texto">
              {ROTULO_PAPEL[contexto.papel]}
            </span>
          </span>
        </Link>
        <button
          type="button"
          onClick={sair}
          disabled={saindo}
          title="Sair"
          aria-label="Sair da conta"
          className="shrink-0 rounded-md p-2 text-marinho-texto transition-colors hover:bg-white/5 hover:text-white disabled:opacity-50"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </aside>
  );
}

/** "Gabriel Marques" → "GM"; e-mail ou nome único → duas primeiras letras. */
export function iniciaisDe(identificacao: string): string {
  const partes = identificacao.split("@")[0].trim().split(/\s+/).filter(Boolean);
  if (partes.length >= 2) return `${partes[0][0]}${partes[partes.length - 1][0]}`.toUpperCase();
  return identificacao.slice(0, 2).toUpperCase();
}
