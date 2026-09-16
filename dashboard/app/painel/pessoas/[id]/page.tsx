import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  Activity,
  AppWindow,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  Database,
  History,
  ListChecks,
  Monitor,
  TrendingUp,
  UserRound,
} from "lucide-react";
import { BarraFiltros } from "@/components/painel/barra-filtros";
import { BotaoExportar } from "@/components/painel/botao-exportar";
import { AvisoErro, CabecalhoPagina } from "@/components/painel/cabecalho";
import { DEFINICOES } from "@/components/painel/resumo-expediente";
import { LinhaDoTempo } from "@/components/painel/linha-do-tempo";
import { SecaoRitmo } from "@/components/painel/secao-ritmo";
import {
  Avatar,
  BarrasHorizontais,
  GradeIndicadores,
  Indicador,
  LinkAcao,
  Secao,
  Selo,
  SeloCategoria,
  TabelaSimples,
  Variacao,
} from "@/components/painel/kit";
import { criarClienteServidor } from "@/lib/supabase/server";
import { carregarContexto } from "@/lib/sessao";
import { comFalha, primeiroErro } from "@/lib/carregar";
import { lerFiltros, paramsDoRecorte, type ParamsPagina } from "@/lib/filtros-url";
import { dataCurta, formatarDuracao, formatarPorcentagemEnxuta, horaCurta } from "@/lib/formato";
import { diaNoFuso, instanteNoFuso } from "@/lib/periodos";
import { agregarProdutividade, compararIndice, janelaAtual, janelaComparativo } from "@/lib/produtividade";
import { juntar, rotuloIntervaloCurto } from "@/lib/visao-geral";
import {
  buscarAplicativosLista,
  buscarEstacoes,
  buscarEstacoesColaborador,
  buscarLinhaDoTempo,
  buscarProdutividade,
  buscarProdutividadeDiaria,
  buscarRitmo,
  buscarSessoes,
} from "@/lib/consultas";
import type { Escopo, Periodo } from "@/lib/tipos";

export const dynamic = "force-dynamic";

const texto = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const ESTADOS = { ATIVO: null, OCIOSO: "Ocioso", BLOQUEADO: "Tela bloqueada" } as const;

