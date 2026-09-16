import { notFound, redirect } from "next/navigation";
import { Activity, Clock, Database, LayoutGrid, UserRound, Users, UsersRound } from "lucide-react";
import { AbasPainel, type AbaPainel } from "@/components/painel/abas-painel";
import { BarraFiltros } from "@/components/painel/barra-filtros";
import { BotaoExportar } from "@/components/painel/botao-exportar";
import { AvisoErro, CabecalhoPagina } from "@/components/painel/cabecalho";
import { GraficoEvolucaoIndice } from "@/components/painel/grafico-evolucao-indice";
import { PontosAtencao } from "@/components/painel/pontos-atencao";
import { BarraExpediente, DEFINICOES, LegendaExpediente } from "@/components/painel/resumo-expediente";
import { TabelaMembros } from "@/components/painel/tabela-membros";
import { ListaAplicativos } from "@/components/painel/lista-aplicativos";
import { TabelaJornada } from "@/components/painel/jornada";
import { SecaoDispersao } from "@/components/painel/secao-dispersao";
import { SecaoRitmo } from "@/components/painel/secao-ritmo";
import { GradeIndicadores, Indicador, LinkAcao, Secao, Variacao } from "@/components/painel/kit";
import { criarClienteServidor } from "@/lib/supabase/server";
import { carregarContexto, podeAdministrar } from "@/lib/sessao";
import { comFalha, primeiroErro } from "@/lib/carregar";
import { lerFiltros, paramsDoRecorte, type ParamsPagina } from "@/lib/filtros-url";
import { formatarDuracao, formatarPorcentagemEnxuta } from "@/lib/formato";
import {
  agregarProdutividade,
  compararIndice,
  janelaAtual,
  janelaComparativo,
} from "@/lib/produtividade";
import {
  foraDaEscala,
  janelaEvolucao,
  juntar,
  montarEvolucao,
  montarMembros,
  pontosDeAtencao,
  rotuloIntervaloCurto,
} from "@/lib/visao-geral";
import {
  buscarAplicativosLista,
  buscarCategorias,
  buscarDispersao,
  buscarEstacoes,
  buscarJornadaPessoas,
  buscarProdutividade,
  buscarRitmo,
  buscarSerieProdutividade,
} from "@/lib/consultas";
import type { Escopo } from "@/lib/tipos";

export const dynamic = "force-dynamic";

const ABAS: AbaPainel[] = [
  { chave: "resumo", rotulo: "Resumo" },
  { chave: "pessoas", rotulo: "Pessoas" },
  { chave: "aplicativos", rotulo: "Aplicativos" },
  { chave: "jornada", rotulo: "Jornada" },
  { chave: "ritmo", rotulo: "Ritmo e alternância" },
];

/** Abas antigas que viraram outras. */
const EQUIVALENTES: Record<string, string> = { presenca: "jornada", horas: "jornada" };

const POR_PAGINA = 15;

