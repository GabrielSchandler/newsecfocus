"use server";

// ============================================================================
//  Escala de expediente — empresa, equipe e pessoa.
//
//  A semana é salva INTEIRA de uma vez (apaga e regrava o alvo). É o que torna
//  a cascata previsível: personalizar uma pessoa define a semana dela, em vez de
//  misturar metade da equipe com metade da pessoa — mistura que ninguém
//  conseguiria explicar depois olhando a tela.
//
//  Sem service_role: quem pode escrever é decidido pela RLS (OWNER/MANAGER).
// ============================================================================

import { revalidatePath } from "next/cache";
import { criarClienteServidor } from "@/lib/supabase/server";
import { carregarContexto } from "@/lib/sessao";
import type { ResultadoAcao } from "./acoes";

const OK = (mensagem: string): ResultadoAcao => ({ ok: true, mensagem });
const FALHA = (mensagem: string): ResultadoAcao => ({ ok: false, mensagem });

const DIAS = ["segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo"];

function hora(dados: FormData, campo: string, padrao: string): string {
  const v = dados.get(campo);
  const t = typeof v === "string" ? v.trim() : "";
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(t) ? t : padrao;
}

export async function salvarEscala(
  _anterior: ResultadoAcao | null,
  dados: FormData,
): Promise<ResultadoAcao> {
  const supabase = await criarClienteServidor();
  const contexto = await carregarContexto(supabase);
  if (!contexto) return FALHA("Sessão expirada.");

  const escopo = String(dados.get("escopo") ?? "");
  const alvoBruto = String(dados.get("alvo") ?? "").trim();
  const alvo = alvoBruto === "" ? null : alvoBruto;

  if (!["EMPRESA", "EQUIPE", "PESSOA"].includes(escopo)) return FALHA("Escopo inválido.");
  if (escopo !== "EMPRESA" && !alvo) {
    return FALHA(escopo === "EQUIPE" ? "Escolha a equipe." : "Escolha a pessoa.");
  }

  const linhas = [];
  for (let d = 1; d <= 7; d++) {
    const trabalha = dados.get(`d${d}_trabalha`) === "on";
    const inicio = hora(dados, `d${d}_inicio`, "08:00");
    const fim = hora(dados, `d${d}_fim`, "18:00");
    const intIni = String(dados.get(`d${d}_int_inicio`) ?? "").trim();
    const intFim = String(dados.get(`d${d}_int_fim`) ?? "").trim();
    const temIntervalo = /^\d{2}:\d{2}$/.test(intIni) && /^\d{2}:\d{2}$/.test(intFim);

    if (trabalha && fim <= inicio) {
      return FALHA(`${DIAS[d - 1]}: o fim do expediente tem de ser depois do início.`);
    }
    if (trabalha && temIntervalo && (intFim <= intIni || intIni < inicio || intFim > fim)) {
      return FALHA(`${DIAS[d - 1]}: o intervalo tem de caber dentro do expediente.`);
    }

    linhas.push({
      org_id: contexto.empresa.id,
      escopo,
      equipe_id: escopo === "EQUIPE" ? alvo : null,
      colaborador_id: escopo === "PESSOA" ? alvo : null,
      dia_semana: d,
      trabalha,
      inicio,
      fim,
      intervalo_inicio: trabalha && temIntervalo ? intIni : null,
      intervalo_fim: trabalha && temIntervalo ? intFim : null,
    });
  }

  if (!linhas.some((l) => l.trabalha)) {
    return FALHA("Marque pelo menos um dia de trabalho.");
  }

  let apagar = supabase
    .from("escalas_expediente")
    .delete()
    .eq("org_id", contexto.empresa.id)
    .eq("escopo", escopo);
  if (escopo === "EQUIPE") apagar = apagar.eq("equipe_id", alvo!);
  if (escopo === "PESSOA") apagar = apagar.eq("colaborador_id", alvo!);

  const { error: erroApagar } = await apagar;
  if (erroApagar) return FALHA(`Não foi possível limpar a escala anterior: ${erroApagar.message}`);

  const { error } = await supabase.from("escalas_expediente").insert(linhas);
  if (error) return FALHA(`Não foi possível salvar: ${error.message}`);

  revalidatePath("/painel", "layout");
  return OK("Escala salva. O índice e a aderência já passam a usar ela.");
}

/** Volta a herdar o nível de cima (apaga a personalização deste alvo). */
export async function removerEscala(
  _anterior: ResultadoAcao | null,
  dados: FormData,
): Promise<ResultadoAcao> {
  const supabase = await criarClienteServidor();
  const contexto = await carregarContexto(supabase);
  if (!contexto) return FALHA("Sessão expirada.");

  const escopo = String(dados.get("escopo") ?? "");
  const alvo = String(dados.get("alvo") ?? "").trim();
  if (escopo === "EMPRESA") return FALHA("A escala da empresa é a base — não dá para removê-la.");
  if (!alvo) return FALHA("Alvo não informado.");

  let apagar = supabase
    .from("escalas_expediente")
    .delete()
    .eq("org_id", contexto.empresa.id)
    .eq("escopo", escopo);
  apagar = escopo === "EQUIPE" ? apagar.eq("equipe_id", alvo) : apagar.eq("colaborador_id", alvo);

  const { error } = await apagar;
  if (error) return FALHA(`Não foi possível remover: ${error.message}`);

  revalidatePath("/painel", "layout");
  return OK("Personalização removida — voltou a herdar o nível de cima.");
}
