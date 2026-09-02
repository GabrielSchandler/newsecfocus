"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  AppWindow,
  Building2,
  FileSpreadsheet,
  LayoutDashboard,
  Menu,
  MonitorSmartphone,
  ScrollText,
  Settings,
  Users,
  UserSquare2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { IconeMenu, ItemNavegacao } from "@/lib/menu";

// A lista de itens vive em lib/menu.ts, que não é "use client": quem a monta é
// o layout, no servidor, e o servidor não pode chamar função de módulo cliente.
// Aqui fica só o mapa de ícones, que é componente e não atravessa a fronteira.
const ICONES: Record<IconeMenu, typeof LayoutDashboard> = {
  visao: LayoutDashboard,
  equipes: Users,
  pessoas: UserSquare2,
  aplicativos: AppWindow,
  dispositivos: MonitorSmartphone,
  registros: ScrollText,
  relatorios: FileSpreadsheet,
  administracao: Settings,
  plataforma: Building2,
};

function estaAtivo(caminho: string, href: string): boolean {
  if (href === "/painel") return caminho === "/painel";
  return caminho === href || caminho.startsWith(`${href}/`);
}

function Marca() {
  return (
    <div className="flex items-center gap-2.5 px-6 py-5">
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400 to-violet-500 shadow-glow">
        <Activity className="h-5 w-5 text-slate-950" />
      </div>
      <div className="leading-tight">
        <p className="text-sm font-semibold text-slate-100">NewSec</p>
        <p className="text-xs text-slate-500">Focus</p>
      </div>
    </div>
  );
}

function ListaLinks({
  itens,
  caminho,
  aoNavegar,
}: {
  itens: ItemNavegacao[];
  caminho: string;
  aoNavegar?: () => void;
}) {
  return (
    <nav className="flex flex-1 flex-col gap-1 px-3 py-2">
      {itens.map(({ href, rotulo, icone }) => {
        const Icone = ICONES[icone];
        const ativo = estaAtivo(caminho, href);
        return (
          <Link
            key={href}
            href={href}
            onClick={aoNavegar}
            aria-current={ativo ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
              ativo
                ? "bg-cyan-500/10 text-cyan-300 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.2)]"
                : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-200",
            )}
          >
            <Icone className="h-4 w-4 shrink-0" />
            {rotulo}
          </Link>
        );
      })}
    </nav>
  );
}

function Rodape() {
  return (
    <div className="border-t border-borda px-6 py-4">
      <p className="text-xs leading-relaxed text-slate-600">
        Coleta em conformidade com a LGPD. Sem conteúdo digitado, telas ou mensagens.
      </p>
    </div>
  );
}

/** Barra lateral fixa — desktop. */
export function NavegacaoLateral({ itens }: { itens: ItemNavegacao[] }) {
  const caminho = usePathname();

  return (
    <aside className="hidden w-60 shrink-0 border-r border-borda bg-fundo-suave/60 lg:flex lg:flex-col">
      <Marca />
      <ListaLinks itens={itens} caminho={caminho} />
      <Rodape />
    </aside>
  );
}

/**
 * Menu do celular. Sem isso a navegação simplesmente sumia abaixo de 1024px —
 * a lateral era `hidden lg:flex` e não havia alternativa.
 */
export function MenuMobile({ itens }: { itens: ItemNavegacao[] }) {
  const [aberto, setAberto] = useState(false);
  const caminho = usePathname();

  // Fecha ao trocar de rota e trava a rolagem do fundo enquanto está aberto.
  useEffect(() => setAberto(false), [caminho]);

  useEffect(() => {
    if (!aberto) return;
    const anterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function aoTeclar(e: KeyboardEvent) {
      if (e.key === "Escape") setAberto(false);
    }
    document.addEventListener("keydown", aoTeclar);

    return () => {
      document.body.style.overflow = anterior;
      document.removeEventListener("keydown", aoTeclar);
    };
  }, [aberto]);

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        aria-label="Abrir menu"
        aria-expanded={aberto}
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-borda text-slate-300 transition-colors hover:bg-slate-800/60 lg:hidden"
      >
        <Menu className="h-4 w-4" />
      </button>

      {aberto && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm"
            onClick={() => setAberto(false)}
            aria-hidden
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Menu de navegação"
            className="absolute inset-y-0 left-0 flex w-64 animate-entrada-suave flex-col border-r border-borda bg-fundo"
          >
            <div className="flex items-center justify-between pr-3">
              <Marca />
              <button
                type="button"
                onClick={() => setAberto(false)}
                aria-label="Fechar menu"
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-800/60"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <ListaLinks itens={itens} caminho={caminho} aoNavegar={() => setAberto(false)} />
            <Rodape />
          </div>
        </div>
      )}
    </>
  );
}