export default async function PaginaDetalheEquipe({
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

  // O RLS devolve vazio para equipe de outra empresa (ou de outra equipe, para
  // o líder): a tela responde "não encontrada" sem vazar que ela existe.
  const { data: equipe } = await supabase
    .from("teams")
    .select("id, nome, descricao, cor")
    .eq("id", id)
    .maybeSingle();

  if (!equipe) notFound();

  const { periodo, escopo: recorteAtual } = lerFiltros(busca, contexto);
  const fuso = contexto.empresa.fuso;
  const recorte = paramsDoRecorte(busca);
  const admin = podeAdministrar(contexto);

  const escopo: Escopo = { orgId: recorteAtual.orgId, equipeId: id, colaboradorId: null, dispositivoId: null };

  const abaBruta = Array.isArray(busca.visao) ? busca.visao[0] : busca.visao;
  const escolhida = abaBruta ? (EQUIVALENTES[abaBruta] ?? abaBruta) : undefined;
  const aba = ABAS.some((a) => a.chave === escolhida) ? escolhida! : "resumo";

  const janela = janelaAtual(periodo);
  const comparativo = await comFalha(janelaComparativo(supabase, periodo, fuso, escopo.orgId), null);

  const [produtividade, anterior] = await Promise.all([
    comFalha(buscarProdutividade(supabase, janela, escopo), []),
    comparativo.dados
      ? comFalha(buscarProdutividade(supabase, comparativo.dados, escopo), [])
      : Promise.resolve({ dados: [], erro: null }),
  ]);

  const resumo = agregarProdutividade(produtividade.dados);
  const resumoAnterior = comparativo.dados && !anterior.erro ? agregarProdutividade(anterior.dados) : null;
  const membros = montarMembros(produtividade.dados, resumoAnterior ? anterior.dados : null);
  const fora = foraDaEscala(produtividade.dados);
  const baseAba = `/painel/equipes/${id}${recorte}`;

  return (
    <div className="space-y-4 sm:space-y-5">
      <CabecalhoPagina
        trilha={[{ rotulo: "Equipes", href: `/painel/equipes${recorte}` }, { rotulo: equipe.nome }]}
        marca={
          <span
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-acao-suave text-acao"
            style={equipe.cor ? { color: equipe.cor } : undefined}
          >
            <UsersRound className="h-6 w-6" strokeWidth={1.75} />
          </span>
        }
        titulo={equipe.nome}
        complemento={`${membros.length} ${membros.length === 1 ? "pessoa" : "pessoas"}`}
        descricao={equipe.descricao ?? "Acompanhe o desempenho da equipe e o detalhamento por pessoa."}
        acoes={
          <>
            <BarraFiltros
              variante="topo"
              rotuloPeriodo={rotuloIntervaloCurto(periodo, fuso)}
              periodo={periodo}
              escopo={escopo}
              fuso={fuso}
              campos={[]}
            />
            <BotaoExportar periodo={periodo} escopo={escopo} tipos={["colaboradores", "diario", "aplicativos"]} destaque />
          </>
        }
      />

      {produtividade.erro && <AvisoErro mensagem={produtividade.erro} />}

      <GradeIndicadores>
        <Indicador
          icone={<Clock />}
          rotulo="Tempo produtivo / expediente"
          definicao={DEFINICOES.indice}
          valor={resumo.indiceMedio === null ? "—" : formatarPorcentagemEnxuta(resumo.indiceMedio)}
          rodape={<Variacao valor={compararIndice(resumo, resumoAnterior)} rotulo={comparativo.dados?.rotulo ?? null} />}
        />
        <Indicador
          icone={<Activity />}
          rotulo="Tempo ativo"
          definicao={DEFINICOES.ativo}
          valor={formatarDuracao(resumo.minutos.ativos)}
          rodape="Produtivo + neutro + improdutivo + sem classificação"
        />
        <Indicador
          icone={<Database />}
          rotulo="Cobertura de dados"
          definicao={DEFINICOES.cobertura}
          valor={resumo.cobertura === null ? "—" : `${Math.round(resumo.cobertura)}%`}
          rodape={
            resumo.cobertura === null
              ? "Sem expediente previsto"
              : `${formatarDuracao(Math.min(resumo.minutos.registrados, resumo.minutos.expediente))} de ${formatarDuracao(resumo.minutos.expediente)} previstas`
          }
        />
        <Indicador
          icone={<UserRound />}
          rotulo="Fora da escala"
          definicao={DEFINICOES.fora}
          valor={formatarDuracao(fora.minutos)}
          rodape={`${fora.pessoas} ${fora.pessoas === 1 ? "pessoa" : "pessoas"} · estimativa por 15 min`}
        />
      </GradeIndicadores>

      <AbasPainel abas={ABAS} ativa={aba} variante="sublinhado" preservar={{ apagar: ["pagina"] }} />

      {aba === "resumo" && (
        <ResumoEquipe
          supabase={supabase}
          periodo={periodo}
          escopo={escopo}
          fuso={fuso}
          produtividade={produtividade.dados}
          membros={membros}
          admin={admin}
          recorte={recorte}
          equipeId={id}
        />
      )}

      {aba === "pessoas" && (
        <div className="space-y-4 sm:space-y-5">
          <Secao icone={<Users />} titulo="Membros da equipe" subtitulo="Produtivo e cobertura de cada pessoa no período">
            <TabelaMembros linhas={membros} recorte={recorte} />
          </Secao>
          <Secao
            icone={<Clock />}
            titulo="Como cada pessoa usou o expediente"
            subtitulo="Horas de cada pessoa · % sobre o expediente dela"
          >
            <ul className="space-y-3">
              {produtividade.dados
                .filter((l) => l.minutos.expediente > 0)
                .map((l) => (
                  <li key={l.colaboradorId} className="grid grid-cols-1 gap-1.5 sm:grid-cols-[11rem_minmax(0,1fr)] sm:items-center sm:gap-4">
                    <span className="truncate text-sm text-slate-800">{l.colaborador}</span>
                    <BarraExpediente minutos={l.minutos} rotulos className="h-6" />
                  </li>
                ))}
            </ul>
            <LegendaExpediente className="mt-5 justify-center" />
          </Secao>
        </div>
      )}

      {aba === "aplicativos" && (
        <AplicativosEquipe
          supabase={supabase}
          janela={janela}
          escopo={escopo}
          org={contexto.empresa.id}
          admin={admin}
          recorte={recorte}
          pagina={Number(busca.pagina) || 1}
          baseAba={baseAba}
        />
      )}

      {aba === "jornada" && <JornadaEquipe supabase={supabase} janela={janela} escopo={escopo} recorte={recorte} equipeId={id} />}

      {aba === "ritmo" && <RitmoEquipe supabase={supabase} periodo={periodo} escopo={escopo} />}
    </div>
  );
}

async function ResumoEquipe({ supabase, periodo, escopo, fuso, produtividade, membros, admin, recorte, equipeId }: any) {
  const evolucao = janelaEvolucao(periodo, fuso);
  const [atual, anterior, estacoes] = await Promise.all([
    comFalha(buscarSerieProdutividade(supabase, evolucao.atual, evolucao.balde, escopo), []),
    evolucao.anterior
      ? comFalha(buscarSerieProdutividade(supabase, evolucao.anterior, evolucao.balde, escopo), [])
      : Promise.resolve({ dados: [], erro: null }),
    comFalha(buscarEstacoes(supabase, escopo.orgId), []),
  ]);

  const estacoesDaEquipe = (estacoes.dados as Awaited<ReturnType<typeof buscarEstacoes>>).filter(
    (e) => e.equipeId === equipeId,
  );
  const pontos = pontosDeAtencao({
    estacoes: estacoesDaEquipe,
    produtividade,
    admin,
    recorte,
  });

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <GraficoEvolucaoIndice
          pontos={montarEvolucao(evolucao, atual.dados, anterior.dados, fuso)}
          descricao={evolucao.descricao}
          temAnterior={!!evolucao.anterior}
          erro={primeiroErro(atual, anterior)}
        />
        <PontosAtencao pontos={pontos} />
      </div>
      <Secao
        icone={<Users />}
        titulo="Membros da equipe"
        subtitulo="Produtivo é o índice de cada pessoa; variação só com cobertura suficiente"
        acao={<LinkAcao href={`/painel/equipes/${equipeId}${juntar(recorte, "visao=pessoas")}`}>Detalhar</LinkAcao>}
      >
        <TabelaMembros linhas={membros} recorte={recorte} compacta />
      </Secao>
    </div>
  );
}

