"use client";

import { useEffect, useRef, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { ArrowRight, Check, ChevronDown, Loader2 } from "lucide-react";
import { classificarApp } from "@/app/painel/administracao/acoes";
import type { Categoria } from "@/lib/tipos";

/**
 * Classificar um aplicativo ou site sem sair da lista. Só aparece para quem
 * administra — e a ação confere o papel no servidor de novo, porque esconder o
 * botão não é proteção.
 *
 * Salvar recalcula o histórico (reconsolidação): o índice de dias passados
 * muda junto, e o painel avisa isso antes de confirmar.
 */
export function ClassificarAplicativo({
  alvo,
  ehSite,
  mapeamentoId,
  categoriaId,
  categorias,
  rotulo,
  variante = "link",
}: {
  alvo: string;
  ehSite: boolean;
  mapeamentoId: string | null;
  categoriaId: string | null;
  categorias: Categoria[];
  rotulo?: string;
  /** "link" nas listas; "botao" no cabeçalho do detalhe. */
  variante?: "link" | "botao";
}) {
  const [aberto, setAberto] = useState(false);
  const [escolhida, setEscolhida] = useState(categoriaId ?? "");
  const [estado, enviar] = useFormState(classificarApp, null);
  const caixa = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setAberto(false);
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("keydown", esc);
    };
  }, [aberto]);

  if (estado?.ok) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
        <Check className="h-3.5 w-3.5" />
        Salvo
      </span>
    );
  }

  const novo = !categoriaId;

  return (
    <div className="relative inline-block" ref={caixa}>
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        className={
          variante === "botao"
            ? "inline-flex h-11 items-center gap-2 rounded-lg border border-acao/70 bg-white px-4 text-[15px] font-medium text-acao hover:bg-acao-suave"
            : "inline-flex items-center gap-1 text-sm font-medium text-acao hover:underline"
        }
      >
        {rotulo ?? (novo ? "Classificar" : "Editar")}
        {novo ? <ArrowRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </button>

      {aberto && (
        <form
          action={enviar}
          className="absolute right-0 z-30 mt-2 w-72 rounded-xl2 border border-borda bg-white p-4 text-left shadow-menu"
        >
          <input type="hidden" name="alvo" value={alvo} />
          <input type="hidden" name="eh_processo" value={String(!ehSite)} />
          <input type="hidden" name="mapeamento_id" value={mapeamentoId ?? ""} />
          <input type="hidden" name="category_id" value={escolhida} />

          <p className="truncate text-sm font-medium text-slate-900" title={alvo}>
            {alvo}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            Regra por {ehSite ? "domínio" : "processo"}. Domínio específico vale mais que o processo do navegador.
          </p>

          <label className="mt-3 block text-xs font-medium text-slate-600" htmlFor={`categoria-${alvo}`}>
            Categoria
          </label>
          <select
            id={`categoria-${alvo}`}
            value={escolhida}
            onChange={(e) => setEscolhida(e.target.value)}
            className="mt-1 h-10 w-full rounded-lg border border-borda bg-white px-3 text-sm text-slate-900 outline-none focus:border-acao/60 focus:ring-2 focus:ring-acao/15"
          >
            <option value="">Escolha…</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          <p className="mt-3 text-xs leading-relaxed text-slate-500">
            Salvar recalcula o histórico dentro da retenção: índices de dias anteriores mudam junto.
          </p>

          {estado && !estado.ok && <p className="mt-2 text-xs text-rose-700">{estado.mensagem}</p>}

          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setAberto(false)}
              className="h-9 rounded-lg px-3 text-sm text-slate-600 hover:bg-slate-100"
            >
              Cancelar
            </button>
            <Salvar desabilitado={!escolhida || escolhida === categoriaId} />
          </div>
        </form>
      )}
    </div>
  );
}

function Salvar({ desabilitado }: { desabilitado: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={desabilitado || pending}
      className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-acao px-3 text-sm font-medium text-white hover:bg-acao-escuro disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
      Salvar
    </button>
  );
}
