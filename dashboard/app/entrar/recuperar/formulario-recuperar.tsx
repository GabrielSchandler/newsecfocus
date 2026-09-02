"use client";

import * as React from "react";
import { useState } from "react";
import { Check, Loader2, Mail, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { criarClienteNavegador } from "@/lib/supabase/client";

export function FormularioRecuperar() {
  const [email, setEmail] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function aoEnviar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);

    const supabase = criarClienteNavegador();
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/redefinir-senha`,
    });

    setEnviando(false);

    if (error) {
      setErro("Não foi possível enviar agora. Tente de novo em alguns minutos.");
      return;
    }

    // Sucesso sempre, mesmo se o e-mail não existir: dizer "esse e-mail não
    // está cadastrado" entregaria a quem tenta adivinhar quais contas existem.
    setEnviado(true);
  }

  if (enviado) {
    return (
      <div className="space-y-3 text-center">
        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-emerald-500/15">
          <Check className="h-5 w-5 text-emerald-400" />
        </div>
        <p className="text-sm text-slate-200">Se esse e-mail tiver conta, o link já saiu.</p>
        <p className="text-xs leading-relaxed text-slate-500">
          Verifique a caixa de entrada de <strong className="text-slate-400">{email}</strong> e
          também o lixo eletrônico. O link vale por uma hora.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={aoEnviar} className="space-y-4">
      <label className="block">
        <span className="mb-1.5 block text-sm text-slate-400">E-mail da conta</span>
        <span className="relative block">
          <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            type="email"
            required
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="voce@empresa.com.br"
            className="w-full rounded-lg border border-borda bg-fundo-suave py-2.5 pl-10 pr-3 text-sm text-slate-100 outline-none transition-colors placeholder:text-slate-600 hover:border-slate-600 focus:border-cyan-500/60 focus:ring-2 focus:ring-cyan-500/20"
          />
        </span>
      </label>

      {erro && (
        <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
          {erro}
        </p>
      )}

      <Button type="submit" className="w-full" disabled={enviando}>
        {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        Enviar link de recuperação
      </Button>
    </form>
  );
}
