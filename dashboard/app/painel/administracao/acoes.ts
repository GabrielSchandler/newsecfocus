"use server";

// ============================================================================
//  Ações de administração da empresa.
//
//  Todas usam o cliente com a sessão do usuário: quem pode o quê é decidido
//  pelas políticas de RLS (OWNER/MANAGER administram; os demais só leem). Não
//  existe service_role aqui — o navegador nunca ganha poder que o banco não dê.
// ============================================================================

import { revalidatePath } from "next/cache";
import { criarClienteServidor } from "@/lib/supabase/server";
import { carregarContexto } from "@/lib/sessao";

export interface ResultadoAcao {
  ok: boolean;
  mensagem: string;
}

const OK = (mensagem: string): ResultadoAcao => ({ ok: true, mensagem });
const FALHA = (mensagem: string): ResultadoAcao => ({ ok: false, mensagem });

function texto(dados: FormData, campo: string): string | null {
  const valor = dados.get(campo);
  if (typeof valor !== "string") return null;
  const limpo = valor.trim();
  return limpo === "" ? null : limpo;
}

function inteiro(dados: FormData, campo: string, padrao: number): number {
  const valor = Number(dados.get(campo));
  return Number.isFinite(valor) && valor > 0 ? Math.floor(valor) : padrao;
}

function atualizarTelas() {
  revalidatePath("/painel", "layout");
}

// ----------------------------------------------------------------------------
//  Equipes
// ----------------------------------------------------------------------------

export async function salvarEquipe(
  _anterior: ResultadoAcao | null,
  dados: FormData,
): Promise<ResultadoAcao> {
  const supabase = await criarClienteServidor();
  const contexto = await carregarContexto(supabase);
  if (!contexto) return FALHA("Sessão expirada.");

  const nome = texto(dados, "nome");
  if (!nome) return FALHA("Informe o nome da equipe.");

  const registro = {
    org_id: contexto.empresa.id,
    nome,
    descricao: texto(dados, "descricao"),
    cor: texto(dados, "cor"),
  };

  const id = texto(dados, "id");
  const { error } = id
    ? await supabase.from("teams").update(registro).eq("id", id)
    : await supabase.from("teams").insert(registro);

  if (error) {
    if (error.code === "23505") return FALHA("Já existe uma equipe com esse nome.");
    return FALHA(error.message);
  }

  atualizarTelas();
  return OK(id ? "Equipe atualizada." : "Equipe criada.");
}

export async function excluirEquipe(
  _anterior: ResultadoAcao | null,
  dados: FormData,
): Promise<ResultadoAcao> {
  const supabase = await criarClienteServidor();
  const id = texto(dados, "id");
  if (!id) return FALHA("Equipe não informada.");

  // Os colaboradores não são apagados junto: ficam sem equipe (team_id nulo).
  const { error } = await supabase.from("teams").delete().eq("id", id);
  if (error) return FALHA(error.message);

  atualizarTelas();
  return OK("Equipe excluída. As pessoas dela ficaram sem equipe.");
}

// ----------------------------------------------------------------------------
//  Colaboradores
// ----------------------------------------------------------------------------

export async function salvarColaborador(
  _anterior: ResultadoAcao | null,
  dados: FormData,
): Promise<ResultadoAcao> {
  const supabase = await criarClienteServidor();
  const id = texto(dados, "id");
  if (!id) return FALHA("Colaborador não informado.");

  const { error } = await supabase
    .from("employees")
    .update({
      nome: texto(dados, "nome"),
      cargo: texto(dados, "cargo"),
      email: texto(dados, "email"),
      team_id: texto(dados, "team_id"),
      jornada_minutos_dia: inteiro(dados, "jornada_minutos_dia", 480),
      ativo: dados.get("ativo") === "on" || dados.get("ativo") === "true",
    })
    .eq("id", id);

  if (error) return FALHA(error.message);

  atualizarTelas();
  return OK("Colaborador atualizado.");
}

// ----------------------------------------------------------------------------
//  Categorias de produtividade
// ----------------------------------------------------------------------------

export async function salvarCategoria(
  _anterior: ResultadoAcao | null,
  dados: FormData,
): Promise<ResultadoAcao> {
  const supabase = await criarClienteServidor();
  const contexto = await carregarContexto(supabase);
  if (!contexto) return FALHA("Sessão expirada.");

  const nome = texto(dados, "name");
  const tipo = texto(dados, "type");
  if (!nome) return FALHA("Informe o nome da categoria.");
  if (!tipo || !["PRODUCTIVE", "NEUTRAL", "UNPRODUCTIVE"].includes(tipo)) {
    return FALHA("Tipo de categoria inválido.");
  }

  const registro = {
    org_id: contexto.empresa.id,
    name: nome,
    type: tipo,
    color: texto(dados, "color"),
  };

  const id = texto(dados, "id");
  const { error } = id
    ? await supabase.from("productivity_categories").update(registro).eq("id", id)
    : await supabase.from("productivity_categories").insert(registro);

  if (error) {
    if (error.code === "23505") return FALHA("Já existe uma categoria com esse nome.");
    return FALHA(error.message);
  }

  await reconsolidar(supabase, contexto.empresa.id);
  atualizarTelas();
  return OK(id ? "Categoria atualizada." : "Categoria criada.");
}

