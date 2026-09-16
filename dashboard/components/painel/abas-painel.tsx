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
  variante = "segmentado",
  preservar,
}: {
  abas: AbaPainel[];
  ativa: string;
  param?: string;
  /** "segmentado": botões num trilho (filtros). "sublinhado": abas de seção. */
  variante?: "segmentado" | "sublinhado";
  /** Parâmetros a apagar ao trocar de aba (ex.: página da lista anterior). */
  preservar?: { apagar: string[] };
}) {
  const pathname = usePathname();
  const params = useSearchParams();

  function href(chave: string) {
    const novos = new URLSearchParams(params.toString());
    for (const chave of preservar?.apagar ?? []) novos.delete(chave);
    // A primeira aba é o padrão: não suja a URL com o parâmetro.
    if (chave === abas[0]?.chave) novos.delete(param);
    else novos.set(param, chave);
    const qs = novos.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  if (variante === "sublinhado") {
    return (
      <nav aria-label="Seções" className="flex gap-6 overflow-x-auto border-b border-borda">
        {abas.map((a) => (
          <Link
            key={a.chave}
            href={href(a.chave)}
            aria-current={ativa === a.chave ? "page" : undefined}
            scroll={false}
            className={cn(
              "-mb-px flex items-center gap-1.5 whitespace-nowrap border-b-2 px-0.5 pb-2.5 pt-1 text-sm font-medium transition-colors",
              ativa === a.chave
                ? "border-acao text-acao"
                : "border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-900",
            )}
          >
            {a.rotulo}
            {a.selo !== undefined && a.selo > 0 && (
              <span className="rounded-full bg-amber-100 px-1.5 text-xs text-amber-800">{a.selo}</span>
            )}
          </Link>
        ))}
      </nav>
    );
  }

  return (
    <nav
      aria-label="Seções"
      className="flex w-fit max-w-full gap-1 overflow-x-auto rounded-lg border border-borda bg-white p-1"
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
              ? "bg-acao text-white"
              : "text-slate-600 hover:bg-slate-100 hover:text-slate-800",
          )}
        >
          {a.rotulo}
          {a.selo !== undefined && a.selo > 0 && (
            <span className="rounded-full bg-amber-100 px-1.5 text-xs text-amber-800">
              {a.selo}
            </span>
          )}
        </Link>
      ))}
    </nav>
  );
}
