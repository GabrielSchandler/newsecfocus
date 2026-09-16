import Link from "next/link";
import { redirect } from "next/navigation";
import { Database, LayoutPanelTop, Timer, Users, UsersRound } from "lucide-react";
import { BarraFiltros } from "@/components/painel/barra-filtros";
import { BotaoExportar } from "@/components/painel/botao-exportar";
import { AvisoErro, CabecalhoPagina, EstadoVazio } from "@/components/painel/cabecalho";
import { BarraExpediente, DEFINICOES, LegendaExpediente } from "@/components/painel/resumo-expediente";
import { TabelaDesempenhoEquipes } from "@/components/painel/tabela-desempenho-equipes";
import { Aviso, GradeIndicadores, Indicador, Secao, Variacao } from "@/components/painel/kit";
import { criarClienteServidor } from "@/lib/supabase/server";
import { carregarContexto } from "@/lib/sessao";
import { comFalha, primeiroErro } from "@/lib/carregar";
import { lerFiltros, orgEfetiva, paramsDoRecorte, type ParamsPagina } from "@/lib/filtros-url";
import { buscarEquipes, buscarEstacoes, buscarPessoasContagem, buscarProdutividade } from "@/lib/consultas";
import { formatarDuracao, formatarPorcentagemEnxuta } from "@/lib/formato";
import { REGRAS } from "@/lib/regras";
import {
  agregarProdutividade,
  agruparPorEquipe,
  compararIndice,
  janelaAtual,
  janelaComparativo,
} from "@/lib/produtividade";
import { compararEquipes, rotuloIntervaloCurto } from "@/lib/visao-geral";

export const dynamic = "force-dynamic";

