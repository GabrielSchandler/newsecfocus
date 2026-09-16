// ============================================================================
//  Cliente do BANCO LOCAL de desenvolvimento (npm run dev:local).
//
//  Imita a parte do cliente Supabase que o painel usa — rpc(), from() com
//  filtros, ordenação, paginação e escrita, e auth — mas fala com o servidor
//  PGlite de scripts/banco-local. Só é criado quando NODE_ENV é development E
//  a variável do banco local está definida; em build de produção esse caminho
//  é código morto e o painel sempre usa o Supabase de verdade.
// ============================================================================

type Filtro = { coluna: string; operador: string; valor: unknown };

interface Pedido {
  tipo: "rpc" | "tabela";
  nome?: string;
  params?: Record<string, unknown>;
  tabela?: string;
  operacao?: "select" | "insert" | "update" | "delete" | "upsert";
  colunas?: string;
  filtros?: Filtro[];
  ordem?: { coluna: string; ascendente?: boolean; nulosPrimeiro?: boolean }[];
  limite?: number;
  intervalo?: [number, number];
  unico?: "single" | "maybe";
  contagem?: string;
  cabecalho?: boolean;
  valores?: unknown;
  conflito?: string;
}

interface Resposta {
  dados: any;
  total?: number | null;
  erro: { message: string; code?: string | null } | null;
}

type Enviar = (pedido: Pedido | { tipo: "usuario" }) => Promise<Resposta>;

class ConsultaLocal implements PromiseLike<{ data: any; error: any; count: number | null }> {
  constructor(
    private readonly enviar: Enviar,
    private readonly pedido: Pedido,
  ) {}

  private com(mudanca: Partial<Pedido>) {
    Object.assign(this.pedido, mudanca);
    return this;
  }

  private filtro(coluna: string, operador: string, valor: unknown) {
    this.pedido.filtros = [...(this.pedido.filtros ?? []), { coluna, operador, valor }];
    return this;
  }

  select(colunas = "*", opcoes?: { count?: string; head?: boolean }) {
    return this.com({
      colunas,
      operacao: this.pedido.operacao ?? "select",
      contagem: opcoes?.count,
      cabecalho: opcoes?.head,
    });
  }
  insert(valores: unknown) { return this.com({ operacao: "insert", valores }); }
  upsert(valores: unknown, opcoes?: { onConflict?: string }) {
    return this.com({ operacao: "upsert", valores, conflito: opcoes?.onConflict });
  }
  update(valores: unknown) { return this.com({ operacao: "update", valores }); }
  delete() { return this.com({ operacao: "delete" }); }

  eq(c: string, v: unknown) { return this.filtro(c, "eq", v); }
  neq(c: string, v: unknown) { return this.filtro(c, "neq", v); }
  gt(c: string, v: unknown) { return this.filtro(c, "gt", v); }
  gte(c: string, v: unknown) { return this.filtro(c, "gte", v); }
  lt(c: string, v: unknown) { return this.filtro(c, "lt", v); }
  lte(c: string, v: unknown) { return this.filtro(c, "lte", v); }
  like(c: string, v: unknown) { return this.filtro(c, "like", v); }
  ilike(c: string, v: unknown) { return this.filtro(c, "ilike", v); }
  in(c: string, v: unknown[]) { return this.filtro(c, "in", v); }
  is(c: string, v: unknown) { return this.filtro(c, "is", v); }

  order(coluna: string, opcoes?: { ascending?: boolean; nullsFirst?: boolean }) {
    this.pedido.ordem = [
      ...(this.pedido.ordem ?? []),
      { coluna, ascendente: opcoes?.ascending, nulosPrimeiro: opcoes?.nullsFirst },
    ];
    return this;
  }
  limit(n: number) { return this.com({ limite: n }); }
  range(de: number, ate: number) { return this.com({ intervalo: [de, ate] }); }
  single() { return this.com({ unico: "single" }); }
  maybeSingle() { return this.com({ unico: "maybe" }); }

  then<A = { data: any; error: any; count: number | null }, B = never>(
    ok?: ((v: { data: any; error: any; count: number | null }) => A | PromiseLike<A>) | null,
    falha?: ((motivo: any) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    const operacao = this.pedido.operacao ?? "select";
    // Escrita sem .select() devolve data null, como o Supabase.
    const semRetorno = operacao !== "select" && !this.pedido.colunas;
    return this.enviar({ ...this.pedido, operacao, colunas: this.pedido.colunas ?? "*" })
      .then((r) => ({
        data: r.erro ? null : semRetorno ? null : r.dados,
        error: r.erro,
        count: r.total ?? null,
      }))
      .then(ok, falha);
  }
}

export function criarClienteLocal({ base, usuario }: { base: string; usuario?: string }) {
  const enviar: Enviar = async (pedido) => {
    // O servidor local atende uma consulta por vez; com muitas em fila a
    // conexão às vezes cai. Uma nova tentativa resolve — isto só existe em dev.
    for (let tentativa = 0; ; tentativa++) {
      try {
        const resposta = await fetch(base, {
          method: "POST",
          headers: { "content-type": "application/json", connection: "close" },
          body: JSON.stringify({ ...pedido, usuario }),
          cache: "no-store",
        });
        return await resposta.json();
      } catch (e) {
        if (tentativa >= 2) throw e;
        await new Promise((r) => setTimeout(r, 200));
      }
    }
  };

  const usuarioAtual = async () => {
    const r = await enviar({ tipo: "usuario" });
    return r.dados ? { id: r.dados.id, email: r.dados.email } : null;
  };

  return {
    rpc(nome: string, params?: Record<string, unknown>) {
      return enviar({ tipo: "rpc", nome, params }).then((r) => ({ data: r.dados, error: r.erro }));
    },
    from(tabela: string) {
      return new ConsultaLocal(enviar, { tipo: "tabela", tabela });
    },
    auth: {
      async getUser() {
        return { data: { user: await usuarioAtual() }, error: null };
      },
      async getSession() {
        const user = await usuarioAtual();
        return { data: { session: user ? { user } : null }, error: null };
      },
      async signOut() { return { error: null }; },
      async signInWithPassword() { return { data: { user: await usuarioAtual() }, error: null }; },
      async updateUser() { return { data: { user: await usuarioAtual() }, error: null }; },
      async resetPasswordForEmail() { return { data: {}, error: null }; },
    },
  };
}

/** Banco local ligado? Só em desenvolvimento, nunca em build de produção. */
export function bancoLocalAtivo(): boolean {
  return process.env.NODE_ENV === "development" && !!process.env.FOCUS_BANCO_LOCAL;
}
