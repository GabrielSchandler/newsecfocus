// ============================================================================
//  Paleta única das fatias do expediente.
//
//  Vive num módulo só porque a mesma legenda aparece no resumo, na tabela de
//  equipes, na jornada e na linha do tempo do dia. Cor divergente entre telas
//  faz o gestor achar que está lendo coisas diferentes.
// ============================================================================
import type { FatiaExpediente, TipoCategoria } from "./tipos";

export const CORES_EXPEDIENTE: Record<FatiaExpediente, string> = {
  produtivos: "#1f9fb2",
  neutros: "#3d5f8f",
  improdutivos: "#e0676b",
  semClassificar: "#a9c8e4",
  ociosos: "#f2c14e",
  bloqueado: "#a3acb8",
  // Onde dá para usar CSS, "sem dados" vai listrado (.listrado-sem-dados).
  semDados: "#dde3ea",
};

/** Classe que desenha a fatia — só "sem dados" foge da cor lisa. */
export const CLASSE_FATIA: Partial<Record<FatiaExpediente, string>> = {
  semDados: "listrado-sem-dados",
};

export const ROTULOS_EXPEDIENTE: Record<FatiaExpediente, string> = {
  produtivos: "Produtivo",
  neutros: "Neutro",
  improdutivos: "Improdutivo",
  semClassificar: "Sem classificação",
  ociosos: "Ocioso",
  bloqueado: "Bloqueado",
  // Expediente sem nenhum registro: máquina desligada, agente parado ou envio
  // atrasado. O banco não distingue os três, então o nome não finge que sabe.
  semDados: "Sem dados",
};

/** Do melhor ao ausente — ordem da barra e da legenda. */
export const ORDEM_EXPEDIENTE: FatiaExpediente[] = [
  "produtivos", "neutros", "improdutivos", "semClassificar", "ociosos", "bloqueado", "semDados",
];

/**
 * Categoria de aplicativo. Ocioso e bloqueado são ESTADOS da atividade, não
 * categorias — por isso não aparecem aqui.
 */
export const CORES_CATEGORIA: Record<TipoCategoria | "SEM", string> = {
  PRODUCTIVE: CORES_EXPEDIENTE.produtivos,
  NEUTRAL: CORES_EXPEDIENTE.neutros,
  UNPRODUCTIVE: CORES_EXPEDIENTE.improdutivos,
  SEM: CORES_EXPEDIENTE.semClassificar,
};

export const ROTULOS_CATEGORIA: Record<TipoCategoria | "SEM", string> = {
  PRODUCTIVE: "Produtivo",
  NEUTRAL: "Neutro",
  UNPRODUCTIVE: "Improdutivo",
  SEM: "Sem classificação",
};
