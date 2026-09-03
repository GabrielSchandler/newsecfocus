"use client";

import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Folha que sobe do rodapé — o diálogo do celular.
 *
 * Sobe de baixo, e não do centro, porque é de baixo que vem o toque: a barra
 * de abas e os botões de ação ficam na faixa do polegar, e um painel que nasce
 * ali é lido como continuação do gesto, não como interrupção.
 *
 * Concentra o que todo diálogo precisa acertar e é fácil esquecer: travar a
 * rolagem do fundo, fechar no Esc, fechar ao tocar fora, respeitar a área
 * segura do aparelho e não deixar o conteúdo passar de 85% da tela.
 */
export function FolhaInferior({
  aberta,
  aoFechar,
  titulo,
  children,
  rodape,
}: {
  aberta: boolean;
  aoFechar: () => void;
  titulo: string;
  children: React.ReactNode;
  /** Ações fixas no pé da folha, fora da área que rola. */
  rodape?: React.ReactNode;
}) {
  React.useEffect(() => {
    if (!aberta) return;

    const anterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function aoTeclar(e: KeyboardEvent) {
      if (e.key === "Escape") aoFechar();
    }
    document.addEventListener("keydown", aoTeclar);

    return () => {
      document.body.style.overflow = anterior;
      document.removeEventListener("keydown", aoTeclar);
    };
  }, [aberta, aoFechar]);

  if (!aberta) return null;

  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <button
        type="button"
        aria-label="Fechar"
        onClick={aoFechar}
        className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        className="absolute inset-x-0 bottom-0 flex max-h-[85vh] flex-col animate-entrada-suave rounded-t-3xl border-t border-borda bg-fundo-cartao"
      >
        <div className="shrink-0 px-5 pb-3 pt-3">
          {/* Alça: sinaliza que isto se fecha puxando para baixo. */}
          <div className="mb-3 flex justify-center">
            <span className="h-1 w-10 rounded-full bg-slate-700" />
          </div>
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-slate-100">{titulo}</h2>
            <button
              type="button"
              onClick={aoFechar}
              aria-label="Fechar"
              className="toque-afunda rounded-lg p-2 text-slate-400 active:bg-slate-800/60"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className={cn("min-h-0 flex-1 overflow-y-auto px-5", !rodape && "area-segura-base pb-5")}>
          {children}
        </div>

        {rodape && (
          <div className="area-segura-base shrink-0 border-t border-borda px-5 pb-4 pt-3">
            {rodape}
          </div>
        )}
      </div>
    </div>
  );
}
