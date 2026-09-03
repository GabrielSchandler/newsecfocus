"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  AlarmClockCheck,
  AppWindow,
  Building2,
  FileSpreadsheet,
  LayoutDashboard,
  MonitorSmartphone,
  ScrollText,
  Settings,
  Users,
  UserSquare2,
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

function ListaLinks({ itens, caminho }: { itens: ItemNavegacao[]; caminho: string }) {
  return (
    <nav className="flex flex-1 flex-col gap-1 px-3 py-2">
      {itens.map(({ href, rotulo, icone }) => {
        const Icone = ICONES[icone];
        const ativo = estaAtivo(caminho, href);
        return (
          <Link
            key={href}
            href={href}
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
