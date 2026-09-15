// ============================================================================
//  Paleta única das fatias do expediente.
//
//  Vive num módulo só porque a mesma legenda aparece no resumo, na tabela de
//  equipes e na linha do tempo do dia. Cor divergente entre telas faz o gestor
//  achar que está lendo coisas diferentes.
// ============================================================================
import type { ComposicaoExpediente } from "./tipos";

export const CORES_EXPEDIENTE: Record<keyof ComposicaoExpediente, string> = {
  produtivo: "#22d3ee",
  neutro: "#a78bfa",
  improdutivo: "#fb7185",
  semClassificar: "#94a3b8",
  ocioso: "#f59e0b",
  bloqueado: "#6366f1",
  desligado: "#334155",
};

export const ROTULOS_EXPEDIENTE: Record<keyof ComposicaoExpediente, string> = {
  produtivo: "Produtivo",
  neutro: "Neutro",
  improdutivo: "Improdutivo",
  semClassificar: "Sem classificação",
  ocioso: "Ocioso",
  bloqueado: "Bloqueado",
  desligado: "Desligado",
};

/** Do melhor ao ausente — ordem da barra e da legenda. */
export const ORDEM_EXPEDIENTE: (keyof ComposicaoExpediente)[] = [
  "produtivo", "neutro", "improdutivo", "semClassificar", "ocioso", "bloqueado", "desligado",
];