export default async function PaginaDetalhePessoa({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<ParamsPagina>;
}) {
  const { id } = await params;
  const busca = await searchParams;
  const supabase = await criarClienteServidor();
  const contexto = await carregarContexto(supabase);

  if (!contexto) redirect("/entrar");

  // RLS: pessoa de outra empresa (ou de outra equipe, para o líder) não volta.
  const { data: pessoa } = await supabase
    .from("employees")
    .select("id, nome, os_user, cargo, email, perfil_completo, team_id, teams(id, nome)")
    .eq("id", id)
    .maybeSingle();

  if (!pessoa) notFound();

  const equipeBruta = (pessoa as any).teams;
  const equipe = Array.isArray(equipeBruta) ? equipeBruta[0] : equipeBruta;
  const nome: string = pessoa.nome ?? pessoa.os_user;

  const { periodo, escopo: recorteAtual } = lerFiltros(busca, contexto);
  const fuso = contexto.empresa.fuso;
  const recorte = paramsDoRecorte(busca);
  const escopo: Escopo = { orgId: recorteAtual.orgId, equipeId: null, colaboradorId: id, dispositivoId: null };

  // Dia da linha do tempo: o pedido na URL ou o último dia do período até hoje.
  const hoje = diaNoFuso(new Date(), fuso);
  const ultimoDoPeriodo = diaNoFuso(new Date(new Date(periodo.fim).getTime() - 1000), fuso);
  const diaPedido = texto(busca.dia);
  const dia = diaPedido && /^\d{4}-\d{2}-\d{2}$/.test(diaPedido) ? diaPedido : ultimoDoPeriodo < hoje ? ultimoDoPeriodo : hoje;
  const [a, m, d] = dia.split("-").map(Number);
  const janelaDia = { inicio: instanteNoFuso(fuso, a, m, d).toISOString(), fim: instanteNoFuso(fuso, a, m, d + 1).toISOString() };
  const deslocarDia = (n: number) => diaNoFuso(instanteNoFuso(fuso, a, m, d + n, 12), fuso);
  const estacaoPedida = texto(busca.estacao) ?? null;

  const janela = janelaAtual(periodo);
  const comparativo = await comFalha(janelaComparativo(supabase, periodo, fuso, escopo.orgId), null);

  const [produtividade, anterior, estacoesPessoa, estacoesEmpresa, diaria, diariaDoDia, segmentos, sessoes, apps] =
    await Promise.all([
      comFalha(buscarProdutividade(supabase, janela, escopo), []),
      comparativo.dados
        ? comFalha(buscarProdutividade(supabase, comparativo.dados, escopo), [])
        : Promise.resolve({ dados: [], erro: null }),
      comFalha(buscarEstacoesColaborador(supabase, id), []),
      comFalha(buscarEstacoes(supabase, escopo.orgId), []),
      comFalha(buscarProdutividadeDiaria(supabase, janela, escopo), []),
      comFalha(buscarProdutividadeDiaria(supabase, janelaDia, escopo), []),
      comFalha(buscarLinhaDoTempo(supabase, janelaDia as unknown as Periodo, id, estacaoPedida), []),
      comFalha(buscarSessoes(supabase, id, janelaDia, estacaoPedida), []),
      comFalha(buscarAplicativosLista(supabase, janela, escopo, { limite: 5 }), { linhas: [], total: 0 }),
    ]);

  const resumo = agregarProdutividade(produtividade.dados);
  const resumoAnterior = comparativo.dados && !anterior.erro ? agregarProdutividade(anterior.dados) : null;
  const situacao = new Map(estacoesEmpresa.dados.map((e) => [e.id, e]));
  const estacoes = estacoesPessoa.dados.map((e) => ({ ...e, info: situacao.get(e.id) }));
  const ultimoRegistro = estacoes
    .map((e) => e.info?.ultimoRegistro)
    .filter((v): v is string => !!v)
    .sort()
    .pop();
  const escalaDia = diariaDoDia.dados[0] ?? null;
  const minutosApps = apps.dados.linhas.reduce((s, l) => s + l.minutos, 0);
  const totalApps = resumo.minutos.ativos + resumo.minutos.ativosFora;
  const sessoesVisiveis = sessoes.dados.filter((s) => s.minutos >= 2 || s.estado !== "ATIVO");
  const hrefDia = (novo: string, estacao: string | null = estacaoPedida) =>
    `/painel/pessoas/${id}${juntar(recorte, `dia=${novo}${estacao ? `&estacao=${estacao}` : ""}`)}`;
  const quando = (iso: string) => `${dataCurta(iso, fuso).slice(0, 5)} ${horaCurta(iso, fuso)}`;

  const erro = primeiroErro(produtividade, estacoesPessoa);

  return (
    <div className="space-y-4 sm:space-y-5">
      <CabecalhoPagina
        trilha={[{ rotulo: "Pessoas", href: `/painel/pessoas${recorte}` }, { rotulo: nome }]}
        marca={<Avatar nome={nome} tamanho="lg" />}
        titulo={nome}
        descricao={
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <span>{[equipe?.nome ?? "Sem equipe", pessoa.cargo].filter(Boolean).join(" · ")}</span>
            <span className="text-slate-500">
              {estacoes.length === 0
                ? "Nenhuma estação"
                : estacoes.length === 1
                  ? `Estação: ${estacoes[0].machine_name}`
                  : `${estacoes.length} estações`}
            </span>
            <span className="text-slate-500">Último registro: {ultimoRegistro ? quando(ultimoRegistro) : "—"}</span>
            {!pessoa.perfil_completo && <Selo tom="atencao">cadastro pendente</Selo>}
          </div>
        }
        acoes={
          <>
            <BarraFiltros
              variante="topo"
              rotuloPeriodo={rotuloIntervaloCurto(periodo, fuso)}
              periodo={periodo}
              escopo={recorteAtual}
              fuso={fuso}
              campos={[]}
            />
            <Link
              href={`/painel/registros?colaborador=${id}&data=${dia}`}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-acao/70 bg-white px-4 text-[15px] font-medium text-acao hover:bg-acao-suave"
            >
              <ListChecks className="h-[18px] w-[18px]" />
              Ver registros
            </Link>
            <BotaoExportar periodo={periodo} escopo={escopo} tipos={["diario", "aplicativos"]} />
          </>
        }
      />

      {erro && <AvisoErro mensagem={erro} />}

      <GradeIndicadores>
        <Indicador
          compacto
          icone={<TrendingUp />}
          rotulo="Produtivo"
          definicao={DEFINICOES.indice}
          valor={resumo.indiceMedio === null ? "—" : formatarPorcentagemEnxuta(resumo.indiceMedio)}
          rodape={<Variacao valor={compararIndice(resumo, resumoAnterior)} rotulo={comparativo.dados?.rotulo ?? null} />}
        />
        <Indicador compacto icone={<Clock />} rotulo="Tempo ativo" definicao={DEFINICOES.ativo} valor={formatarDuracao(resumo.minutos.ativos)} rodape="dentro do expediente" />
        <Indicador
          compacto
          icone={<Database />}
          rotulo="Cobertura"
          definicao={DEFINICOES.cobertura}
          valor={resumo.cobertura === null ? "—" : `${Math.round(resumo.cobertura)}%`}
          rodape={`${formatarDuracao(Math.min(resumo.minutos.registrados, resumo.minutos.expediente))} de ${formatarDuracao(resumo.minutos.expediente)}`}
        />
        <Indicador
          compacto
          icone={<UserRound />}
          rotulo="Fora da escala"
          definicao={DEFINICOES.fora}
          valor={formatarDuracao(resumo.minutos.ativosFora)}
          rodape="estimativa por 15 min"
        />
      </GradeIndicadores>

      <Secao
        icone={<Activity />}
        titulo="Linha do tempo de atividades"
        subtitulo={
          escalaDia?.trabalha
            ? `Escala do dia ${escalaDia.escalaInicio}–${escalaDia.escalaFim}${escalaDia.intervaloInicio ? ` · intervalo ${escalaDia.intervaloInicio}–${escalaDia.intervaloFim}` : ""}`
            : "Dia sem expediente na escala"
        }
        acao={
          <div className="flex flex-wrap items-center justify-end gap-2">
            {estacoes.length > 1 && (
              <div className="flex rounded-lg border border-borda p-0.5 text-xs">
                <Link href={hrefDia(dia, null)} className={`rounded-md px-2 py-1 ${!estacaoPedida ? "bg-acao text-white" : "text-slate-600 hover:bg-slate-100"}`}>
                  Todas
                </Link>
                {estacoes.map((e) => (
                  <Link key={e.id} href={hrefDia(dia, e.id)} className={`rounded-md px-2 py-1 ${estacaoPedida === e.id ? "bg-acao text-white" : "text-slate-600 hover:bg-slate-100"}`}>
                    {e.machine_name}
                  </Link>
                ))}
              </div>
            )}
            <div className="flex items-center gap-1 text-sm text-slate-700">
              <Link href={hrefDia(deslocarDia(-1))} aria-label="Dia anterior" className="rounded-md p-1.5 hover:bg-slate-100">
                <ChevronLeft className="h-4 w-4" />
              </Link>
              <span className="numeros-tabulares flex items-center gap-1.5 px-1">
                <CalendarDays className="h-4 w-4 text-slate-500" />
                {dataCurta(janelaDia.inicio, fuso)}
              </span>
              {dia < hoje ? (
                <Link href={hrefDia(deslocarDia(1))} aria-label="Próximo dia" className="rounded-md p-1.5 hover:bg-slate-100">
                  <ChevronRight className="h-4 w-4" />
                </Link>
              ) : (
                <span className="p-1.5 text-slate-300">
                  <ChevronRight className="h-4 w-4" />
                </span>
              )}
            </div>
          </div>
        }
      >
        {segmentos.erro ? (
          <AvisoErro mensagem={segmentos.erro} />
        ) : (
          <LinhaDoTempo
            segmentos={segmentos.dados}
            fuso={fuso}
            escala={
              escalaDia?.trabalha
                ? { inicio: escalaDia.escalaInicio, fim: escalaDia.escalaFim, intervaloInicio: escalaDia.intervaloInicio, intervaloFim: escalaDia.intervaloFim }
                : null
            }
          />
        )}
        {estacaoPedida === null && estacoes.length > 1 && (
          <p className="mt-3 text-xs text-slate-500">
            Com mais de uma estação no mesmo minuto vale a que estava ativa. Escolha uma estação acima para ver só ela.
          </p>
        )}
      </Secao>

      <div className="grid grid-cols-1 gap-4 sm:gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
        <Secao
          icone={<AppWindow />}
          titulo="Aplicativos mais usados"
          subtitulo={`${rotuloIntervaloCurto(periodo, fuso)} · % do tempo ativo`}
          acao={<LinkAcao href={`/painel/aplicativos${juntar(recorte, `colaborador=${id}`)}`}>Todos</LinkAcao>}
        >
          <BarrasHorizontais
            vazio="Nenhum aplicativo no período."
            itens={apps.dados.linhas.map((l) => ({
              chave: l.alvo,
              rotulo: l.alvo,
              valor: l.minutos,
              texto: formatarDuracao(l.minutos),
              percentual: totalApps > 0 ? (l.minutos / Math.max(totalApps, minutosApps)) * 100 : null,
              href: `/painel/aplicativos/${encodeURIComponent(l.alvo)}${recorte}`,
            }))}
          />
        </Secao>

        <Secao
          icone={<ListChecks />}
          titulo="Atividade do dia"
          subtitulo={`${dataCurta(janelaDia.inicio, fuso)} · sessões de 2 min ou mais`}
          acao={<LinkAcao href={`/painel/registros?colaborador=${id}&data=${dia}`}>Ver registros</LinkAcao>}
        >
          {sessoes.erro ? (
            <AvisoErro mensagem={sessoes.erro} />
          ) : sessoesVisiveis.length === 0 ? (
            <p className="rounded-lg border border-dashed border-borda py-8 text-center text-sm text-slate-500">
              Nenhuma atividade registrada neste dia{estacaoPedida ? " nesta estação" : ""}.
            </p>
          ) : (
            <TabelaSimples minimo="min-w-[480px]" className="max-h-[320px] overflow-y-auto">
              <thead className="sticky top-0">
                <tr>
                  <th>Horário</th>
                  <th>Aplicativo / site</th>
                  <th>Categoria</th>
                  <th className="!text-right">Duração</th>
                </tr>
              </thead>
              <tbody>
                {sessoesVisiveis.slice(0, 60).map((s) => (
                  <tr key={s.inicio}>
                    <td className="numeros-tabulares whitespace-nowrap text-slate-700">{horaCurta(s.inicio, fuso)}</td>
                    <td className="max-w-[220px] truncate" title={s.alvo}>{s.alvo}</td>
                    <td>{ESTADOS[s.estado] ? <Selo tom="neutro">{ESTADOS[s.estado]}</Selo> : <SeloCategoria tipo={s.tipo} />}</td>
                    <td className="numeros-tabulares text-right">{formatarDuracao(s.minutos)}</td>
                  </tr>
                ))}
              </tbody>
            </TabelaSimples>
          )}
        </Secao>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Secao icone={<History />} titulo="Histórico diário" subtitulo="Escala, expediente e uso por dia do período">
          {diaria.dados.length === 0 ? (
            <p className="text-sm text-slate-500">Sem expediente nem registro no período.</p>
          ) : (
            <TabelaSimples minimo="min-w-[620px]" className="max-h-[360px] overflow-y-auto">
              <thead className="sticky top-0">
                <tr>
                  <th>Data</th>
                  <th>Escala</th>
                  <th className="!text-right">Expediente</th>
                  <th className="!text-right">Produtivo</th>
                  <th className="!text-right">Cobertura</th>
                  <th className="!text-right">Fora da escala</th>
                </tr>
              </thead>
              <tbody>
                {[...diaria.dados].reverse().map((l) => (
                  <tr key={l.dia} className={l.dia === dia ? "bg-acao-suave/60" : "hover:bg-slate-50"}>
                    <td>
                      <Link href={hrefDia(l.dia)} className="numeros-tabulares text-slate-900 hover:text-acao hover:underline">
                        {l.dia.split("-").reverse().join("/")}
                      </Link>
                    </td>
                    <td className="whitespace-nowrap text-slate-600">{l.trabalha ? `${l.escalaInicio}–${l.escalaFim}` : "folga"}</td>
                    <td className="numeros-tabulares text-right">{formatarDuracao(l.minutos.expediente)}</td>
                    <td className="numeros-tabulares text-right">{l.indice === null ? "—" : `${Math.round(l.indice)}%`}</td>
                    <td className="numeros-tabulares text-right">{l.cobertura === null ? "—" : `${Math.round(l.cobertura)}%`}</td>
                    <td className="numeros-tabulares text-right">{formatarDuracao(l.minutos.ativosFora)}</td>
                  </tr>
                ))}
              </tbody>
            </TabelaSimples>
          )}
        </Secao>

        <Secao icone={<Monitor />} titulo="Estações vinculadas" subtitulo="Onde houve registro desta pessoa">
          {estacoes.length === 0 ? (
            <p className="text-sm text-slate-500">Nenhuma estação com registro desta pessoa.</p>
          ) : (
            <ul className="divide-y divide-borda">
              {estacoes.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <Link href={`/painel/dispositivos?estacao=${e.id}`} className="font-medium text-slate-900 hover:text-acao hover:underline">
                      {e.machine_name}
                    </Link>
                    <p className="text-xs text-slate-500">
                      {e.os_user ?? "—"} · agente {e.agent_version ?? "—"} · último envio{" "}
                      {e.last_sync_at ? quando(e.last_sync_at) : "—"}
                    </p>
                  </div>
                  {e.info?.situacao === "RECENTE" ? (
                    <Selo tom="sucesso">Envio recente</Selo>
                  ) : (
                    <Selo tom="atencao">Sem envio recente</Selo>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Secao>
      </div>

      <RitmoPessoa supabase={supabase} periodo={periodo} escopo={escopo} />
    </div>
  );
}

async function RitmoPessoa({ supabase, periodo, escopo }: any) {
  const ritmo = await comFalha(buscarRitmo(supabase, periodo, escopo), []);
  return (
    <>
      {ritmo.erro && <AvisoErro mensagem={ritmo.erro} />}
      <SecaoRitmo dados={ritmo.dados} />
    </>
  );
}
