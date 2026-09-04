// ============================================================================
//  Constantes que espelham o que está compilado no agente Windows.
//
//  Existem aqui porque o painel precisa DIZER ao usuário o que acontece quando
//  ele deixa um campo em branco — e "padrão do agente" sem número é uma
//  informação que não informa nada.
//
//  ⚠️ Isto é a metade de um trato com o outro lado. Se mudar aqui, mude junto:
//     • agente/src/Telemetria.Nucleo/Configuracao/OpcoesAgente.cs
//     • agente/src/Telemetria.Servico/appsettings.json
//     • a função marcar_dispositivos_offline (migration 0015), que usa o mesmo
//       número como piso ao calcular o limiar de presença.
// ============================================================================

/** Intervalo de sincronização usado quando a empresa não configura nenhum. */
export const SINCRONIZACAO_PADRAO_MINUTOS = 5;
