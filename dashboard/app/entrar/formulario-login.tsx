"use client";

import * as React from "react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogIn, Loader2, Mail, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { criarClienteNavegador } from "@/lib/supabase/client";

export function FormularioLogin() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function aoEnviar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);

    const supabase = criarClienteNavegador();
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha });

    if (error) {
      setErro(traduzirErro(error.message));
      setEnviando(false);
      return;
    }

    router.replace("/painel");
    router.refresh();
  }

  return (
    <form onSubmit={aoEnviar} className="space-y-4">
      <Campo
        icone={<Mail className="h-4 w-4" />}
        tipo="email"
        rotulo="E-mail"
        valor={email}
        aoMudar={setEmail}
        placeholder="voce@empresa.com.br"
        autoComplete="email"
      />
      <Campo
        icone={<Lock className="h-4 w-4" />}
        tipo="password"
        rotulo="Senha"
        valor={senha}
        aoMudar={setSenha}
        placeholder="••••••••"
        autoComplete="current-password"
      />

      {erro && (
        <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
          {erro}
        </p>
      )}

      <Button type="submit" className="w-full" disabled={enviando}>
        {enviando ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Entrando…
          </>
        ) : (
          <>
            <LogIn className="h-4 w-4" />
            Entrar
          </>
        )}
      </Button>
    </form>
  );
}

function Campo({
  icone,
  rotulo,
  tipo,
  valor,
  aoMudar,
  placeholder,
  autoComplete,
}: {
  icone: React.ReactNode;
  rotulo: string;
  tipo: string;
  valor: string;
  aoMudar: (v: string) => void;
  placeholder?: string;
  autoComplete?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-slate-400">{rotulo}</span>
      <span className="relative block">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
          {icone}
        </span>
        <input
          required
          type={tipo}
          value={valor}
          onChange={(e) => aoMudar(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          className="w-full rounded-lg border border-borda bg-fundo-suave py-2.5 pl-10 pr-3 text-sm text-slate-100 outline-none transition-colors placeholder:text-slate-600 hover:border-slate-600 focus:border-cyan-500/60 focus:ring-2 focus:ring-cyan-500/20"
        />
      </span>
    </label>
  );
}

function traduzirErro(mensagem: string): string {
  if (/invalid login credentials/i.test(mensagem)) return "E-mail ou senha inválidos.";
  if (/email not confirmed/i.test(mensagem)) return "Confirme seu e-mail antes de entrar.";
  return "Não foi possível entrar. Tente novamente.";
}
