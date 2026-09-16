import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarClock, CalendarDays, ChevronLeft, ChevronRight, Clock, Database, GanttChart, UserRound, Users } from "lucide-react";
import { BarraFiltros } from "@/components/painel/barra-filtros";
import { BotaoExportar } from "@/components/painel/botao-exportar";
import { AvisoErro, CabecalhoPagina } from "@/components/painel/cabecalho";
import { ComparativoJornada, TabelaJornada } from "@/components/painel/jornada";
import { DEFINICOES } from "@/components/painel/resumo-expediente";
import { Aviso, GradeIndicadores, Indicador, LinkAcao, Secao } from "@/components/painel/kit";
import { criarClienteServidor } from "@/lib/supabase/server";
import { carregarContexto, podeAdministrar } from "@/lib/sessao";
import { comFalha, primeiroErro } from "@/lib/carregar";
import { lerFiltros, orgEfetiva, paramsDoRecorte, type ParamsPagina } from "@/lib/filtros-url";
import { dataCurta, formatarDuracao } from "@/lib/formato";
import { diaNoFuso, instanteNoFuso } from "@/lib/periodos";
import { janelaAtual } from "@/lib/produtividade";
import { juntar, rotuloIntervaloCurto } from "@/lib/visao-geral";
import { buscarColaboradores, buscarEquipes, buscarJornadaDia, buscarJornadaPessoas } from "@/lib/consultas";

export const dynamic = "force-dynamic";

const texto = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/**
 * Jornada: a escala prevista contra a telemetria recebida. Aqui mora a leitura
 * de "fora da escala" — e o cuidado de não transformá-la em ponto, falta ou
 * banco de horas, porque o agente registra uso da estação, não presença.
 */
export default async function PaginaJornada({
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
  const recorte = paramsDoRecorte(params);
  const admin = podeAdministrar(contexto);
  const janela = janelaAtual(periodo);

  const hoje = diaNoFuso(new Date(), fuso);
  const ultimoDoPeriodo = diaNoFuso(new Date(new Date(periodo.fim).getTime() - 1000), fuso);
  const diaPedido = texto(params.dia);
  const dia = diaPedido && /^\d{4}-\d{2}-\d{2}$/.test(diaPedido) ? diaPedido : ultimoDoPeriodo < hoje ? ultimoDoPeriodo : hoje;
  const [a, m, d] = dia.split("-").map(Number);
  const deslocar = (n: number) => diaNoFuso(instanteNoFuso(fuso, a, m, d + n, 12), fuso);
  const hrefDia = (novo: string) => `/painel/jornada${juntar(recorte, `dia=${novo}`)}`;

  const [equipes, colaboradores, pessoas, doDia] = await Promise.all([
    comFalha(buscarEquipes(supabase, org), []),
    comFalha(buscarColaboradores(supabase, null, org), []),
    comFalha(buscarJornadaPessoas(supabase, janela, escopo), []),
    comFalha(buscarJornadaDia(supabase, dia, escopo), []),
  ]);

  const soma = (f: (l: (typeof pessoas.dados)[number]) => number) => pessoas.dados.reduce((s, l) => s + f(l), 0);
  const expediente = soma((l) => l.minutosExpediente);
  const registrados = soma((l) => Math.min(l.minutosRegistrados, l.minutosExpediente));
  const fora = soma((l) => l.minutosAtivosFora);
  const comExpediente = pessoas.dados.filter((l) => l.minutosExpediente > 0).length;
  const erro = primeiroErro(pessoas, doDia);

  return (
    <div className="space-y-4 sm:space-y-5">
      <CabecalhoPagina
        titulo="Jornada"
        descricao="Acompanhe o expediente previsto e a atividade registrada."
        acoes={
          <>
            <BarraFiltros
              variante="topo"
              rotuloPeriodo={rotuloIntervaloCurto(periodo, fuso)}
              periodo={periodo}
              escopo={escopo}
              fuso={fuso}
              equipes={equipes.dados}
              colaboradores={colaboradores.dados}
              campos={["equipe", "colaborador"]}
              travarEquipe={!!contexto.equipeEscopo}
            />
            <BotaoExportar periodo={periodo} escopo={escopo} tipos={["diario", "colaboradores"]} />
          </>
        }
      />

      {erro && <AvisoErro mensagem={erro} />}

      <GradeIndicadores>
        <Indicador compacto icone={<CalendarClock />} rotulo="Expediente previsto" valor={formatarDuracao(expediente)} rodape="escala efetiva até agora" />
        <Indicador
          compacto
          icone={<Database />}
          rotulo="Com registros"
          definicao={DEFINICOES.cobertura}
          valor={formatarDuracao(registrados)}
          rodape={expediente > 0 ? `${Math.round((registrados / expediente) * 100)}% do previsto` : "—"}
        />
        <Indicador compacto icone={<UserRound />} rotulo="Fora da escala" definicao={DEFINICOES.fora} valor={formatarDuracao(fora)} rodape="estimativa por 15 min" />
        <Indicador compacto icone={<Users />} rotulo="Pessoas" valor={comExpediente} rodape="com expediente no período" />
      </GradeIndicadores>

      <Aviso tom="info">
        Atividade fora da escala não é marcação de ponto: serve para dar contexto ao uso da estação.
        Primeiro e último registro também não confirmam chegada nem saída, e ausência de registro não é falta.
      </Aviso>

      <Secao
        icone={<GanttChart />}
        titulo="Comparativo de jornada"
        subtitulo={`${dataCurta(instanteNoFuso(fuso, a, m, d, 12).toISOString(), fuso)} · escala prevista e blocos de 15 min com registro`}
        acao={
          <div className="flex items-center gap-1 text-sm text-slate-700">
            <Link href={hrefDia(deslocar(-1))} aria-label="Dia anterior" className="rounded-md p-1.5 hover:bg-slate-100">
              <ChevronLeft className="h-4 w-4" />
            </Link>
            <span className="flex items-center gap-1.5 px-1">
              <CalendarDays className="h-4 w-4 text-slate-500" />
              {dia.split("-").reverse().join("/")}
            </span>
            {dia < hoje ? (
              <Link href={hrefDia(deslocar(1))} aria-label="Próximo dia" className="rounded-md p-1.5 hover:bg-slate-100">
                <ChevronRight className="h-4 w-4" />
              </Link>
            ) : (
              <span className="p-1.5 text-slate-300">
                <ChevronRight className="h-4 w-4" />
              </span>
            )}
          </div>
        }
        rodape={
          admin ? (
            <LinkAcao href="/painel/administracao?aba=escalas" className="text-xs">
              Configurar escalas
            </LinkAcao>
          ) : undefined
        }
      >
        <ComparativoJornada dias={doDia.dados} fuso={fuso} recorte={recorte} />
      </Secao>

      <Secao icone={<Clock />} titulo="Resumo de jornada" subtitulo={`${rotuloIntervaloCurto(periodo, fuso)} · por pessoa`}>
        <TabelaJornada linhas={pessoas.dados} recorte={recorte} />
      </Secao>
    </div>
  );
}
