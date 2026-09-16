import {
  AlarmClockCheck,
  BarChart2,
  Building2,
  Clock,
  House,
  LayoutGrid,
  MonitorSmartphone,
  ScrollText,
  Settings,
  User,
  Users,
} from "lucide-react";
import type { IconeMenu } from "@/lib/menu";

// A lista de itens vive em lib/menu.ts, que não é "use client": quem a monta é
// o layout, no servidor, e o servidor não pode chamar função de módulo cliente.
// Aqui fica só o mapa de ícones, compartilhado pela barra lateral e pela barra
// inferior do celular para as duas não desenharem o mesmo destino diferente.
export const ICONES_MENU: Record<IconeMenu, typeof House> = {
  visao: House,
  equipes: Users,
  pessoas: User,
  aplicativos: LayoutGrid,
  dispositivos: MonitorSmartphone,
  horasExtras: AlarmClockCheck,
  jornada: Clock,
  registros: ScrollText,
  relatorios: BarChart2,
  administracao: Settings,
  plataforma: Building2,
};

export function itemAtivo(caminho: string, href: string): boolean {
  if (href === "/painel") return caminho === "/painel";
  return caminho === href || caminho.startsWith(`${href}/`);
}
