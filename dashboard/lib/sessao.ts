// ============================================================================
//  Contexto da sessão: quem está logado, em qual empresa, com qual papel e
//  qual escopo. Carregado no layout do painel e repassado às páginas, para que
//  nenhuma tela precise redescobrir isso.
// ============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import { FUSO_PADRAO } from "./periodos";
import type { ContextoSessao, PapelUsuario } from "./tipos";

export async function carregarContexto(
  supabase: SupabaseClient,
): Promise<ContextoSessao | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const [{ data: perfil }, { data: admin }] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "full_name, role, team_id, org_id, organizations(id, name, slug, status, plano, fuso, max_dispositivos, retencao_dias)",
      )
      .eq("id", user.id)
      .maybeSingle(),
    supabase.from("plataforma_admins").select("user_id").eq("user_id", user.id).maybeSingle(),
  ]);

  // A junção to-one volta como objeto ou array conforme a versão do client.
  const orgBruta = perfil?.organizations as any;
  const org = Array.isArray(orgBruta) ? orgBruta[0] : orgBruta;

  const papel = (perfil?.role ?? "VIEWER") as PapelUsuario;

  return {
    usuarioId: user.id,
    email: user.email ?? "",
    nome: perfil?.full_name ?? null,
    papel,
    equipeEscopo: papel === "TEAM_LEAD" ? (perfil?.team_id ?? null) : null,
    empresa: {
      id: org?.id ?? perfil?.org_id ?? "",
      nome: org?.name ?? "Sua empresa",
      slug: org?.slug ?? "",
      status: org?.status ?? "TRIAL",
      plano: org?.plano ?? "ESSENCIAL",
      fuso: org?.fuso ?? FUSO_PADRAO,
      maxDispositivos: org?.max_dispositivos ?? 0,
      retencaoDias: org?.retencao_dias ?? 90,
    },
    adminPlataforma: !!admin,
  };
}

/** Papéis que podem mexer em cadastros (equipes, pessoas, classificação). */
export function podeAdministrar(contexto: ContextoSessao | null): boolean {
  return contexto?.papel === "OWNER" || contexto?.papel === "MANAGER";
}

export const ROTULO_PAPEL: Record<PapelUsuario, string> = {
  OWNER: "Proprietário",
  MANAGER: "Gestor",
  TEAM_LEAD: "Líder de equipe",
  VIEWER: "Visualização",
};