async function AplicativosEquipe({ supabase, janela, escopo, org, admin, recorte, pagina, baseAba }: any) {
  const [lista, categorias] = await Promise.all([
    comFalha(buscarAplicativosLista(supabase, janela, escopo, { pagina, limite: POR_PAGINA }), { linhas: [], total: 0 }),
    admin ? comFalha(buscarCategorias(supabase, org), []) : Promise.resolve({ dados: [], erro: null }),
  ]);
  return (
    <Secao
      icone={<LayoutGrid />}
      titulo="Aplicativos e sites da equipe"
      subtitulo="Tempo ativo no período, pela categoria efetiva"
      acao={<LinkAcao href={`/painel/aplicativos${juntar(recorte, `equipe=${escopo.equipeId}`)}`}>Abrir em Aplicativos</LinkAcao>}
    >
      {lista.erro && <AvisoErro mensagem={lista.erro} className="mb-4" />}
      <ListaAplicativos
        linhas={lista.dados.linhas}
        total={lista.dados.total}
        pagina={pagina}
        porPagina={POR_PAGINA}
        hrefPagina={(p: number) => `${baseAba}${baseAba.includes("?") ? "&" : "?"}visao=aplicativos&pagina=${p}`}
        recorte={recorte}
        categorias={categorias.dados}
        admin={admin}
      />
    </Secao>
  );
}

async function JornadaEquipe({ supabase, janela, escopo, recorte, equipeId }: any) {
  const jornada = await comFalha(buscarJornadaPessoas(supabase, janela, escopo), []);
  return (
    <Secao
      icone={<Clock />}
      titulo="Jornada da equipe"
      subtitulo="Escala prevista e telemetria recebida no período"
      acao={<LinkAcao href={`/painel/jornada${juntar(recorte, `equipe=${equipeId}`)}`}>Comparar dia a dia</LinkAcao>}
    >
      {jornada.erro && <AvisoErro mensagem={jornada.erro} className="mb-4" />}
      <TabelaJornada linhas={jornada.dados} recorte={recorte} />
    </Secao>
  );
}

async function RitmoEquipe({ supabase, periodo, escopo }: any) {
  const [ritmo, dispersao] = await Promise.all([
    comFalha(buscarRitmo(supabase, periodo, escopo), []),
    comFalha(buscarDispersao(supabase, periodo, escopo), []),
  ]);
  return (
    <div className="space-y-4 sm:space-y-5">
      {primeiroErro(ritmo, dispersao) && <AvisoErro mensagem={primeiroErro(ritmo, dispersao)!} />}
      <SecaoRitmo dados={ritmo.dados} />
      <SecaoDispersao linhas={dispersao.dados} />
    </div>
  );
}
