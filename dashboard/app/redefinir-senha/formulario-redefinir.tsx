"use client";

import * as React from "react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Loader2, Lock, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { criarClienteNavegador } from "@/lib/supabase/client";

const MINIMO = 8;

export function FormularioRedefinir() {
  const router = useRouter();
  const [senha, setSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [pronto, setPronto] = useState(false);
  const [temSessao, setTemSessao] = useState<boolean | null>(null);

  // O link do e-mail cria a sessão de recuperação. Sem ela — link expirado ou
  // já usado — não adianta mostrar o formulário.
  useEffect(() => {
    const supabase = criarClienteNavegador();
    supabase.auth.getSession().then(({ data }) => setTemSessao(!!data.session));
  }, []);

  async function aoEnviar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);

    if (senha.length < MINIMO) {
      setErro(`A senha precisa ter pelo menos ${MINIMO} caracteres.`);
      return;
    }
    if (senha !== confirmacao) {
      setErro("As duas senhas não são iguais.");
      return;
    }

    setSalvando(true);
    const supabase = criarClienteNavegador();
    const { error } = await supabase.auth.updateUser({ password: senha });
    setSalvando(false);

    if (error) {
      setErro(
        error.message.includes("same")
          ? "Escolha uma senha diferente da atual."
          : "Não foi possível salvar. Peça um link novo e tente de novo.",
      );
      return;
    }

    setPronto(true);
    setTimeout(() => {
      router.replace("/painel");
      router.refresh();
    }, 1800);
  }

  if (temSessao === null) {
    return (
      <p className="flex items-center justify-center gap-2 py-4 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Verificando o link…
      </p>
    );
  }

  if (!temSessao) {
    return (
      <div className="space-y-3 text-center">
        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-amber-500/15">
          <TriangleAlert className="h-5 w-5 text-amber-400" />
        </div>
        <p className="text-sm text-slate-200">Este link não vale mais.</p>
        <p className="text-xs leading-relaxed text-slate-500">
          Links de recuperação expiram em uma hora e só podem ser usados uma vez.
        </p>
        <Link
          href="/entrar/recuperar"
          className="inline-block text-xs font-medium text-cyan-300 underline hover:text-cyan-200"
        >
          Pedir um link novo
        </Link>
      </div>
    );
  }

  if (pronto) {
    return (
      <div className="space-y-3 text-center">
        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-emerald-500/15">
          <Check className="h-5 w-5 text-emerald-400" />
        </div>
        <p className="text-sm text-slate-200">Senha alterada.</p>
        <p className="text-xs text-slate-500">Levando você para o painel…</p>
      </div>
    );
  }

  return (
    <form onSubmit={aoEnviar} className="space-y-4">
      <CampoSenha
        rotulo="Nova senha"
        valor={senha}
        aoMudar={setSenha}
        dica={`mínimo de ${MINIMO} caracteres`}
        autoFocus
      />
      <CampoSenha rotulo="Repita a nova senha" valor={confirmacao} aoMudar={setConfirmacao} />

      {erro && (
        <p
          role="alert"
          className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300"
        >
          {erro}
        </p>
      )}

      <Button type="submit" className="w-full" disabled={salvando}>
        {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
        Salvar nova senha
      </Button>
    </form>
  );
}

function CampoSenha({
  rotulo,
  valor,
  aoMudar,
  dica,
  autoFocus,
}: {
  rotulo: string;
  valor: string;
  aoMudar: (v: string) => void;
  dica?: string;
  autoFocus?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm text-slate-400">{rotulo}</span>
      <span className="relative block">
        <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
        <input
          type="password"
          required
          autoFocus={autoFocus}
          autoComplete="new-password"
          value={valor}
          onChange={(e) => aoMudar(e.target.value)}
          placeholder="••••••••"
          className="w-full rounded-lg border border-borda bg-fundo-suave py-2.5 pl-10 pr-3 text-sm text-slate-100 outline-none transition-colors placeholder:text-slate-600 hover:border-slate-600 focus:border-cyan-500/60 focus:ring-2 focus:ring-cyan-500/20"
        />
      </span>
      {dica && <span className="mt-1 block text-xs text-slate-600">{dica}</span>}
    </label>
  );
}
