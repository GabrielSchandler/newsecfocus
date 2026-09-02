import * as React from "react";
import Link from "next/link";
import { AlertTriangle, ChevronLeft, Info } from "lucide-react";
import { Card } from "@/components/ui/card";

interface CabecalhoProps {
  titulo: string;
  descricao?: string;
  icone?: React.ReactNode;
  voltarPara?: { href: string; rotulo: string };
  acoes?: React.ReactNode;
}

/** Cabeçalho padrão das páginas do painel: título, contexto e ações à direita. */
export function CabecalhoPagina({
  titulo,
  descricao,
  icone,
  voltarPara,
  acoes,
}: CabecalhoProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        {voltarPara && (
          <Link
            href={voltarPara.href}
            className="mb-1.5 inline-flex items-center gap-1 text-xs text-slate-500 transition-colors hover:text-cyan-300"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            {voltarPara.rotulo}
          </Link>
        )}
        <div className="flex items-center gap-2.5">
          {icone}
          <h2 className="truncate text-lg font-semibold text-slate-100">{titulo}</h2>
        </div>
        {descricao && <p className="mt-1 text-sm text-slate-500">{descricao}</p>}
      </div>

      {acoes && <div className="flex shrink-0 items-center gap-2">{acoes}</div>}
    </div>
  );
}

/**
 * Aviso de falha. Antes, todo erro de consulta era engolido por um try/catch
 * vazio e a tela aparecia zerada — o gestor via "nenhuma atividade" quando na
 * verdade o banco não respondeu. Agora o problema é dito em voz alta.
 */
export function AvisoErro({ mensagem }: { mensagem: string }) {
  return (
    <Card className="flex items-start gap-3 border-rose-500/30 p-4">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
      <div className="min-w-0">
        <p className="text-sm font-medium text-rose-200">Não foi possível carregar os dados</p>
        <p className="mt-1 break-words text-xs text-slate-400">{mensagem}</p>
        <p className="mt-2 text-xs text-slate-500">
          Verifique se as migrations foram aplicadas e se o seu usuário tem perfil vinculado a
          uma empresa.
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
}: {
  titulo: string;
  descricao: string;
  acao?: React.ReactNode;
}) {
  return (
    <Card className="flex flex-col items-center gap-2 p-10 text-center">
      <Info className="h-5 w-5 text-slate-600" />
      <p className="text-sm font-medium text-slate-300">{titulo}</p>
      <p className="max-w-md text-xs leading-relaxed text-slate-500">{descricao}</p>
      {acao && <div className="mt-2">{acao}</div>}
    </Card>
  );
}
