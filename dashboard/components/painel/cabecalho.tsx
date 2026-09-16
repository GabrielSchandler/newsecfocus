import * as React from "react";
import Link from "next/link";
import { AlertTriangle, ChevronRight, Info, Lock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface CabecalhoProps {
  titulo: string;
  descricao?: React.ReactNode;
  /** Trilha até aqui: [{ rotulo: "Pessoas", href: "/painel/pessoas" }, { rotulo: "Ana" }]. */
  trilha?: { rotulo: string; href?: string }[];
  /** Ícone ou avatar à esquerda do título (detalhes de equipe e pessoa). */
  marca?: React.ReactNode;
  /** Texto curto ao lado do título ("5 pessoas"). */
  complemento?: React.ReactNode;
  /** Filtros e botões, alinhados à direita no desktop. */
  acoes?: React.ReactNode;
  /** Linha discreta embaixo das ações (último envio, retenção…). */
  nota?: React.ReactNode;
  /** Atalho para telas auxiliares: vira uma trilha de dois passos. */
  voltarPara?: { href: string; rotulo: string };
  /** Aceito por compatibilidade; o cabeçalho novo não desenha ícone no título. */
  icone?: React.ReactNode;
}

/**
 * Cabeçalho das páginas: trilha, título grande, uma frase de contexto e, à
 * direita, os filtros do recorte. É o mesmo em todas as telas para o gestor
 * sempre achar o período no mesmo lugar.
 */
export function CabecalhoPagina({
  titulo,
  descricao,
  trilha,
  marca,
  complemento,
  acoes,
  nota,
  voltarPara,
}: CabecalhoProps) {
  const caminho =
    trilha ?? (voltarPara ? [{ rotulo: voltarPara.rotulo, href: voltarPara.href }, { rotulo: titulo }] : null);

  return (
    <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div className="min-w-0">
        {caminho && (
          <nav aria-label="Trilha" className="mb-1.5 flex flex-wrap items-center gap-1 text-[13px] text-slate-500">
            {caminho.map((passo, i) => (
              <React.Fragment key={`${passo.rotulo}-${i}`}>
                {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-slate-400" aria-hidden />}
                {passo.href ? (
                  <Link href={passo.href} className="transition-colors hover:text-acao hover:underline">
                    {passo.rotulo}
                  </Link>
                ) : (
                  <span aria-current="page" className="text-slate-600">
                    {passo.rotulo}
                  </span>
                )}
              </React.Fragment>
            ))}
          </nav>
        )}
        <div className="flex min-w-0 items-center gap-3">
          {marca}
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h1 className="text-[26px] font-bold leading-tight tracking-tight text-tinta sm:text-[30px]">
                {titulo}
              </h1>
              {complemento && <span className="text-sm text-slate-500">{complemento}</span>}
            </div>
            {descricao && <div className="mt-1 text-[15px] text-slate-600">{descricao}</div>}
          </div>
        </div>
      </div>

      {(acoes || nota) && (
        <div className="flex min-w-0 flex-col gap-2 lg:items-end">
          {acoes && (
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center lg:justify-end">
              {acoes}
            </div>
          )}
          {nota && <div className="text-[13px] text-slate-500">{nota}</div>}
        </div>
      )}
    </header>
  );
}

/**
 * Aviso de falha. Antes, todo erro de consulta era engolido por um try/catch
 * vazio e a tela aparecia zerada — o gestor via "nenhuma atividade" quando na
 * verdade o banco não respondeu. Agora o problema é dito em voz alta.
 */
export function AvisoErro({ mensagem, className }: { mensagem: string; className?: string }) {
  return (
    <Card className={cn("flex items-start gap-3 border-rose-200 bg-rose-50 p-4", className)}>
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
      <div className="min-w-0">
        <p className="text-sm font-medium text-rose-800">Não foi possível carregar estes dados</p>
        <p className="mt-1 break-words text-xs text-slate-600">{mensagem}</p>
        <p className="mt-2 text-xs text-slate-500">
          Esta parte fica sem números até a consulta responder — nada foi zerado no lugar.
        </p>
      </div>
    </Card>
  );
}

/** Estado vazio explicativo — diz o que fazer, não só que não há nada. */
export function EstadoVazio({
  titulo,
  descricao,
  acao,
  className,
}: {
  titulo: string;
  descricao: string;
  acao?: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("flex flex-col items-center gap-2 p-10 text-center", className)}>
      <Info className="h-5 w-5 text-slate-400" />
      <p className="text-sm font-medium text-slate-700">{titulo}</p>
      <p className="max-w-md text-sm leading-relaxed text-slate-500">{descricao}</p>
      {acao && <div className="mt-2">{acao}</div>}
    </Card>
  );
}

/** Área que o papel da pessoa não pode ver. A proteção de fato está no banco. */
export function SemPermissao({ descricao }: { descricao: string }) {
  return (
    <Card className="flex flex-col items-center gap-2 p-10 text-center">
      <Lock className="h-5 w-5 text-slate-400" />
      <p className="text-sm font-medium text-slate-700">Sem acesso a esta área</p>
      <p className="max-w-md text-sm leading-relaxed text-slate-500">{descricao}</p>
    </Card>
  );
}
