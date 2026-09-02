"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, MonitorSmartphone, AppWindow, Activity } from "lucide-react";
import { cn } from "@/lib/utils";

const ITENS = [
  { href: "/painel", rotulo: "Visão Geral", icone: LayoutDashboard },
  { href: "/painel/dispositivos", rotulo: "Dispositivos", icone: MonitorSmartphone },
  { href: "/painel/aplicativos", rotulo: "Aplicativos", icone: AppWindow },
];

export function NavegacaoLateral() {
  const caminho = usePathname();

  return (
    <aside className="hidden w-60 shrink-0 border-r border-borda bg-fundo-suave/60 lg:flex lg:flex-col">
      <div className="flex items-center gap-2.5 px-6 py-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400 to-violet-500 shadow-glow">
          <Activity className="h-5 w-5 text-slate-950" />
        </div>
        <div className="leading-tight">
          <p className="text-sm font-semibold text-slate-100">Telemetria</p>
          <p className="text-xs text-slate-500">Produtividade</p>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-1 px-3 py-2">
        {ITENS.map(({ href, rotulo, icone: Icone }) => {
          const ativo = caminho === href;
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
                ativo
                  ? "bg-cyan-500/10 text-cyan-300 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.2)]"
                  : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-200",
              )}
            >
              <Icone className="h-4 w-4" />
              {rotulo}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-borda px-6 py-4">
        <p className="text-xs leading-relaxed text-slate-600">
          Coleta em conformidade com a LGPD. Sem conteúdo digitado, telas ou mensagens.
        </p>
      </div>
    </aside>
  );
}
