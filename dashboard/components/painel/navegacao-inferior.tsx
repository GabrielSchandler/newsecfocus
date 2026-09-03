"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Activity,
  AlarmClockCheck,
  AppWindow,
  Building2,
  ChevronRight,
  FileSpreadsheet,
  LayoutDashboard,
  LogOut,
  MonitorSmartphone,
  MoreHorizontal,
  ScrollText,
  Settings,
  ShieldCheck,
  UserRound,
  Users,
  UserSquare2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { criarClienteNavegador } from "@/lib/supabase/client";
import { ABAS_CELULAR, type IconeMenu, type ItemNavegacao } from "@/lib/menu";
import { ROTULO_PAPEL } from "@/lib/sessao";
import type { ContextoSessao } from "@/lib/tipos";

const ICONES: Record<IconeMenu, typeof LayoutDashboard> = {
  visao: LayoutDashboard,
  equipes: Users,
  pessoas: UserSquare2,
  aplicativos: AppWindow,
  dispositivos: MonitorSmartphone,
  horasExtras: AlarmClockCheck,
  registros: ScrollText,
  relatorios: FileSpreadsheet,
  administracao: Settings,
  plataforma: Building2,
};

function estaAtivo(caminho: string, href: string): boolean {
  if (href === "/painel") return caminho === "/painel";
  return caminho === href || caminho.startsWith(`${href}/`);
}

/**
 * Navegação em abas fixas no rodapé — o padrão de aplicativo instalado.
 *
 * Substitui a gaveta com botão de sanduíche que existia antes. A gaveta
 * escondia o mapa inteiro do produto atrás de um toque e de uma animação; a
 * barra deixa os quatro destinos principais sempre à mão, no alcance do
 * polegar, e mostra onde a pessoa está sem ela precisar abrir nada.
 *
 * Só existe abaixo de lg — no desktop quem manda é a barra lateral.
 */
export function NavegacaoInferior({
  itens,
  contexto,
}: {
  itens: ItemNavegacao[];
  contexto: ContextoSessao;
}) {
  const caminho = usePathname();
  const [aberto, setAberto] = useState(false);

  const abas = ABAS_CELULAR.map((icone) => itens.find((i) => i.icone === icone)).filter(
    (i): i is ItemNavegacao => !!i,
  );
  const restantes = itens.filter((i) => !abas.includes(i));

  // Uma tela de "Mais" aberta e a rota mudando embaixo dela é desorientador.
  useEffect(() => setAberto(false), [caminho]);

  const algumRestanteAtivo = restantes.some((i) => estaAtivo(caminho, i.href));

  return (
    <>
      <nav
        aria-label="Navegação principal"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-borda bg-fundo/90 backdrop-blur-lg lg:hidden"
      >
        <div className="area-segura-base flex items-stretch">
          {abas.map(({ href, rotulo, icone }) => {
            const Icone = ICONES[icone];
            const ativo = estaAtivo(caminho, href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={ativo ? "page" : undefined}
                className="toque-afunda relative flex flex-1 flex-col items-center gap-1 px-1 pb-2 pt-2.5"
              >
                {/* Traço no topo da aba ativa: a posição é lida antes da cor,
                    e sozinha a cor não serve a quem não a distingue. */}
                <span
                  className={cn(
                    "absolute inset-x-4 top-0 h-0.5 rounded-full transition-opacity",
                    ativo ? "bg-gradient-to-r from-cyan-400 to-violet-400 opacity-100" : "opacity-0",
                  )}
                />
                <Icone
                  className={cn(
                    "h-[22px] w-[22px] transition-colors",
                    ativo ? "text-cyan-300" : "text-slate-500",
                  )}
                />
                <span
                  className={cn(
                    "max-w-full truncate text-[10px] font-medium leading-none transition-colors",
                    ativo ? "text-cyan-300" : "text-slate-500",
                  )}
                >
                  {rotulo}
                </span>
              </Link>
            );
          })}

          <button
            type="button"
            onClick={() => setAberto(true)}
            aria-expanded={aberto}
            aria-haspopup="dialog"
            className="toque-afunda relative flex flex-1 flex-col items-center gap-1 px-1 pb-2 pt-2.5"
          >
            <span
              className={cn(
                "absolute inset-x-4 top-0 h-0.5 rounded-full transition-opacity",
                algumRestanteAtivo
                  ? "bg-gradient-to-r from-cyan-400 to-violet-400 opacity-100"
                  : "opacity-0",
              )}
            />
            <MoreHorizontal
              className={cn(
                "h-[22px] w-[22px] transition-colors",
                algumRestanteAtivo ? "text-cyan-300" : "text-slate-500",
              )}
            />
            <span
              className={cn(
                "text-[10px] font-medium leading-none transition-colors",
                algumRestanteAtivo ? "text-cyan-300" : "text-slate-500",
              )}
            >
              Mais
            </span>
          </button>
        </div>
      </nav>

      {aberto && (
        <PainelMais
          itens={restantes}
          caminho={caminho}
          contexto={contexto}
          aoFechar={() => setAberto(false)}
        />
      )}
    </>
  );
}