export async function excluirCategoria(
  _anterior: ResultadoAcao | null,
  dados: FormData,
): Promise<ResultadoAcao> {
  const supabase = await criarClienteServidor();
  const contexto = await carregarContexto(supabase);
  if (!contexto) return FALHA("Sessão expirada.");

  const id = texto(dados, "id");
  if (!id) return FALHA("Categoria não informada.");

  const { error } = await supabase.from("productivity_categories").delete().eq("id", id);
  if (error) return FALHA(error.message);

  await reconsolidar(supabase, contexto.empresa.id);
  atualizarTelas();
  return OK("Categoria excluída. Os apps ligados a ela ficaram sem classificação.");
}

// ----------------------------------------------------------------------------
//  Mapeamento aplicativo/domínio → categoria
// ----------------------------------------------------------------------------

export async function salvarMapeamento(
  _anterior: ResultadoAcao | null,
  dados: FormData,
): Promise<ResultadoAcao> {
  const supabase = await criarClienteServidor();
  const contexto = await carregarContexto(supabase);
  if (!contexto) return FALHA("Sessão expirada.");

  const processo = texto(dados, "process_name");
  const dominio = texto(dados, "domain");
  const categoria = texto(dados, "category_id");

  if (!processo && !dominio) {
    return FALHA("Informe o processo (ex.: excel.exe) ou o domínio (ex.: youtube.com).");
  }
  if (processo && dominio) {
    return FALHA("Use processo OU domínio numa mesma regra, não os dois.");
  }
  if (!categoria) return FALHA("Escolha a categoria.");

  const registro = {
    org_id: contexto.empresa.id,
    process_name: processo,
    domain: dominio?.toLowerCase().replace(/^www\./, "") ?? null,
    category_id: categoria,
  };

  const id = texto(dados, "id");
  const { error } = id
    ? await supabase.from("app_mappings").update(registro).eq("id", id)
    : await supabase.from("app_mappings").insert(registro);

  if (error) return FALHA(error.message);

  const recalculo = await reconsolidar(supabase, contexto.empresa.id);
  atualizarTelas();
  return OK(
    recalculo
      ? "Regra salva e histórico recalculado."
      : "Regra salva. O histórico será recalculado na próxima consolidação.",
  );
}

export async function excluirMapeamento(
  _anterior: ResultadoAcao | null,
  dados: FormData,
): Promise<ResultadoAcao> {
  const supabase = await criarClienteServidor();
  const contexto = await carregarContexto(supabase);
  if (!contexto) return FALHA("Sessão expirada.");

  const id = texto(dados, "id");
  if (!id) return FALHA("Regra não informada.");

  const { error } = await supabase.from("app_mappings").delete().eq("id", id);
  if (error) return FALHA(error.message);

  await reconsolidar(supabase, contexto.empresa.id);
  atualizarTelas();
  return OK("Regra removida e histórico recalculado.");
}

// ----------------------------------------------------------------------------
//  Empresa
// ----------------------------------------------------------------------------

export async function salvarEmpresa(
  _anterior: ResultadoAcao | null,
  dados: FormData,
): Promise<ResultadoAcao> {
  const supabase = await criarClienteServidor();
  const contexto = await carregarContexto(supabase);
  if (!contexto) return FALHA("Sessão expirada.");

  if (contexto.papel !== "OWNER") {
    return FALHA("Só o proprietário da conta altera os dados da empresa.");
  }

  const retencao = inteiro(dados, "retencao_dias", contexto.empresa.retencaoDias);
  if (retencao < 7 || retencao > 3650) {
    return FALHA("A retenção precisa ficar entre 7 e 3650 dias.");
  }

  const { error } = await supabase
    .from("organizations")
    .update({
      name: texto(dados, "name") ?? contexto.empresa.nome,
      fuso: texto(dados, "fuso") ?? contexto.empresa.fuso,
      retencao_dias: retencao,
      contato_email: texto(dados, "contato_email"),
      sync_interval_minutes: Number(dados.get("sync_interval_minutes")) || null,
    })
    .eq("id", contexto.empresa.id);

  if (error) return FALHA(error.message);

  atualizarTelas();
  return OK("Dados da empresa atualizados.");
}

// ----------------------------------------------------------------------------
//  Recálculo do histórico após mudar a classificação
// ----------------------------------------------------------------------------

/**
 * Sem isso, mudar a categoria de um app só valeria para o dado novo: o painel
 * seguiria mostrando meses de histórico com a regra antiga.
 */
async function reconsolidar(
  supabase: Awaited<ReturnType<typeof criarClienteServidor>>,
  orgId: string,
): Promise<boolean> {
  const { error } = await supabase.rpc("reconsolidar_org", { p_org: orgId, p_dias: 90 });
  return !error;
}
