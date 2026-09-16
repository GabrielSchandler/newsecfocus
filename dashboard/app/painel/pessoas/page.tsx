import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertCircle, ArrowRight, CircleUserRound, Search, UserCheck, UserX, Users } from "lucide-react";
import { AbasPainel } from "@/components/painel/abas-painel";
import { BarraFiltros } from "@/components/painel/barra-filtros";
import { AvisoErro, CabecalhoPagina } from "@/components/painel/cabecalho";
import {
  Avatar,
  BarraPercentual,
  ColunaOrdenavel,
  GradeIndicadores,
  Indicador,
  Paginacao,
  Secao,
  TabelaSimples,
} from "@/components/painel/kit";
import { criarClienteServidor } from "@/lib/supabase/server";
import { carregarContexto, podeAdministrar } from "@/lib/sessao";
import { comFalha } from "@/lib/carregar";
import { lerFiltros, orgEfetiva, paramsDoRecorte, type ParamsPagina } from "@/lib/filtros-url";
import { dataCurta, formatarDuracao, horaCurta } from "@/lib/formato";
import { diaNoFuso } from "@/lib/periodos";
import { janelaAtual } from "@/lib/produtividade";
import { rotuloIntervaloCurto } from "@/lib/visao-geral";
import {
  buscarEquipes,
  buscarPessoasContagem,
  buscarPessoasLista,
  type OrdemPessoas,
  type SituacaoPessoas,
} from "@/lib/consultas";

export const dynamic = "force-dynamic";

const POR_PAGINA = 10;
const ORDENS: OrdemPessoas[] = ["nome", "equipe", "indice", "ativos", "cobertura", "ultimo"];
const SITUACOES: SituacaoPessoas[] = ["todas", "com_registro", "sem_registro", "pendente", "inativas"];

