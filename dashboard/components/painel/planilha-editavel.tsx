"use client";

import * as React from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Check, ChevronDown, Loader2, Plus, TriangleAlert, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Planilha com edição na própria linha.
 *
 * O cadastro antigo era "formulário no topo + lista embaixo": para corrigir o
 * cargo de alguém, a pessoa clicava em editar, o foco subia para outro lugar da
 * tela e ela perdia de vista a linha que estava mexendo. Aqui a linha abre no
 * lugar, com os campos e o botão salvar logo ali.
 *
 * Equipes e Colaboradores usam este mesmo componente de propósito: são o mesmo
 * gesto, e telas de cadastro que se comportam diferente entre si fazem o
 * administrador reaprender a cada aba.
 */

export interface ColunaPlanilha<T> {
  chave: string;
  rotulo: string;
  alinhar?: "esquerda" | "direita";
  ocultarMobile?: boolean;
  render: (linha: T) => React.ReactNode;
}

export interface ResultadoAcaoPlanilha {
  ok: boolean;
  mensagem: string;
}

function BotaoSalvar({ children = "Salvar" }: { children?: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" tamanho="sm" disabled={pending}>
      {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
      {children}
    </Button>
  );
}

function Mensagem({ estado }: { estado: ResultadoAcaoPlanilha | null }) {
  if (!estado) return null;
  return (
    <span
      className={cn(
        "flex items-center gap-1.5 text-xs",
        estado.ok ? "text-emerald-300" : "text-rose-300",
      )}
    >
      {estado.ok ? (
        <Check className="h-3.5 w-3.5 shrink-0" />
      ) : (
        <TriangleAlert className="h-3.5 w-3.5 shrink-0" />
      )}
      {estado.mensagem}
    </span>
  );
}

/** O formulário que aparece dentro da linha aberta. */
function Editor({
  acao,
  aoFechar,
  rotuloSalvar,
  extra,
  children,
}: {
  acao: (anterior: ResultadoAcaoPlanilha | null, dados: FormData) => Promise<ResultadoAcaoPlanilha>;
  aoFechar: () => void;
  rotuloSalvar?: string;
  extra?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [estado, enviar] = useFormState(acao, null);

  return (
    <form action={enviar} className="space-y-3 rounded-lg border border-borda bg-fundo-suave/50 p-4">
      {children}
      <div className="flex flex-wrap items-center gap-3">
        <BotaoSalvar>{rotuloSalvar}</BotaoSalvar>
        <Button type="button" variante="fantasma" tamanho="sm" onClick={aoFechar}>
          <X className="h-3.5 w-3.5" />
          Fechar
        </Button>
        {extra}
        <Mensagem estado={estado} />
      </div>
    </form>
  );
}

export function PlanilhaEditavel<T>({
  titulo,
  descricao,
  colunas,
  linhas,
  chave,
  acao,
  editor,
  editorNovo,
  rotuloNovo,
  filtro,
  extraLinha,
  vazio = "Nada cadastrado ainda.",
}: {
  titulo: string;
  descricao?: React.ReactNode;
  colunas: ColunaPlanilha<T>[];
  linhas: T[];
  chave: (linha: T) => string;
  acao: (anterior: ResultadoAcaoPlanilha | null, dados: FormData) => Promise<ResultadoAcaoPlanilha>;
  /** Campos do formulário de uma linha existente. */
  editor: (linha: T) => React.ReactNode;
  /** Campos do formulário de criação. Sem isso, não aparece o botão de novo. */
  editorNovo?: React.ReactNode;
  rotuloNovo?: string;
  /** Campo de busca ou filtro, mostrado no cabeçalho. */
  filtro?: React.ReactNode;
  /** Botão extra na linha aberta (normalmente excluir). */
  extraLinha?: (linha: T) => React.ReactNode;
  vazio?: React.ReactNode;
}) {
  const [aberta, setAberta] = React.useState<string | null>(null);
  const [criando, setCriando] = React.useState(false);

  const alternar = (id: string) => {
    setCriando(false);
    setAberta((atual) => (atual === id ? null : id));
  };

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-sm font-medium text-slate-200">{titulo}</h3>
            {descricao && (
              <p className="mt-1 text-xs leading-relaxed text-slate-500">{descricao}</p>
            )}
          </div>
          {editorNovo && (
            <Button
              type="button"
              tamanho="sm"
              variante={criando ? "fantasma" : "primario"}
              onClick={() => {
                setAberta(null);
                setCriando((c) => !c);
              }}
            >
              {criando ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
              {criando ? "Cancelar" : (rotuloNovo ?? "Novo")}
            </Button>
          )}
        </div>

        {filtro && <div className="mt-4">{filtro}</div>}

        {criando && editorNovo && (
          <div className="mt-4">
            <Editor acao={acao} aoFechar={() => setCriando(false)} rotuloSalvar="Criar">
              {editorNovo}
            </Editor>
          </div>
        )}
      </Card>

      <Card className="overflow-hidden">
        {linhas.length === 0 ? (
          <p className="p-10 text-center text-sm text-slate-500">{vazio}</p>
        ) : (
          <>
            {/* Desktop: planilha de verdade. */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead className="border-b border-borda">
                  <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                    {colunas.map((c) => (
                      <th
                        key={c.chave}
                        scope="col"
                        className={cn("px-4 py-3 font-medium", c.alinhar === "direita" && "text-right")}
                      >
                        {c.rotulo}
                      </th>
                    ))}
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {linhas.map((l) => {
                    const id = chave(l);
                    const aberto = aberta === id;
                    return (
                      <React.Fragment key={id}>
                        <tr
                          className={cn(
                            "cursor-pointer transition-colors hover:bg-slate-800/30",
                            aberto && "bg-slate-800/40",
                          )}
                          onClick={() => alternar(id)}
                        >
                          {colunas.map((c) => (
                            <td
                              key={c.chave}
                              className={cn("px-4 py-3", c.alinhar === "direita" && "text-right")}
                            >
                              {c.render(l)}
                            </td>
                          ))}
                          <td className="px-2 text-right">
                            <ChevronDown
                              className={cn(
                                "h-4 w-4 text-slate-500 transition-transform",
                                aberto && "rotate-180",
                              )}
                            />
                          </td>
                        </tr>
                        {aberto && (
                          <tr className="bg-slate-900/40">
                            <td colSpan={colunas.length + 1} className="px-4 pb-4">
                              <Editor
                                acao={acao}
                                aoFechar={() => setAberta(null)}
                                extra={extraLinha?.(l)}
                              >
                                {editor(l)}
                              </Editor>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Celular: cartões que abrem no lugar. */}
            <ul className="divide-y divide-slate-800/70 md:hidden">
              {linhas.map((l) => {
                const id = chave(l);
                const aberto = aberta === id;
                const principal = colunas[0];
                const resto = colunas.filter((c) => c !== principal && !c.ocultarMobile);
                return (
                  <li key={id} className="p-4">
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-3 text-left"
                      onClick={() => alternar(id)}
                    >
                      <span className="min-w-0 font-medium text-slate-100">
                        {principal.render(l)}
                      </span>
                      <ChevronDown
                        className={cn(
                          "h-4 w-4 shrink-0 text-slate-500 transition-transform",
                          aberto && "rotate-180",
                        )}
                      />
                    </button>
                    {!aberto && resto.length > 0 && (
                      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
                        {resto.map((c) => (
                          <div key={c.chave} className="min-w-0">
                            <dt className="text-xs text-slate-500">{c.rotulo}</dt>
                            <dd className="truncate text-sm text-slate-300">{c.render(l)}</dd>
                          </div>
                        ))}
                      </dl>
                    )}
                    {aberto && (
                      <div className="mt-3">
                        <Editor
                          acao={acao}
                          aoFechar={() => setAberta(null)}
                          extra={extraLinha?.(l)}
                        >
                          {editor(l)}
                        </Editor>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </Card>
    </div>
  );
}
