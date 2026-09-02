// ============================================================================
//  Carregamento resiliente das páginas.
//
//  Uma consulta que falha não pode virar tela zerada silenciosa — era o que
//  acontecia com os try/catch vazios da primeira versão. Aqui o erro é
//  capturado, mas devolvido junto com o valor padrão para a página poder dizer
//  o que houve.
// ============================================================================

export interface Resultado<T> {
  dados: T;
  erro: string | null;
}

export async function comFalha<T>(
  promessa: Promise<T>,
  padrao: T,
): Promise<Resultado<T>> {
  try {
    return { dados: await promessa, erro: null };
  } catch (e) {
    const erro =
      e instanceof Error
        ? e.message
        : typeof e === "object" && e !== null && "message" in e
          ? String((e as { message: unknown }).message)
          : "Falha desconhecida ao consultar o banco.";
    return { dados: padrao, erro };
  }
}

/** Primeira mensagem de erro entre vários carregamentos. */
export function primeiroErro(...resultados: Resultado<unknown>[]): string | null {
  return resultados.find((r) => r.erro)?.erro ?? null;
}
