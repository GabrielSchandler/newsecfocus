"use client";

import * as React from "react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Lock, TriangleAlert, User } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Campo, Input } from "@/components/ui/input";
import { criarClienteNavegador } from "@/lib/supabase/client";

const MINIMO = 8;

type Aviso = { ok: boolean; texto: string } | null;

export function FormularioConta({ nomeAtual }: { nomeAtual: string | null }) {
  return (
    <>
      <FormularioNome nomeAtual={nomeAtual} />
      <FormularioSenha />
    </>
  );
}

function FormularioNome({ nomeAtual }: { nomeAtual: string | null }) {
  const router = useRouter();
  const [nome, setNome] = useState(nomeAtual ?? "");
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState<Aviso>(null);

  async function aoEnviar(e: React.FormEvent) {
    e.preventDefault();
    setAviso(null);
    setSalvando(true);

    const supabase = criarClienteNavegador();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setAviso({ ok: false, texto: "Sessão expirada. Entre de novo." });
      setSalvando(false);
      return;
    }

    // O nome exibido vive no perfil, não no Auth: é o que as outras telas leem.
    const { error } = await supabase
      .from("profiles")
      .update({ full_name: nome.trim() || null })
      .eq("id", user.id);

    setSalvando(false);

    if (error) {
      setAviso({ ok: false, texto: "Não foi possível salvar o nome." });
      return;
    }

    setAviso({ ok: true, texto: "Nome atualizado." });
    router.refresh();
  }

  return (
    <Card className="p-5">
      <h3 className="flex items-center gap-2 text-sm font-medium text-slate-200">
        <User className="h-4 w-4 text-cyan-400" />
        Nome de exibição
      </h3>
      <form onSubmit={aoEnviar} className="mt-4 space-y-4">
        <Campo rotulo="Como você aparece no painel">
          <Input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            maxLength={80}
            placeholder="Seu nome"
          />
        </Campo>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" tamanho="sm" disabled={salvando}>
            {salvando && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Salvar nome
          </Button>
          <Mensagem aviso={aviso} />
        </div>
      </form>
    </Card>
  );
}

function FormularioSenha() {
  const [senha, setSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState<Aviso>(null);

  async function aoEnviar(e: React.FormEvent) {
    e.preventDefault();
    setAviso(null);

    if (senha.length < MINIMO) {
      setAviso({ ok: false, texto: `A senha precisa ter pelo menos ${MINIMO} caracteres.` });
      return;
    }
    if (senha !== confirmacao) {
      setAviso({ ok: false, texto: "As duas senhas não são iguais." });
      return;
    }

    setSalvando(true);
    const supabase = criarClienteNavegador();
    const { error } = await supabase.auth.updateUser({ password: senha });
    setSalvando(false);

    if (error) {
      setAviso({
        ok: false,
        texto: error.message.includes("same")
          ? "Escolha uma senha diferente da atual."
          : "Não foi possível trocar a senha agora.",
      });
      return;
    }

    setSenha("");
    setConfirmacao("");
    setAviso({ ok: true, texto: "Senha alterada. Ela já vale nos próximos acessos." });
  }

  return (
    <Card className="p-5">
      <h3 className="flex items-center gap-2 text-sm font-medium text-slate-200">
        <Lock className="h-4 w-4 text-cyan-400" />
        Trocar senha
      </h3>
      <form onSubmit={aoEnviar} className="mt-4 space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Campo rotulo="Nova senha" dica={`mínimo de ${MINIMO} caracteres`}>
            <Input
              type="password"
              autoComplete="new-password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              placeholder="••••••••"
            />
          </Campo>
          <Campo rotulo="Repita a nova senha">
            <Input
              type="password"
              autoComplete="new-password"
              value={confirmacao}
              onChange={(e) => setConfirmacao(e.target.value)}
              placeholder="••••••••"
            />
          </Campo>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" tamanho="sm" disabled={salvando}>
            {salvando && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Salvar senha
          </Button>
          <Mensagem aviso={aviso} />
        </div>
      </form>
    </Card>
  );
}

function Mensagem({ aviso }: { aviso: Aviso }) {
  if (!aviso) return null;
  return (
    <p
      role="status"
      className={`flex items-center gap-1.5 text-xs ${aviso.ok ? "text-emerald-400" : "text-rose-400"}`}
    >
      {aviso.ok ? <Check className="h-3.5 w-3.5" /> : <TriangleAlert className="h-3.5 w-3.5" />}
      {aviso.texto}
    </p>
  );
}
