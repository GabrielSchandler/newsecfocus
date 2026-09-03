"use server";

// ============================================================================
//  Acessos ao painel: convidar e ajustar papel.
//
//  Separado de acoes.ts porque é a única parte da administração que precisa de
//  privilégio além do RLS — criar usuário no Auth exige service_role, que vive
//  na Edge Function. O painel só repassa o JWT de quem pediu.
// ============================================================================

import { revalidatePath } from "next/cache";
import { criarClienteServidor } from "@/lib/supabase/server";
import { carregarContexto } from "@/lib/sessao";
import type { PapelUsuario } from "@/lib/tipos";

export interface ResultadoAcao {
  ok: boolean;
  mensagem: string;
}

const OK = (mensagem: string): ResultadoAcao => ({ ok: true, mensagem });
const FALHA = (mensagem: string): ResultadoAcao => ({ ok: false, mensagem });

const PAPEIS: PapelUsuario[] = ["OWNER", "MANAGER", "TEAM_LEAD", "VIEWER"];

function texto(dados: FormData, campo: string): string | null {
  const valor = dados.get(campo);
  if (typeof valor !== "string") return null;
  const limpo = valor.trim();
  return limpo === "" ? null : limpo;
}

export async function convidarUsuario(
  _anterior: ResultadoAcao | null,
  dados: FormData,
): Promise<ResultadoAcao> {
  const supabase = await criarClienteServidor();
  const contexto = await carregarContexto(supabase);
  if (!contexto) return FALHA("Sessão expirada.");

  const email = texto(dados, "email");
  const papel = texto(dados, "papel") as PapelUsuario | null;

  if (!email) return FALHA("Informe o e-mail.");
  if (!papel || !PAPEIS.includes(papel)) return FALHA("Escolha um papel válido.");
  if (papel === "TEAM_LEAD" && !texto(dados, "equipe_id")) {
    return FALHA("Líder de equipe precisa de uma equipe: sem ela, não enxergaria nada.");
  }

  const { data, error } = await supabase.functions.invoke("convidar-usuario", {
    body: {
      email,
      nome: texto(dados, "nome"),
      papel,
      equipe_id: texto(dados, "equipe_id"),
    },
  });

  if (error) return FALHA(`Não foi possível convidar: ${error.message}`);
  if (data?.error) return FALHA(String(data.error));

  revalidatePath("/painel", "layout");
  return OK(data?.aviso ?? `Convite enviado para ${email}.`);
}

export async function salvarAcesso(
  _anterior: ResultadoAcao | null,
  dados: FormData,
): Promise<ResultadoAcao> {
  const supabase = await criarClienteServidor();
  const contexto = await carregarContexto(supabase);
  if (!contexto) return FALHA("Sessão expirada.");

  const id = texto(dados, "id");
  const papel = texto(dados, "papel") as PapelUsuario | null;

  if (!id) return FALHA("Usuário não informado.");
  if (!papel || !PAPEIS.includes(papel)) return FALHA("Papel inválido.");

  if (papel === "OWNER" && contexto.papel !== "OWNER" && !contexto.adminPlataforma) {
    return FALHA("Apenas o proprietário pode criar outro proprietário.");
  }
  if (papel === "TEAM_LEAD" && !texto(dados, "equipe_id")) {
    return FALHA("Escolha a equipe desse líder.");
  }

  const souEu = id === contexto.usuarioId;
  const querDesativar = dados.get("ativo") !== "on";

  // Trancar-se do lado de fora é irreversível pela interface: só voltaria com
  // acesso ao banco. Melhor recusar.
  if (souEu && querDesativar) {
    return FALHA("Você não pode desativar o próprio acesso.");
  }
  if (souEu && papel !== contexto.papel && contexto.papel === "OWNER") {
    return FALHA("Você não pode rebaixar o próprio acesso de proprietário.");
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: texto(dados, "nome"),
      role: papel,
      team_id: papel === "TEAM_LEAD" ? texto(dados, "equipe_id") : null,
      ativo: souEu ? true : !querDesativar,
    })
    .eq("id", id);

  if (error) return FALHA(error.message);

  revalidatePath("/painel", "layout");
  return OK("Acesso atualizado.");
}
