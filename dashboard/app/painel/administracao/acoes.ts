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
import { SINCRONIZACAO_PADRAO_MINUTOS } from "@/lib/agente";
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
      // Vazio = herda a jornada padrão da empresa.
      jornada_minutos_dia: texto(dados, "jornada_minutos_dia")
        ? inteiro(dados, "jornada_minutos_dia", 480)
        : null,
      jornada_hora_inicio: texto(dados, "jornada_hora_inicio"),
      jornada_hora_fim: texto(dados, "jornada_hora_fim"),
      ativo: dados.get("ativo") === "on" || dados.get("ativo") === "true",
      // Salvar aqui é o sinal de "um administrador olhou para esta pessoa" —
      // é o que tira o aviso de "aguardando configuração" do painel.
      perfil_completo: true,
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

/**
 * Classifica direto da tela de catálogo: cria a regra se o app/site ainda não
 * tinha uma (mapeamento_id vazio) ou troca a categoria de uma regra
 * existente. eh_processo decide se o alvo detectado vira process_name ou
 * domain — ver o comentário da migration 0012 sobre por que isso não dá pra
 * saber só olhando o agregado.
 */
export async function classificarApp(
  _anterior: ResultadoAcao | null,
  dados: FormData,
): Promise<ResultadoAcao> {
  const supabase = await criarClienteServidor();
  const contexto = await carregarContexto(supabase);
  if (!contexto) return FALHA("Sessão expirada.");

  const alvo = texto(dados, "alvo");
  const ehProcesso = dados.get("eh_processo") === "true";
  const categoria = texto(dados, "category_id");
  const mapeamentoId = texto(dados, "mapeamento_id");

  if (!alvo) return FALHA("App ou site não informado.");
  if (!categoria) return FALHA("Escolha a categoria.");

  const registro = {
    org_id: contexto.empresa.id,
    process_name: ehProcesso ? alvo : null,
    domain: ehProcesso ? null : alvo,
    category_id: categoria,
  };

  const { error } = mapeamentoId
    ? await supabase.from("app_mappings").update({ category_id: categoria }).eq("id", mapeamentoId)
    : await supabase.from("app_mappings").insert(registro);

  if (error) return FALHA(error.message);

  await reconsolidar(supabase, contexto.empresa.id);
  atualizarTelas();
  return OK(`"${alvo}" classificado.`);
}

/**
 * Repõe o catálogo padrão de categorias e regras. Não sobrescreve o que a
 * empresa já configurou — serve para quem apagou algo sem querer ou quer
 * completar a lista depois de ver a tela de Aplicativos.
 */
export async function aplicarCatalogoPadrao(
  _anterior: ResultadoAcao | null,
  _dados: FormData,
): Promise<ResultadoAcao> {
  const supabase = await criarClienteServidor();
  const contexto = await carregarContexto(supabase);
  if (!contexto) return FALHA("Sessão expirada.");

  const { data, error } = await supabase.rpc("aplicar_classificacao_padrao", {
    p_org: contexto.empresa.id,
  });
  if (error) return FALHA(error.message);

  const linha = Array.isArray(data) ? data[0] : data;
  await reconsolidar(supabase, contexto.empresa.id);
  atualizarTelas();

  return OK(
    `Catálogo aplicado: ${linha?.categorias_criadas ?? 0} categorias e ${linha?.regras_criadas ?? 0} regras no total.`,
  );
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

  const jornada = inteiro(dados, "jornada_padrao_minutos", contexto.empresa.jornadaPadraoMinutos);
  if (jornada < 60 || jornada > 1440) {
    return FALHA("A jornada padrão precisa ficar entre 60 e 1440 minutos.");
  }

  const horario = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
  const janelaInicio = texto(dados, "jornada_padrao_hora_inicio");
  const janelaFim = texto(dados, "jornada_padrao_hora_fim");

  if ((janelaInicio && !horario.test(janelaInicio)) || (janelaFim && !horario.test(janelaFim))) {
    return FALHA("Horário do expediente inválido. Use HH:MM, por exemplo 09:00.");
  }
  if ((janelaInicio && !janelaFim) || (!janelaInicio && janelaFim)) {
    return FALHA(
      "Preencha início e fim do expediente, ou deixe os dois vazios para não medir horas extras.",
    );
  }

  const { error } = await supabase
    .from("organizations")
    .update({
      name: texto(dados, "name") ?? contexto.empresa.nome,
      fuso: texto(dados, "fuso") ?? contexto.empresa.fuso,
      retencao_dias: retencao,
      jornada_padrao_minutos: jornada,
      jornada_padrao_hora_inicio: janelaInicio,
      jornada_padrao_hora_fim: janelaFim,
      contato_email: texto(dados, "contato_email"),
      sync_interval_minutes: Number(dados.get("sync_interval_minutes")) || null,
    })
    .eq("id", contexto.empresa.id);

  if (error) return FALHA(error.message);

  atualizarTelas();
  return OK("Dados da empresa atualizados.");
}

