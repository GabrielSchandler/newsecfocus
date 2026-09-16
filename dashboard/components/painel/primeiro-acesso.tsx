"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Loader2, TriangleAlert, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Campo, Input } from "@/components/ui/input";
import { criarClienteNavegador } from "@/lib/supabase/client";
import { confirmarSenha } from "@/app/painel/acoes-senha";

/**
 * Primeiro acesso com senha provisória.
 *
 * A senha foi digitada por outra pessoa (o administrador que criou o acesso),
 * então ela já nasceu conhecida por alguém além do dono. Em vez de forçar a
 * troca — que gera senha fraca escrita num papel —, o painel cobra uma DECISÃO
 * consciente: trocar agora ou assumir esta como sua.
 *
 * Bloqueia a navegação de propósito: adiar essa decisão é o mesmo que nunca
 * tomá-la, e a senha compartilhada fica viva para sempre.
 */
export function PrimeiroAcesso({ nome }: { nome: string | null }) {
  const router = useRouter();
  const [trocando, setTrocando] = useState(false);
  const [senha, setSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  function concluir() {
    iniciar(async () => {
      await confirmarSenha();
      router.refresh();
    });
  }

  async function trocar(evento: React.FormEvent) {
    evento.preventDefault();
    setErro(null);

    if (senha.length < 8) {
      setErro("A senha precisa ter pelo menos 8 caracteres.");
      return;
    }
    if (senha !== confirmacao) {
      setErro("As duas senhas não são iguais.");
      return;
    }

    const supabase = criarClienteNavegador();
    const { error } = await supabase.auth.updateUser({ password: senha });
    if (error) {
      setErro(error.message);
      return;
    }
    concluir();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl2 border border-borda vidro p-6">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100">
            <KeyRound className="h-5 w-5 text-cyan-700" />
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-slate-900">
              {nome ? `Bem-vindo, ${nome}` : "Primeiro acesso"}
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">
              Sua senha foi definida por quem criou este acesso, então outra pessoa a conhece.
              Você pode trocá-la agora ou mantê-la — mas precisa escolher.
            </p>
          </div>
        </div>

        {!trocando ? (
          <div className="mt-6 space-y-3">
            <Button type="button" className="w-full" onClick={() => setTrocando(true)}>
              <KeyRound className="h-4 w-4" />
              Definir uma nova senha
            </Button>
            <Button
              type="button"
              variante="contorno"
              className="w-full"
              disabled={pendente}
              onClick={concluir}
            >
              {pendente ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Manter esta senha
            </Button>
          </div>
        ) : (
          <form onSubmit={trocar} className="mt-6 space-y-4">
            <Campo rotulo="Nova senha" dica="mínimo 8 caracteres">
              <Input
                type="password"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
              />
            </Campo>
            <Campo rotulo="Repita a nova senha">
              <Input
                type="password"
                value={confirmacao}
                onChange={(e) => setConfirmacao(e.target.value)}
                autoComplete="new-password"
                required
              />
            </Campo>

            {erro && (
              <p className="flex items-start gap-2 text-xs text-rose-700">
                <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {erro}
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={pendente}>
                {pendente ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Salvar senha
              </Button>
              <Button type="button" variante="fantasma" onClick={() => setTrocando(false)}>
                Voltar
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
