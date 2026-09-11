-- ============================================================================
--  0022 — Bloqueio de tela no diário de bordo da estação
--
--  O gestor pediu para ver, por máquina: quando liga, hiberna, BLOQUEIA e
--  desliga. Ligar (AGENTE_INICIADO), hibernar (SUSPENSA) e desligar (DESLIGANDO)
--  já eram coletados desde a 0018. Faltava o bloqueio de tela — a máquina
--  continua ligada, mas travada (Win+L, bloqueio por inatividade, troca de
--  usuário). Sem esse marco, tela travada e ociosidade comum viravam o mesmo
--  silêncio.
--
--  Dois valores novos no enum. ALTER TYPE ... ADD VALUE tem uma regra do
--  PostgreSQL: o valor recém-criado não pode ser USADO na mesma transação em
--  que nasce. Por isso este arquivo só ADICIONA os valores; a consulta que os
--  lê fica na 0023, aplicada logo depois, já noutra transação.
-- ============================================================================

alter type tipo_evento_estacao add value if not exists 'BLOQUEADA';
alter type tipo_evento_estacao add value if not exists 'DESBLOQUEADA';
