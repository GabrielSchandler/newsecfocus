import Link from "next/link";
import { redirect } from "next/navigation";
import { AppWindow, BarChart3, CalendarDays, Clock, Globe, Users, UsersRound } from "lucide-react";
import { BarraFiltros } from "@/components/painel/barra-filtros";
import { AvisoErro, CabecalhoPagina, EstadoVazio } from "@/components/painel/cabecalho";
import { BarrasUso } from "@/components/painel/graficos-aplicativos";
import { ClassificarAplicativo } from "@/components/painel/classificar-aplicativo";
import { BarrasHorizontais, GradeIndicadores, Indicador, Secao, SeloCategoria, TabelaSimples } from "@/components/painel/kit";
import { criarClienteServidor } from "@/lib/supabase/server";
import { carregarContexto, podeAdministrar } from "@/lib/sessao";
import { comFalha, primeiroErro } from "@/lib/carregar";
import { lerFiltros, orgEfetiva, paramsDoRecorte, type ParamsPagina } from "@/lib/filtros-url";
import { formatarDuracao, horaCurta } from "@/lib/formato";
import { diaNoFuso, instanteNoFuso } from "@/lib/periodos";
import { janelaAtual } from "@/lib/produtividade";
import { rotuloIntervaloCurto } from "@/lib/visao-geral";
import {
  buscarAplicativosLista,
  buscarAppPessoas,
  buscarAppSerie,
  buscarCategorias,
  buscarColaboradores,
  buscarEquipes,
} from "@/lib/consultas";

export const dynamic = "force-dynamic";

