"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

export interface AbaPainel {
  chave: string;
  rotulo: string;
  /** Selo opcional à direita do rótulo (ex.: contagem de pendências). */
  selo?: number;
}

/**
 * Abas de conteúdo dentro de uma mesma tela — o mecanismo que deixa Visão geral,
 * Equipe e Pessoa concentrarem tudo num lugar só, em vez de espalhar em várias
 * páginas do menu. O estado vive na URL (um parâmetro só), então o recorte de
 * período e de escopo é preservado ao trocar de aba, o link é compartilhável e o
 * botão "voltar" funciona. Mesmo visual da navegação de Administração, para o
 * produto parecer uma coisa só.
 */
export function AbasPainel({
  abas,
  ativa,
  param = "visao",
}: {
  abas: AbaPainel[];
  ativa: string;
  param?: string;
}) {
  const pathname = usePathname();
  const params = useSearchParams();

  function href(chave: string) {
    const novos = new URLSearchParams(params.toString());
    // A primeira aba é o padrão: não suja a URL com o parâmetro.
    if (chave === abas[0]?.chave) novos.delete(param);
    else novos.set(param, chave);
    const qs = novos.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  return (
    <nav
      aria-label="Seções"
      className="flex gap-1 overflow-x-auto rounded-lg border border-borda bg-fundo-suave p-1"
    >
      {abas.map((a) => (
        <Link
          key={a.chave}
          href={href(a.chave)}
          aria-current={ativa === a.chave ? "page" : undefined}
          scroll={false}
          className={cn(
            "flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            ativa === a.chave
              ? "bg-cyan-500/15 text-cyan-300"
              : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-200",
          )}
        >
          {a.rotulo}
          {a.selo !== undefined && a.selo > 0 && (
            <span className="rounded-full bg-amber-500/20 px-1.5 text-xs text-amber-300">
              {a.selo}
            </span>
          )}
        </Link>
      ))}
    </nav>
  );
}
