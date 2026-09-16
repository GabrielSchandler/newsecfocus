// ============================================================================
//  Limiares de leitura do painel, num lugar só.
//
//  Toda regra que decide "isto merece aviso" ou "isto é comparável" mora aqui,
//  com o motivo. Mudar um número muda todas as telas juntas — e ninguém
//  precisa caçar um 50 perdido num componente.
// ============================================================================

export const REGRAS = {
  /**
   * Cobertura mínima (% do expediente com registro) para comparar dois
   * períodos. Abaixo disso a variação mede falta de dado, não mudança de
   * trabalho: um mês sem coleta "cai" 60 p.p. sem ninguém ter trabalhado menos.
   */
  coberturaMinimaComparacao: 50,

  /** Variação de índice, em p.p., a partir da qual uma equipe vira ponto de atenção. */
  variacaoRelevantePp: 5,

  /** Pessoas com menos que isto de cobertura aparecem como dado incompleto. */
  coberturaBaixa: 50,

  /** Tempo fora da escala abaixo disto, no período, é ruído (fechar uma aba às 18h05). */
  minutosForaEscalaRelevante: 15,

  /** Pontos de atenção exibidos na Visão geral; o resto fica na tela de cada assunto. */
  maxPontosAtencao: 3,

  /** Dias na linha de evolução com cobertura abaixo disto ficam fora da linha. */
  coberturaMinimaPontoEvolucao: 50,
} as const;