/**
 * Folha que sobe de baixo, como em app nativo: o resto da navegação, a conta e
 * a saída. Sobe do rodapé, e não do topo, porque é de lá que o toque veio.
 */
function PainelMais({
  itens,
  caminho,
  contexto,
  aoFechar,
}: {
  itens: ItemNavegacao[];
  caminho: string;
  contexto: ContextoSessao;
  aoFechar: () => void;
}) {
  const router = useRouter();
  const [saindo, setSaindo] = useState(false);

  useEffect(() => {
    const anterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function aoTeclar(e: KeyboardEvent) {
      if (e.key === "Escape") aoFechar();
    }
    document.addEventListener("keydown", aoTeclar);

    return () => {
      document.body.style.overflow = anterior;
      document.removeEventListener("keydown", aoTeclar);
    };
  }, [aoFechar]);

  async function sair() {
    setSaindo(true);
    const supabase = criarClienteNavegador();
    await supabase.auth.signOut();
    router.replace("/entrar");
    router.refresh();
  }

  const identificacao = contexto.nome ?? contexto.email;
  const iniciais = identificacao.slice(0, 2).toUpperCase();

  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <button
        type="button"
        aria-label="Fechar"
        onClick={aoFechar}
        className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Mais opções"
        className="absolute inset-x-0 bottom-0 max-h-[85vh] animate-entrada-suave overflow-y-auto rounded-t-3xl border-t border-borda bg-fundo-cartao"
      >
        {/* Alça: sinaliza "isto se fecha puxando para baixo", como em app. */}
        <div className="sticky top-0 z-10 flex justify-center bg-fundo-cartao pb-1 pt-3">
          <span className="h-1 w-10 rounded-full bg-slate-700" />
        </div>

        <div className="flex items-start justify-between gap-3 px-5 pb-4 pt-1">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500/30 to-violet-500/30 text-sm font-semibold text-cyan-200">
              {iniciais}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-slate-100">{identificacao}</p>
              <p className="truncate text-xs text-slate-500">
                {ROTULO_PAPEL[contexto.papel]} · {contexto.empresa.nome}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={aoFechar}
            aria-label="Fechar"
            className="toque-afunda shrink-0 rounded-lg p-2 text-slate-400 hover:bg-slate-800/60"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {itens.length > 0 && (
          <nav className="border-t border-borda px-3 py-2">
            {itens.map(({ href, rotulo, icone }) => {
              const Icone = ICONES[icone];
              const ativo = estaAtivo(caminho, href);
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={aoFechar}
                  aria-current={ativo ? "page" : undefined}
                  className={cn(
                    "toque-afunda flex items-center gap-3.5 rounded-xl px-3 py-3.5 text-sm transition-colors",
                    ativo ? "bg-cyan-500/10 text-cyan-300" : "text-slate-300 active:bg-slate-800/60",
                  )}
                >
                  <Icone className="h-[18px] w-[18px] shrink-0" />
                  <span className="flex-1">{rotulo}</span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-slate-600" />
                </Link>
              );
            })}
          </nav>
        )}

        <nav className="border-t border-borda px-3 py-2">
          <Link
            href="/painel/conta"
            onClick={aoFechar}
            className="toque-afunda flex items-center gap-3.5 rounded-xl px-3 py-3.5 text-sm text-slate-300 transition-colors active:bg-slate-800/60"
          >
            <UserRound className="h-[18px] w-[18px] shrink-0" />
            <span className="flex-1">Minha conta</span>
            <ChevronRight className="h-4 w-4 shrink-0 text-slate-600" />
          </Link>

          <button
            type="button"
            onClick={sair}
            disabled={saindo}
            className="toque-afunda flex w-full items-center gap-3.5 rounded-xl px-3 py-3.5 text-sm text-rose-300 transition-colors active:bg-rose-500/10 disabled:opacity-50"
          >
            <LogOut className="h-[18px] w-[18px] shrink-0" />
            <span className="flex-1 text-left">{saindo ? "Saindo…" : "Sair da conta"}</span>
          </button>
        </nav>

        <div className="area-segura-base border-t border-borda px-5 py-4">
          <p className="flex items-start gap-2 text-xs leading-relaxed text-slate-600">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-400" />
            Coleta em conformidade com a LGPD. Sem conteúdo digitado, telas ou mensagens.
          </p>
          <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-700">
            <Activity className="h-3 w-3" />
            NewSec Focus
          </p>
        </div>
      </div>
    </div>
  );
}
