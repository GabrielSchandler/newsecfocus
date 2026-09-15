-- ============================================================================
--  0029 — O agente coleta o tempo todo
--
--  A janela de coleta (início/fim) saiu do produto. Ela recortava o que o agente
--  GRAVAVA, e isso ficou errado por dois motivos:
--
--    • quem define o que conta como trabalho passou a ser a escala de expediente
--      (0027) — recortar na origem só fazia perder dado;
--    • com a janela ligada, tudo fora dela virava buraco indistinguível de
--      máquina desligada, e agora "desligado dentro do expediente" é justamente
--      um número que o painel mostra.
--
--  Zeramos a janela de todas as empresas: na próxima sincronização a frota volta
--  a coletar enquanto a máquina estiver ligada. As colunas continuam existindo
--  para não quebrar a configuracao_agente publicada, mas sempre em branco.
-- ============================================================================

update organizations
   set agente_janela_inicio = null,
       agente_janela_fim    = null
 where agente_janela_inicio is not null
    or agente_janela_fim is not null;

comment on column organizations.agente_janela_inicio is
    'Descontinuado em 15/09/2026: o agente coleta enquanto a máquina estiver ligada. Quem recorta o que conta é a escala de expediente (escalas_expediente). Mantida em branco.';
comment on column organizations.agente_janela_fim is
    'Descontinuado em 15/09/2026 — ver agente_janela_inicio.';