export default async function PaginaAplicativo({
  params,
  searchParams,
}: {
  params: Promise<{ alvo: string }>;
  searchParams: Promise<ParamsPagina>;
}) {
  const { alvo: alvoBruto } = await params;
  const alvo = decodeURIComponent(alvoBruto);
  const busca = await searchParams;

  const supabase = await criarClienteServidor();
  const contexto = await carregarContexto(supabase);
  if (!contexto) redirect("/entrar");

  const { periodo, escopo } = lerFiltros(busca, contexto);
  const recorte = paramsDoRecorte(busca);
  const fuso = contexto.empresa.fuso;
  const org = orgEfetiva(contexto, escopo);
  const admin = podeAdministrar(contexto);
  const janela = janelaAtual(periodo);

  const [equipes, colaboradores, pessoas, serie, candidatos, categorias] = await Promise.all([
    comFalha(buscarEquipes(supabase, org), []),
    comFalha(buscarColaboradores(supabase, null, org), []),
    comFalha(buscarAppPessoas(supabase, periodo, alvo, escopo), []),
    comFalha(buscarAppSerie(supabase, periodo, alvo, escopo), []),
    comFalha(buscarAplicativosLista(supabase, janela, escopo, { busca: alvo, limite: 50 }), { linhas: [], total: 0 }),
    admin ? comFalha(buscarCategorias(supabase, org), []) : Promise.resolve({ dados: [], erro: null }),
  ]);

  const info = candidatos.dados.linhas.find((l) => l.alvo.toLowerCase() === alvo.toLowerCase()) ?? null;
  const ehSite = info?.ehSite ?? (alvo.includes(".") && !alvo.toLowerCase().endsWith(".exe"));
  const total = pessoas.dados.reduce((s, p) => s + p.minutos, 0);
  const erro = primeiroErro(pessoas, serie, candidatos);

  // Série diária completa: dia sem uso aparece como zero, não some do eixo.
  const porHora = periodo.preset === "dia";
  const mapa = new Map(serie.dados.map((p) => [porHora ? horaCurta(p.balde, fuso) : diaNoFuso(new Date(p.balde), fuso), p.minutos]));
  const pontos: { rotulo: string; completo: string; minutos: number }[] = [];
  if (porHora) {
    for (let h = 0; h < 24; h++) {
      const chave = `${String(h).padStart(2, "0")}:00`;
      pontos.push({ rotulo: `${String(h).padStart(2, "0")}h`, completo: `${chave}–${String((h + 1) % 24).padStart(2, "0")}:00`, minutos: mapa.get(chave) ?? 0 });
    }
  } else {
    const inicio = diaNoFuso(new Date(janela.inicio), fuso);
    const fim = diaNoFuso(new Date(new Date(janela.fim).getTime() - 1000), fuso);
    const [a, m, d] = inicio.split("-").map(Number);
    for (let i = 0; i < 400; i++) {
      const dia = diaNoFuso(instanteNoFuso(fuso, a, m, d + i, 12), fuso);
      if (dia > fim) break;
      const [, mm, dd] = dia.split("-");
      pontos.push({ rotulo: `${dd}/${mm}`, completo: dia.split("-").reverse().join("/"), minutos: mapa.get(dia) ?? 0 });
    }
  }
  const diasComUso = porHora ? (total > 0 ? 1 : 0) : pontos.filter((p) => p.minutos > 0).length;

  const porEquipe = new Map<string, { nome: string; id: string | null; minutos: number }>();
  for (const p of pessoas.dados) {
    const chave = p.equipeId ?? "sem";
    const atual = porEquipe.get(chave) ?? { nome: p.equipe ?? "Sem equipe", id: p.equipeId, minutos: 0 };
    atual.minutos += p.minutos;
    porEquipe.set(chave, atual);
  }
  const equipesOrdenadas = [...porEquipe.values()].sort((x, y) => y.minutos - x.minutos);
  const Icone = ehSite ? Globe : AppWindow;

  return (
    <div className="space-y-4 sm:space-y-5">
      <CabecalhoPagina
        trilha={[{ rotulo: "Aplicativos e sites", href: `/painel/aplicativos${recorte}` }, { rotulo: alvo }]}
        marca={
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-acao-suave text-acao">
            <Icone className="h-6 w-6" strokeWidth={1.75} />
          </span>
        }
        titulo={alvo}
        complemento={ehSite ? "Domínio" : "Processo"}
        descricao={
          <span className="flex flex-wrap items-center gap-2">
            <SeloCategoria tipo={info?.tipo ?? null} />
            {info?.tipo && !info.regraPor && <span className="text-sm text-slate-500">pela regra do processo do navegador</span>}
          </span>
        }
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
              campos={["equipe"]}
              travarEquipe={!!contexto.equipeEscopo}
            />
            {admin && (
              <ClassificarAplicativo
                variante="botao"
                rotulo="Alterar classificação"
                alvo={alvo}
                ehSite={ehSite}
                mapeamentoId={info?.mapeamentoId ?? null}
                categoriaId={info?.categoriaId ?? null}
                categorias={categorias.dados}
              />
            )}
          </>
        }
      />

      {erro && <AvisoErro mensagem={erro} />}

      {total === 0 && !erro ? (
        <EstadoVazio
          titulo="Sem uso no recorte"
          descricao="Ninguém do recorte usou este aplicativo ou site no período. Troque o período ou a equipe para ver o histórico."
          acao={<Link href={`/painel/aplicativos${recorte}`} className="text-sm font-medium text-acao hover:underline">Voltar para Aplicativos e sites</Link>}
        />
      ) : (
        <>
          <GradeIndicadores colunas={3}>
            <Indicador compacto icone={<Clock />} rotulo="Tempo ativo" valor={formatarDuracao(total)} rodape="dentro e fora da escala" />
            <Indicador compacto icone={<Users />} rotulo="Pessoas" valor={pessoas.dados.length} rodape="usaram no período" />
            <Indicador compacto icone={<CalendarDays />} rotulo="Dias com uso" valor={diasComUso} rodape={porHora ? "recorte de um dia" : `de ${pontos.length} dias do período`} />
          </GradeIndicadores>

          <div className="grid grid-cols-1 gap-4 sm:gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
            <Secao icone={<BarChart3 />} titulo={porHora ? "Tempo ativo por hora" : "Tempo ativo por dia"} subtitulo={rotuloIntervaloCurto(periodo, fuso)}>
              <BarrasUso pontos={pontos} />
            </Secao>
            <Secao icone={<UsersRound />} titulo="Distribuição por equipe" subtitulo="% do tempo deste item no período">
              <BarrasHorizontais
                itens={equipesOrdenadas.map((e) => ({
                  chave: e.id ?? "sem",
                  rotulo: e.nome,
                  valor: e.minutos,
                  texto: formatarDuracao(e.minutos),
                  percentual: total > 0 ? (e.minutos / total) * 100 : null,
                  href: e.id ? `/painel/equipes/${e.id}${recorte}` : undefined,
                }))}
              />
            </Secao>
          </div>

          <Secao
            icone={<Users />}
            titulo="Quem utiliza"
            subtitulo="Pessoas que usaram no período"
            rodape={info?.tipo ? "Classificação definida pela empresa. Mudanças recalculam o histórico dentro da retenção." : "Sem classificação: este tempo não entra no índice de ninguém."}
          >
            <TabelaSimples minimo="min-w-[560px]">
              <thead>
                <tr>
                  <th>Pessoa</th>
                  <th>Equipe</th>
                  <th className="!text-right">Tempo ativo</th>
                  <th className="!text-right">Dias com uso</th>
                  <th className="!text-right">% do total</th>
                </tr>
              </thead>
              <tbody>
                {pessoas.dados.map((p) => (
                  <tr key={p.colaboradorId} className="hover:bg-slate-50">
                    <td>
                      <Link href={`/painel/pessoas/${p.colaboradorId}${recorte}`} className="font-medium text-slate-900 hover:text-acao hover:underline">
                        {p.colaborador}
                      </Link>
                    </td>
                    <td className="text-slate-700">{p.equipe ?? "Sem equipe"}</td>
                    <td className="numeros-tabulares text-right">{formatarDuracao(p.minutos)}</td>
                    <td className="numeros-tabulares text-right">{p.dias}</td>
                    <td className="numeros-tabulares text-right text-slate-500">{total > 0 ? `${Math.round((p.minutos / total) * 100)}%` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </TabelaSimples>
          </Secao>
        </>
      )}
    </div>
  );
}
