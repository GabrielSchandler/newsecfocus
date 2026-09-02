"use server";

// ============================================================================
//  Ações da revenda: provisionar e administrar as contas das empresas clientes.
//
//  A criação passa pela Edge Function provisionar-empresa, que é quem detém a
//  service_role. O painel nunca recebe essa chave — só repassa o JWT do
//  operador, e a própria função pergunta ao banco se ele é admin da plataforma.
// ============================================================================

import { revalidatePath } from "next/cache";
import { criarClienteServidor } from "@/lib/supabase/server";
import { carregarContexto } from "@/lib/sessao";

export interface ResultadoAcao {
  ok: boolean;
  mensagem: string;
  /** Chave de matrícula da empresa recém-criada, para entregar ao cliente. */
  chaveMatricula?: string;
}

const FALHA = (mensagem: string): ResultadoAcao => ({ ok: false, mensagem });

function texto(dados: FormData, campo: string): string | null {
  const valor = dados.get(campo);
  if (typeof valor !== "string") return null;
  const limpo = valor.trim();
  return limpo === "" ? null : limpo;
}

export async function criarEmpresa(
  _anterior: ResultadoAcao | null,
  dados: FormData,
): Promise<ResultadoAcao> {
  const supabase = await criarClienteServidor();
  const contexto = await carregarContexto(supabase);

  if (!contexto?.adminPlataforma) return FALHA("Sem permissão para provisionar empresas.");

  const nome = texto(dados, "nome");
  if (!nome) return FALHA("Informe o nome da empresa.");

  const { data, error } = await supabase.functions.invoke("provisionar-empresa", {
    body: {
      nome,
      contato_email: texto(dados, "contato_email"),
      plano: texto(dados, "plano") ?? "ESSENCIAL",
      max_dispositivos: Number(dados.get("max_dispositivos")) || 25,
      fuso: texto(dados, "fuso") ?? "America/Sao_Paulo",
      retencao_dias: Number(dados.get("retencao_dias")) || 90,
      email_gestor: texto(dados, "email_gestor"),
    },
  });

  if (error) return FALHA(`Falha ao provisionar: ${error.message}`);
  if (data?.error) return FALHA(String(data.error));

  revalidatePath("/plataforma");

  const aviso = data?.aviso ? ` (${data.aviso})` : "";
  return {
    ok: true,
    mensagem: `Empresa "${data?.empresa?.nome}" criada${aviso}.`,
    chaveMatricula: data?.empresa?.enrollment_key,
  };
}

export async function atualizarEmpresa(
  _anterior: ResultadoAcao | null,
  dados: FormData,
): Promise<ResultadoAcao> {
  const supabase = await criarClienteServidor();
  const contexto = await carregarContexto(supabase);

  if (!contexto?.adminPlataforma) return FALHA("Sem permissão para alterar contas.");

  const id = texto(dados, "id");
  if (!id) return FALHA("Empresa não informada.");

  const status = texto(dados, "status");
  if (status && !["TRIAL", "ATIVA", "SUSPENSA", "CANCELADA"].includes(status)) {
    return FALHA("Situação inválida.");
  }

  const limite = Number(dados.get("max_dispositivos"));

  const { error } = await supabase
    .from("organizations")
    .update({
      status: status ?? undefined,
      plano: texto(dados, "plano") ?? undefined,
      max_dispositivos: Number.isFinite(limite) && limite > 0 ? Math.floor(limite) : undefined,
    })
    .eq("id", id);

  if (error) return FALHA(error.message);

  revalidatePath("/plataforma");
  return { ok: true, mensagem: "Conta atualizada." };
}
