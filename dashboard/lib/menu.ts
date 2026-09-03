// ============================================================================
//  Itens do menu lateral.
//
//  Mora aqui, e não junto do componente, porque quem monta o menu é o layout —
//  que roda no servidor. Uma função exportada de um arquivo "use client" não
//  pode ser CHAMADA pelo servidor (só renderizada como componente ou passada
//  como prop), e era isso que derrubava /painel com:
//
//    "Attempted to call itensDoMenu() from the server but itensDoMenu is on
//     the client."
//
//  Este módulo não tem "use client", então serve aos dois lados. Os ícones
//  ficam no componente: aqui só trafega a chave, que é string serializável.
// ============================================================================

export type IconeMenu =
  | "visao"
  | "equipes"
  | "pessoas"
  | "aplicativos"
  | "dispositivos"
  | "horasExtras"
  | "registros"
  | "relatorios"
  | "administracao"
  | "plataforma";

export interface ItemNavegacao {
  href: string;
  rotulo: string;
  icone: IconeMenu;
}

/** Monta o menu conforme o papel — o que a pessoa não pode acessar não aparece. */
export function itensDoMenu(opcoes: {
  podeAdministrar: boolean;
  adminPlataforma: boolean;
}): ItemNavegacao[] {
  const itens: ItemNavegacao[] = [
    { href: "/painel", rotulo: "Visão geral", icone: "visao" },
    { href: "/painel/equipes", rotulo: "Equipes", icone: "equipes" },
    { href: "/painel/pessoas", rotulo: "Pessoas", icone: "pessoas" },
    { href: "/painel/aplicativos", rotulo: "Aplicativos", icone: "aplicativos" },
    { href: "/painel/dispositivos", rotulo: "Dispositivos", icone: "dispositivos" },
    { href: "/painel/horas-extras", rotulo: "Horas extras", icone: "horasExtras" },
    { href: "/painel/registros", rotulo: "Registros", icone: "registros" },
    { href: "/painel/relatorios", rotulo: "Relatórios", icone: "relatorios" },
  ];

  if (opcoes.podeAdministrar) {
    itens.push({ href: "/painel/administracao", rotulo: "Administração", icone: "administracao" });
  }
  if (opcoes.adminPlataforma) {
    itens.push({ href: "/plataforma", rotulo: "Plataforma", icone: "plataforma" });
  }

  return itens;
}
