"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Check, Copy, KeyRound, Loader2, RefreshCw, TriangleAlert } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatarCodigoInstalacao } from "@/lib/formato";
import { girarCodigoInstalacao, type ResultadoAcao } from "./acoes";

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
  const [copiado, setCopiado] = useState(false);
  const [confirmando, setConfirmando] = useState(false);

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
      <h3 className="flex items-center gap-2 text-sm font-medium text-slate-200">
        <KeyRound className="h-4 w-4 text-cyan-400" />
        Código de instalação
      </h3>
      <p className="mt-1 text-xs leading-relaxed text-slate-500">
        É o que o instalador do agente pede em cada máquina. Depois de instalado, a estação
        aparece em Dispositivos e o colaborador em Pessoas, prontos para receber equipe,
        nome e jornada.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <code className="select-all rounded-lg border border-borda bg-fundo-suave px-4 py-3 font-mono text-2xl tracking-[0.2em] text-cyan-200">
          {formatado}
        </code>
        <Button variante="contorno" tamanho="sm" onClick={copiar} disabled={!codigo}>
          {copiado ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copiado ? "Copiado" : "Copiar"}
        </Button>
      </div>

      <p className="mt-3 text-xs text-slate-600">
        Pode ser digitado com ou sem os hífens. Vale para quantas máquinas o plano permitir.
      </p>

      {podeGirar && (
        <div className="mt-4 border-t border-borda pt-4">
          {!confirmando ? (
            <button
              type="button"
              onClick={() => setConfirmando(true)}
              className="inline-flex items-center gap-1.5 text-xs text-slate-500 transition-colors hover:text-amber-300"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Gerar um código novo
            </button>
          ) : (
            <form action={enviar} className="space-y-2">
              <p className="flex items-start gap-2 text-xs leading-relaxed text-amber-200/90">
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
    <span className={`text-xs ${estado.ok ? "text-emerald-400" : "text-rose-400"}`}>
      {estado.mensagem}
    </span>
  );
}
