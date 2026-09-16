"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Check, Copy, KeyRound, Loader2, Pencil, RefreshCw, TriangleAlert, Eye, EyeOff } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatarCodigoInstalacao } from "@/lib/formato";
import { Campo, Input } from "@/components/ui/input";
import { definirCodigoInstalacao, girarCodigoInstalacao, type ResultadoAcao } from "./acoes";

/**
 * O código que o TI do cliente digita no instalador do agente.
 *
 * Fica grande e em blocos de quatro de propósito: quem usa isso está lendo de
 * um papel, digitando numa máquina que acabou de ligar, às vezes com alguém
 * ditando por telefone. Só números, para não haver dúvida entre O e 0.
 */
export function CodigoInstalacao({
  codigo,
  podeGirar,
}: {
  codigo: string | null;
  podeGirar: boolean;
}) {
  const [estado, enviar] = useFormState(girarCodigoInstalacao, null);
  const [estadoDefinir, definir] = useFormState(definirCodigoInstalacao, null);
  const [editando, setEditando] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  // Oculto por padrão: a tela de administração é aberta em reunião e em
  // compartilhamento de tela, e o código deixa qualquer máquina entrar na frota.
  const [visivel, setVisivel] = useState(false);

  const formatado = formatarCodigoInstalacao(codigo);

  async function copiar() {
    if (!codigo) return;
    try {
      await navigator.clipboard.writeText(formatado);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // Navegador sem permissão de área de transferência: o código segue visível.
    }
  }

  return (
    <Card className="border-cyan-500/20 p-5">
      <h3 className="flex items-center gap-2 text-sm font-medium text-slate-800">
        <KeyRound className="h-4 w-4 text-cyan-700" />
        Código de instalação
      </h3>
      <p className="mt-1 text-xs leading-relaxed text-slate-500">
        É o que o instalador do agente pede em cada máquina. Depois de instalado, a estação
        aparece em Dispositivos e o colaborador em Pessoas, prontos para receber equipe,
        nome e jornada.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <code
          aria-label={visivel ? "Código de instalação" : "Código de instalação oculto"}
          className="select-all rounded-lg border border-borda bg-fundo-suave px-4 py-3 font-mono text-2xl tracking-[0.2em] text-cyan-800"
        >
          {visivel ? formatado : formatado.replace(/\d/g, "•")}
        </code>
        <Button variante="contorno" tamanho="sm" onClick={() => setVisivel((v) => !v)} disabled={!codigo}>
          {visivel ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          {visivel ? "Ocultar" : "Mostrar"}
        </Button>
        <Button variante="contorno" tamanho="sm" onClick={copiar} disabled={!codigo}>
          {copiado ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copiado ? "Copiado" : "Copiar"}
        </Button>
      </div>

      <p className="mt-3 text-xs text-slate-500">
        Pode ser digitado com ou sem os hífens. Vale para quantas máquinas o plano permitir.
      </p>

      {podeGirar && (
        <div className="mt-4 space-y-3 border-t border-borda pt-4">
          {/* Escolher o código é diferente de girar: aqui o objetivo é ter um
              número fácil de ditar no roteiro de implantação, e as estações já
              instaladas não são afetadas. */}
          {!editando ? (
            <button
              type="button"
              onClick={() => setEditando(true)}
              className="flex w-fit items-center gap-1.5 text-xs text-slate-500 transition-colors hover:text-cyan-700"
            >
              <Pencil className="h-3.5 w-3.5" />
              Escolher outro código
            </button>
          ) : (
            <form action={definir} className="space-y-2">
              <Campo rotulo="Novo código" dica="12 dígitos, com ou sem hífens">
                <Input
                  name="codigo"
                  inputMode="numeric"
                  maxLength={14}
                  placeholder="1234-5678-9012"
                  defaultValue={formatado}
                  required
                />
              </Campo>
              <p className="text-xs leading-relaxed text-slate-500">
                Vale para as próximas instalações. As máquinas já instaladas continuam
                normalmente — elas usam uma credencial própria desde a primeira conexão.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <BotaoSalvarCodigo />
                <Button
                  type="button"
                  variante="fantasma"
                  tamanho="sm"
                  onClick={() => setEditando(false)}
                >
                  Cancelar
                </Button>
                <Mensagem estado={estadoDefinir} />
              </div>
            </form>
          )}

          {!confirmando ? (
            <button
              type="button"
              onClick={() => setConfirmando(true)}
              className="flex w-fit items-center gap-1.5 text-xs text-slate-500 transition-colors hover:text-amber-700"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Gerar um código aleatório
            </button>
          ) : (
            <form action={enviar} className="space-y-2">
              <p className="flex items-start gap-2 text-xs leading-relaxed text-amber-800/90">
                <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                O código atual deixa de funcionar para instalações novas. As máquinas já
                instaladas continuam normalmente — elas usam uma credencial própria desde a
                primeira conexão, não o código.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <BotaoGirar />
                <Button
                  type="button"
                  variante="fantasma"
                  tamanho="sm"
                  onClick={() => setConfirmando(false)}
                >
                  Cancelar
                </Button>
                <Mensagem estado={estado} />
              </div>
            </form>
          )}
        </div>
      )}
    </Card>
  );
}

function BotaoSalvarCodigo() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" tamanho="sm" disabled={pending}>
      {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
      Salvar código
    </Button>
  );
}

function BotaoGirar() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" tamanho="sm" variante="contorno" disabled={pending}>
      {pending ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <RefreshCw className="h-3.5 w-3.5" />
      )}
      Confirmar e gerar novo
    </Button>
  );
}

function Mensagem({ estado }: { estado: ResultadoAcao | null }) {
  if (!estado) return null;
  return (
    <span className={`text-xs ${estado.ok ? "text-emerald-700" : "text-rose-700"}`}>
      {estado.mensagem}
    </span>
  );
}