/**
 * Gera um código de instalação novo. As máquinas já matriculadas não são
 * afetadas: elas usam um token próprio desde o primeiro contato, e não o
 * código. Serve para quando o código vaza ou circula fora da empresa.
 */
export async function girarCodigoInstalacao(
  _anterior: ResultadoAcao | null,
  _dados: FormData,
): Promise<ResultadoAcao> {
  const supabase = await criarClienteServidor();
  const contexto = await carregarContexto(supabase);
  if (!contexto) return FALHA("Sessão expirada.");

  const { data, error } = await supabase.rpc("girar_codigo_instalacao", {
    p_org: contexto.empresa.id,
  });
  if (error) return FALHA(error.message);

  atualizarTelas();
  return OK(`Código novo gerado: ${String(data).replace(/(\d{4})(?=\d)/g, "$1-")}`);
}

// ----------------------------------------------------------------------------
//  Configuração do agente (aplicada remotamente na frota)
// ----------------------------------------------------------------------------

/**
 * Muda como os agentes coletam e enviam. Não mexe em binário: as estações
 * recebem isto na próxima sincronização e passam a obedecer sem ninguém tocar
 * nelas.
 */
export async function salvarConfiguracaoAgente(
  _anterior: ResultadoAcao | null,
  dados: FormData,
): Promise<ResultadoAcao> {
  const supabase = await criarClienteServidor();
  const contexto = await carregarContexto(supabase);
  if (!contexto) return FALHA("Sessão expirada.");
  if (!contexto.papel || !["OWNER", "MANAGER"].includes(contexto.papel)) {
    return FALHA("Sem permissão para alterar a configuração do agente.");
  }

  const horario = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
  const inicio = texto(dados, "agente_janela_inicio");
  const fim = texto(dados, "agente_janela_fim");

  if ((inicio && !horario.test(inicio)) || (fim && !horario.test(fim))) {
    return FALHA("Horário inválido. Use HH:MM, por exemplo 08:00.");
  }
  if ((inicio && !fim) || (!inicio && fim)) {
    return FALHA("Preencha os dois horários da janela, ou deixe ambos vazios para 24 horas.");
  }

  const ocioso = inteiro(dados, "agente_segundos_ocioso", 180);
  if (ocioso < 30 || ocioso > 3600) {
    return FALHA("O tempo até marcar como ocioso precisa ficar entre 30 e 3600 segundos.");
  }

  const lote = inteiro(dados, "agente_tamanho_lote", 120);
  if (lote < 10 || lote > 500) return FALHA("O tamanho do lote precisa ficar entre 10 e 500.");

  const buffer = inteiro(dados, "agente_dias_buffer", 14);
  if (buffer < 1 || buffer > 90) {
    return FALHA("O buffer local precisa ficar entre 1 e 90 dias.");
  }

  const sigilosos = (texto(dados, "agente_processos_sigilosos") ?? "")
    .split(/[\r\n,;]+/)
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean);

  const sincronizacao = Number(dados.get("sync_interval_minutes")) || null;
  if (sincronizacao !== null && (sincronizacao < 5 || sincronizacao > 720)) {
    return FALHA("O intervalo de sincronização precisa ficar entre 5 e 720 minutos.");
  }

  const { error } = await supabase
    .from("organizations")
    .update({
      sync_interval_minutes: sincronizacao,
      agente_segundos_ocioso: ocioso,
      agente_janela_inicio: inicio,
      agente_janela_fim: fim,
      agente_extrair_dominio: dados.get("agente_extrair_dominio") === "on",
      agente_mostrar_bandeja: dados.get("agente_mostrar_bandeja") === "on",
      agente_redigir_numeros: dados.get("agente_redigir_numeros") === "on",
      agente_tamanho_lote: lote,
      agente_dias_buffer: buffer,
      agente_processos_sigilosos: sigilosos,
    })
    .eq("id", contexto.empresa.id);

  if (error) return FALHA(error.message);

  atualizarTelas();
  return OK(
    `Configuração salva. As estações aplicam na próxima sincronização (até ${sincronizacao ?? SINCRONIZACAO_PADRAO_MINUTOS} minutos).`,
  );
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
