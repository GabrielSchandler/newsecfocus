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
  | "jornada"
  | "registros"
  | "relatorios"
  | "administracao"
  | "plataforma";

export interface ItemNavegacao {
  href: string;
  rotulo: string;
  icone: IconeMenu;
  /** "gestao" desce para o pé da barra lateral, separado do que se consulta. */
  grupo: "consulta" | "gestao";
}

/**
 * O que fica nas abas fixas do celular. São quatro por escolha: a quinta vaga
 * é sempre o "Mais", e passar disso vira alvo de toque pequeno demais.
 *
 * A seleção é deliberada, não "os quatro primeiros do menu": no celular o
 * gestor abre para ver como está o time agora, não para exportar relatório.
 */
export const ABAS_CELULAR: IconeMenu[] = ["visao", "pessoas", "equipes"];

/**
 * Monta o menu conforme o papel — o que a pessoa não pode acessar não aparece.
 *
 * Menu enxuto de propósito (set./2026): três olhares — Visão geral, Equipes e
 * Pessoas — mais dois assuntos que o gestor procura pelo nome: Aplicativos e
 * sites, e Jornada (presença e horas extras). Esses dois chegaram a morar em
 * abas da Visão geral, mas ali ficavam escondidos atrás da tela inicial; com a
 * Visão geral virando um resumo de uma tela só (redesenho de 16/09/2026),
 * voltaram a ter endereço próprio. Dispositivos e Registros seguem fora do
 * menu, acessíveis pelos links de dentro das telas.
 */
export function itensDoMenu(opcoes: {
  podeAdministrar: boolean;
  adminPlataforma: boolean;
}): ItemNavegacao[] {
  const itens: ItemNavegacao[] = [
    { href: "/painel", rotulo: "Visão geral", icone: "visao", grupo: "consulta" },
    { href: "/painel/equipes", rotulo: "Equipes", icone: "equipes", grupo: "consulta" },
    { href: "/painel/pessoas", rotulo: "Pessoas", icone: "pessoas", grupo: "consulta" },
    { href: "/painel/aplicativos", rotulo: "Aplicativos e sites", icone: "aplicativos", grupo: "consulta" },
    { href: "/painel/jornada", rotulo: "Jornada", icone: "jornada", grupo: "consulta" },
    { href: "/painel/relatorios", rotulo: "Relatórios", icone: "relatorios", grupo: "consulta" },
  ];

  if (opcoes.podeAdministrar) {
    itens.push({ href: "/painel/administracao", rotulo: "Administração", icone: "administracao", grupo: "gestao" });
  }
  if (opcoes.adminPlataforma) {
    itens.push({ href: "/plataforma", rotulo: "Plataforma", icone: "plataforma", grupo: "gestao" });
  }

  return itens;
}