const texto = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function PaginaPessoas({
  searchParams,
}: {
  searchParams: Promise<ParamsPagina>;
}) {
  const params = await searchParams;
  const supabase = await criarClienteServidor();
  const contexto = await carregarContexto(supabase);

  if (!contexto) redirect("/entrar");

  const { periodo, escopo } = lerFiltros(params, contexto);
  const fuso = contexto.empresa.fuso;
  const org = orgEfetiva(contexto, escopo);
  const admin = podeAdministrar(contexto);
  const recorte = paramsDoRecorte(params);
  const janela = janelaAtual(periodo);

  const busca = texto(params.busca)?.trim() || null;
  const situacaoBruta = texto(params.situacao) as SituacaoPessoas | undefined;
  const situacao = SITUACOES.includes(situacaoBruta as SituacaoPessoas) ? situacaoBruta! : "todas";
  const ordemBruta = texto(params.ordem) as OrdemPessoas | undefined;
  const ordem = ORDENS.includes(ordemBruta as OrdemPessoas) ? ordemBruta! : "nome";
  const decrescente = texto(params.dir) === "desc";
  const pagina = Math.max(1, Number(texto(params.pagina)) || 1);

  const [lista, contagem, pendentes, equipes] = await Promise.all([
    comFalha(buscarPessoasLista(supabase, janela, escopo, { busca, situacao, ordem, decrescente, pagina, limite: POR_PAGINA }), {
      linhas: [],
      total: 0,
    }),
    comFalha(buscarPessoasContagem(supabase, janela, escopo), null),
    comFalha(buscarPessoasLista(supabase, janela, escopo, { situacao: "pendente", limite: 5 }), { linhas: [], total: 0 }),
    comFalha(buscarEquipes(supabase, org), []),
  ]);

  /** Mantém tudo na URL e troca só o que mudou. */
  const hrefCom = (mudancas: Record<string, string | null>) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      const valor = texto(v);
      if (valor) u.set(k, valor);
    }
    for (const [k, v] of Object.entries(mudancas)) {
      if (v === null) u.delete(k);
      else u.set(k, v);
    }
    const q = u.toString();
    return `/painel/pessoas${q ? `?${q}` : ""}`;
  };

  const c = contagem.dados;
  const hojeFuso = diaNoFuso(new Date(), fuso);
  const quando = (iso: string | null) =>
    !iso ? "—" : diaNoFuso(new Date(iso), fuso) === hojeFuso ? horaCurta(iso, fuso) : `${dataCurta(iso, fuso).slice(0, 5)} ${horaCurta(iso, fuso)}`;

  return (
    <div className="space-y-4 sm:space-y-5">
      <CabecalhoPagina
        titulo="Pessoas"
        descricao="Veja os registros de cada colaborador e acompanhe a atividade no período."
        acoes={
          <>
            <form action="/painel/pessoas" method="get" className="relative w-full sm:w-72" role="search">
              {Object.entries(params)
                .filter(([k]) => !["busca", "pagina"].includes(k))
                .map(([k, v]) => (
                  <input key={k} type="hidden" name={k} value={texto(v) ?? ""} />
                ))}
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                name="busca"
                defaultValue={busca ?? ""}
                placeholder="Buscar por nome, usuário ou e-mail…"
                aria-label="Buscar pessoa"
                className="h-11 w-full rounded-lg border border-borda bg-white pl-9 pr-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-acao/60 focus:ring-2 focus:ring-acao/15"
              />
            </form>
            <BarraFiltros
              variante="topo"
              rotuloPeriodo={rotuloIntervaloCurto(periodo, fuso)}
              periodo={periodo}
              escopo={escopo}
              fuso={fuso}
              equipes={equipes.dados}
              campos={["equipe"]}
              travarEquipe={!!contexto.equipeEscopo}
            />
          </>
        }
      />

      {lista.erro && <AvisoErro mensagem={lista.erro} />}

      <GradeIndicadores colunas={3}>
        <Indicador compacto icone={<Users />} rotulo="Pessoas cadastradas" valor={c?.cadastradas ?? "—"} rodape="ativas na plataforma" />
        <Indicador
          compacto
          icone={<UserCheck />}
          rotulo="Com registros no período"
          valor={c?.comRegistro ?? "—"}
          rodape={c ? `${c.semRegistro} sem nenhum registro` : undefined}
        />
        <Indicador
          compacto
          tom={c && c.pendentes > 0 ? "alerta" : "normal"}
          icone={<UserX />}
          rotulo="Cadastro pendente"
          valor={c?.pendentes ?? "—"}
          rodape={c ? `${c.semEquipe} sem equipe` : undefined}
        />
      </GradeIndicadores>

      <div className="grid grid-cols-1 gap-4 sm:gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <Secao
          icone={<CircleUserRound />}
          titulo="Lista de pessoas"
          subtitulo={busca ? `Resultado para “${busca}”` : `Métricas de ${rotuloIntervaloCurto(periodo, fuso)}`}
        >
          <div className="mb-4">
            <AbasPainel
              param="situacao"
              ativa={situacao}
              preservar={{ apagar: ["pagina"] }}
              abas={[
                { chave: "todas", rotulo: "Todas", selo: undefined },
                { chave: "com_registro", rotulo: "Com registro" },
                { chave: "sem_registro", rotulo: "Sem registro" },
                { chave: "pendente", rotulo: "Cadastro pendente", selo: c?.pendentes },
                { chave: "inativas", rotulo: "Inativas" },
              ]}
            />
          </div>

          {lista.dados.linhas.length === 0 ? (
            <p className="rounded-lg border border-dashed border-borda py-10 text-center text-sm text-slate-500">
              {busca ? "Ninguém encontrado com essa busca." : "Nenhuma pessoa nesta situação."}
            </p>
          ) : (
            <>
              {/* No celular ficam pessoa e produtivo: a equipe desce para baixo
                  do nome, a cobertura para baixo da barra e o resto abre no perfil. */}
              <TabelaSimples minimo="md:min-w-[760px]">
                <thead>
                  <tr>
                    <ColunaOrdenavel rotulo="Pessoa" chave="nome" ordemAtual={ordem} decrescente={decrescente} href={(o, d) => hrefCom({ ordem: o, dir: d ? "desc" : null, pagina: null })} />
                    <ColunaOrdenavel rotulo="Equipe" chave="equipe" className="hidden md:table-cell" ordemAtual={ordem} decrescente={decrescente} href={(o, d) => hrefCom({ ordem: o, dir: d ? "desc" : null, pagina: null })} />
                    <ColunaOrdenavel rotulo="Produtivo" chave="indice" ordemAtual={ordem} decrescente={decrescente} href={(o, d) => hrefCom({ ordem: o, dir: d ? "desc" : null, pagina: null })} />
                    <ColunaOrdenavel rotulo="Tempo ativo" chave="ativos" alinhar="direita" className="hidden md:table-cell" ordemAtual={ordem} decrescente={decrescente} href={(o, d) => hrefCom({ ordem: o, dir: d ? "desc" : null, pagina: null })} />
                    <ColunaOrdenavel rotulo="Cobertura" chave="cobertura" alinhar="direita" className="hidden sm:table-cell" ordemAtual={ordem} decrescente={decrescente} href={(o, d) => hrefCom({ ordem: o, dir: d ? "desc" : null, pagina: null })} />
                    <ColunaOrdenavel rotulo="Último registro" chave="ultimo" alinhar="direita" className="hidden md:table-cell" ordemAtual={ordem} decrescente={decrescente} href={(o, d) => hrefCom({ ordem: o, dir: d ? "desc" : null, pagina: null })} />
                  </tr>
                </thead>
                <tbody>
                  {lista.dados.linhas.map((p) => (
                    <tr key={p.colaboradorId} className="hover:bg-slate-50">
                      <td>
                        <Link href={`/painel/pessoas/${p.colaboradorId}${recorte}`} className="flex min-w-0 items-center gap-3">
                          <Avatar nome={p.nome} />
                          <span className="min-w-0">
                            <span className="block truncate font-medium text-slate-900 hover:text-acao hover:underline">{p.nome}</span>
                            <span className="block truncate text-xs text-slate-500">{p.cargo ?? p.osUser}</span>
                            <span className="block truncate text-xs text-slate-500 md:hidden">
                              {p.equipe ?? <span className="text-amber-700">Sem equipe</span>}
                            </span>
                          </span>
                        </Link>
                      </td>
                      <td className="hidden text-slate-700 md:table-cell">
                        {p.equipe ?? <span className="text-amber-700">Sem equipe</span>}
                        {!p.perfilCompleto && <span className="block text-xs text-amber-700">cadastro pendente</span>}
                      </td>
                      <td className="min-w-[110px] md:min-w-[150px]">
                        {p.minutosExpediente ? <BarraPercentual valor={p.indice} /> : <span className="text-slate-400">sem expediente</span>}
                        {p.cobertura !== null && (
                          <span className="numeros-tabulares mt-1 block text-[11px] text-slate-500 sm:hidden">
                            cobertura {Math.round(p.cobertura)}%
                          </span>
                        )}
                      </td>
                      <td className="numeros-tabulares hidden text-right md:table-cell">{p.minutosAtivos === null ? "—" : formatarDuracao(p.minutosAtivos)}</td>
                      <td className="numeros-tabulares hidden text-right sm:table-cell">{p.cobertura === null ? "—" : `${Math.round(p.cobertura)}%`}</td>
                      <td className="numeros-tabulares hidden text-right text-slate-700 md:table-cell">{quando(p.ultimoRegistro)}</td>
                    </tr>
                  ))}
                </tbody>
              </TabelaSimples>
              <Paginacao
                pagina={pagina}
                porPagina={POR_PAGINA}
                total={lista.dados.total}
                href={(p) => hrefCom({ pagina: String(p) })}
                rotuloItens="pessoas"
              />
            </>
          )}
        </Secao>

        <Secao icone={<AlertCircle />} titulo="Pontos de atenção" subtitulo="Cadastro, não atividade">
          {pendentes.dados.linhas.length === 0 ? (
            <p className="text-sm text-slate-600">Nenhum cadastro pendente.</p>
          ) : (
            <ul className="space-y-4">
              {pendentes.dados.linhas.map((p) => (
                <li key={p.colaboradorId} className="flex items-start gap-3">
                  <Avatar nome={p.nome} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">{p.nome}</p>
                    <p className="text-xs text-slate-500">
                      {!p.equipeId ? "Sem equipe: fica fora das comparações de equipe" : "Cadastro ainda não revisado"}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {admin && pendentes.dados.linhas.length > 0 && (
            <Link
              href="/painel/administracao?aba=pessoas"
              className="mt-5 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-acao/70 text-sm font-medium text-acao hover:bg-acao-suave"
            >
              Revisar cadastro
              <ArrowRight className="h-4 w-4" />
            </Link>
          )}
          {pendentes.dados.total > 5 && (
            <Link href={hrefCom({ situacao: "pendente", pagina: null })} className="mt-3 block text-center text-sm text-acao hover:underline">
              Ver todas as {pendentes.dados.total}
            </Link>
          )}
        </Secao>
      </div>
    </div>
  );
}