export default async function PaginaEquipes({
  searchParams,
}: {
  searchParams: Promise<ParamsPagina>;
}) {
  const params = await searchParams;
  const supabase = await criarClienteServidor();
  const contexto = await carregarContexto(supabase);

  if (!contexto) redirect("/entrar");

  const { periodo, escopo } = lerFiltros(params, contexto);
  const recorte = paramsDoRecorte(params);
  const fuso = contexto.empresa.fuso;
  const org = orgEfetiva(contexto, escopo);

  const janela = janelaAtual(periodo);
  const comparativo = await comFalha(janelaComparativo(supabase, periodo, fuso, org), null);

  const [equipes, produtividade, anterior, estacoes, pessoas] = await Promise.all([
    comFalha(buscarEquipes(supabase, org), []),
    comFalha(buscarProdutividade(supabase, janela, escopo), []),
    comparativo.dados
      ? comFalha(buscarProdutividade(supabase, comparativo.dados, escopo), [])
      : Promise.resolve({ dados: [], erro: null }),
    comFalha(buscarEstacoes(supabase, escopo.orgId), []),
    comFalha(buscarPessoasContagem(supabase, janela, escopo), null),
  ]);

  const resumo = agregarProdutividade(produtividade.dados);
  const resumoAnterior = comparativo.dados && !anterior.erro ? agregarProdutividade(anterior.dados) : null;
  const linhas = compararEquipes(produtividade.dados, resumoAnterior ? anterior.dados : null);
  const grupos = agruparPorEquipe(produtividade.dados).filter((g) => g.resumo.minutos.expediente > 0);
  const ativas = equipes.dados.filter((e) => e.ativa);

  // Dados incompletos por equipe: estação sem enviar no expediente ou cobertura baixa.
  const atrasadasPorEquipe = new Map<string, string[]>();
  for (const e of estacoes.dados) {
    if (e.situacao === "RECENTE" || !e.emExpedienteAgora || !e.equipe) continue;
    atrasadasPorEquipe.set(e.equipe, [...(atrasadasPorEquipe.get(e.equipe) ?? []), e.maquina]);
  }
  const incompletas = linhas.filter(
    (l) => l.equipeId && ((l.cobertura ?? 100) < REGRAS.coberturaBaixa || atrasadasPorEquipe.has(l.equipe)),
  );

  const erro = primeiroErro(produtividade, equipes);

  return (
    <div className="space-y-4 sm:space-y-5">
      <CabecalhoPagina
        titulo="Equipes"
        descricao="Acompanhe o desempenho das equipes e compare indicadores."
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
            <BotaoExportar periodo={periodo} escopo={escopo} tipos={["equipes"]} destaque />
          </>
        }
      />

      {erro && <AvisoErro mensagem={erro} />}

      <GradeIndicadores>
        <Indicador
          icone={<UsersRound />}
          rotulo="Total de equipes"
          valor={ativas.length}
          rodape={`${grupos.filter((g) => g.equipeId).length} com expediente no período`}
        />
        <Indicador
          icone={<Users />}
          rotulo="Total de pessoas"
          valor={pessoas.dados?.cadastradas ?? "—"}
          rodape={
            pessoas.dados && pessoas.dados.semEquipe > 0
              ? `${pessoas.dados.semEquipe} sem equipe`
              : "pessoas ativas na operação"
          }
        />
        <Indicador
          icone={<Timer />}
          rotulo="Tempo produtivo / expediente"
          definicao={DEFINICOES.indice}
          valor={resumo.indiceMedio === null ? "—" : formatarPorcentagemEnxuta(resumo.indiceMedio)}
          rodape={
            <Variacao
              valor={compararIndice(resumo, resumoAnterior)}
              rotulo={comparativo.dados?.rotulo ?? null}
              semBase="média por pessoa · sem base de comparação"
            />
          }
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
      </GradeIndicadores>

      {linhas.length === 0 && !erro ? (
        <EstadoVazio
          titulo="Nenhuma equipe com expediente no período"
          descricao="As equipes aparecem aqui quando alguém delas tem expediente previsto no recorte. Equipes e escalas são configuradas em Administração."
          acao={
            <Link href="/painel/administracao?aba=equipes" className="text-sm font-medium text-acao hover:underline">
              Abrir administração de equipes
            </Link>
          }
        />
      ) : (
        <>
          <Secao
            icone={<LayoutPanelTop />}
            titulo="Desempenho das equipes"
            subtitulo="Produtivo é média por pessoa; cobertura, tempo ativo e fora da escala são somas da equipe"
            rodape="Tempo produtivo indica uso de aplicativos classificados como produtivos; não mede a qualidade das entregas. A variação só aparece com cobertura suficiente nos dois períodos."
          >
            <TabelaDesempenhoEquipes linhas={linhas} recorte={recorte} temAnterior={!!resumoAnterior} />
          </Secao>

          <Secao
            icone={<Timer />}
            titulo="Composição do expediente por equipe"
            subtitulo="Horas somadas de cada equipe no período · % sobre o expediente da própria equipe"
          >
            <ul className="space-y-3">
              {grupos.map((g) => (
                <li
                  key={g.equipeId ?? "sem"}
                  className="grid grid-cols-1 gap-1.5 sm:grid-cols-[10rem_minmax(0,1fr)] sm:items-center sm:gap-4"
                >
                  {g.equipeId ? (
                    <Link
                      href={`/painel/equipes/${g.equipeId}${recorte}`}
                      className="truncate text-sm text-slate-800 hover:text-acao hover:underline"
                    >
                      {g.equipe}
                    </Link>
                  ) : (
                    <span className="truncate text-sm text-slate-500">{g.equipe}</span>
                  )}
                  <BarraExpediente minutos={g.resumo.minutos} rotulos className="h-7" />
                </li>
              ))}
            </ul>
            <LegendaExpediente className="mt-5 justify-center" />
          </Secao>

          {incompletas.length > 0 && (
            <Aviso titulo="Dados incompletos" acao={{ rotulo: "Ver dispositivos", href: "/painel/dispositivos" }}>
              {incompletas
                .map((l) => {
                  const atrasadas = atrasadasPorEquipe.get(l.equipe)?.length ?? 0;
                  return atrasadas > 0
                    ? `${l.equipe}: ${atrasadas} ${atrasadas === 1 ? "estação" : "estações"} sem enviar dados no expediente`
                    : `${l.equipe}: cobertura de ${Math.round(l.cobertura ?? 0)}% no período`;
                })
                .join(" · ")}
              . Revise os dispositivos antes de comparar essas equipes.
            </Aviso>
          )}
        </>
      )}
    </div>
  );
}
