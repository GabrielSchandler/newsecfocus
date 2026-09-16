import { UserSquare2 } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { BarraFiltros } from "@/components/painel/barra-filtros";
import { BotaoExportar } from "@/components/painel/botao-exportar";
import { AvisoErro, CabecalhoPagina, EstadoVazio } from "@/components/painel/cabecalho";
import { AbasPainel, type AbaPainel } from "@/components/painel/abas-painel";
import { ResumoExpediente } from "@/components/painel/resumo-expediente";
import { GraficoArea } from "@/components/painel/grafico-area";
import { GraficoDonut } from "@/components/painel/grafico-donut";
import { LinhaDoTempoDia } from "@/components/painel/linha-do-tempo-dia";
import { SecaoAplicativos } from "@/components/painel/secao-aplicativos";
import { SecaoHorasExtras } from "@/components/painel/secao-horas-extras";
import { SecaoPresenca } from "@/components/painel/secao-presenca";
import { SecaoRitmo } from "@/components/painel/secao-ritmo";
import { DiarioEstacao } from "@/components/painel/diario-estacao";
import { TabelaDispositivos } from "@/components/painel/tabela-dispositivos";
import { TabelaDias, type LinhaDia } from "@/components/painel/tabela-dias";
import { Badge } from "@/components/ui/badge";
import { criarClienteServidor } from "@/lib/supabase/server";
import { carregarContexto, podeAdministrar } from "@/lib/sessao";
import { comFalha, primeiroErro } from "@/lib/carregar";
import { lerFiltros, paramsDoRecorte, type ParamsPagina } from "@/lib/filtros-url";
import {
  agregarProdutividade,
  janelaAtual,
  janelaComparativo,
} from "@/lib/produtividade";
import {
  buscarDiarioEstacao,
  buscarDistribuicao,
  buscarDominios,
  buscarEstacoesColaborador,
  buscarHorasExtras,
  buscarProdutividade,
  buscarLinhaDoTempo,
  buscarPresenca,
  buscarRelatorioDiario,
  buscarRitmo,
  buscarSerie,
} from "@/lib/consultas";
import { formatarHorasCurto } from "@/lib/formato";
import type { Escopo } from "@/lib/tipos";

export const dynamic = "force-dynamic";

const ABAS: AbaPainel[] = [
  { chave: "resumo", rotulo: "Resumo" },
  { chave: "aplicativos", rotulo: "Aplicativos" },
  { chave: "ritmo", rotulo: "Ritmo" },
  { chave: "horas", rotulo: "Horas extras" },
  { chave: "estacao", rotulo: "Estação" },
];


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

  const { data: pessoa } = await supabase
    .from("employees")
    .select("id, nome, os_user, cargo, jornada_minutos_dia, teams(id, nome)")
    .eq("id", id)
    .maybeSingle();

  if (!pessoa) notFound();

  const equipeBruta = (pessoa as any).teams;
  const equipe = Array.isArray(equipeBruta) ? equipeBruta[0] : equipeBruta;

  const { periodo, escopo: recorteAtual } = lerFiltros(busca, contexto);
  const fuso = contexto.empresa.fuso;
  const recorte = paramsDoRecorte(busca);
  const admin = podeAdministrar(contexto);

  const escopo: Escopo = {
    orgId: recorteAtual.orgId,
    equipeId: null,
    colaboradorId: id,
    dispositivoId: null,
  };

  const abaBruta = busca.visao;
  const escolhida = Array.isArray(abaBruta) ? abaBruta[0] : abaBruta;
  const aba = ABAS.some((a) => a.chave === escolhida) ? escolhida! : "resumo";

  // Resumo executivo (KPIs) sempre no topo.
  // Mesma régua da Visão geral: janela atual cortada no relógio e comparação
  // com o período anterior no mesmo ponto.
  const janela = janelaAtual(periodo);
  const comparativo = await comFalha(
    janelaComparativo(supabase, periodo, fuso, escopo.orgId),
    null,
  );

  const [produtividade, anterior] = await Promise.all([
    comFalha(buscarProdutividade(supabase, janela, escopo), []),
    comparativo.dados
      ? comFalha(buscarProdutividade(supabase, comparativo.dados, escopo), [])
      : Promise.resolve({ dados: [], erro: null }),
  ]);

  const resumo = agregarProdutividade(produtividade.dados);
  const resumoAnterior = comparativo.dados ? agregarProdutividade(anterior.dados) : null;

  return (
    <div className="space-y-5">
      <CabecalhoPagina
        titulo={pessoa.nome ?? pessoa.os_user}
        descricao={[pessoa.cargo, equipe?.nome, `usuário ${pessoa.os_user}`]
          .filter(Boolean)
          .join(" · ")}
        icone={<UserSquare2 className="h-5 w-5 text-cyan-400" />}
        voltarPara={{ href: `/painel/pessoas${recorte}`, rotulo: "Pessoas" }}
        acoes={
          <BotaoExportar periodo={periodo} escopo={escopo} tipos={["diario", "aplicativos"]} />
        }
      />

      <BarraFiltros periodo={periodo} escopo={escopo} fuso={fuso} campos={[]} />

      {produtividade.erro && <AvisoErro mensagem={produtividade.erro} />}

      <ResumoExpediente
        resumo={resumo}
        anterior={resumoAnterior}
        rotuloComparacao={comparativo.dados?.rotulo ?? null}
      />

      <AbasPainel abas={ABAS} ativa={aba} />

      {aba === "resumo" && (
        <ResumoPessoa
          supabase={supabase}
          periodo={periodo}
          escopo={escopo}
          fuso={fuso}
          pessoa={pessoa}
          jornadaPadrao={contexto.empresa.jornadaPadraoMinutos}
        />
      )}

      {aba === "aplicativos" && (
        <AplicativosPessoa supabase={supabase} periodo={periodo} escopo={escopo} admin={admin} recorte={recorte} />
      )}

      {aba === "ritmo" && <RitmoPessoa supabase={supabase} periodo={periodo} escopo={escopo} />}

      {aba === "horas" && (
        <HorasPessoa supabase={supabase} periodo={periodo} escopo={escopo} admin={admin} />
      )}

      {aba === "estacao" && (
        <EstacaoPessoa supabase={supabase} colaboradorId={id} orgId={escopo.orgId} />
      )}
    </div>
  );
}


async function ResumoPessoa({ supabase, periodo, escopo, fuso, pessoa, jornadaPadrao }: any) {
  const [linhaTempo, serie, distribuicao, presenca, diario] = await Promise.all([
    comFalha(buscarLinhaDoTempo(supabase, periodo, escopo.colaboradorId), []),
    comFalha(buscarSerie(supabase, periodo, escopo, fuso), []),
    comFalha(buscarDistribuicao(supabase, periodo, escopo, 10), []),
    comFalha(buscarPresenca(supabase, periodo, escopo), []),
    comFalha(buscarRelatorioDiario(supabase, periodo, escopo) as Promise<LinhaDia[]>, []),
  ]);

  const erro = primeiroErro(linhaTempo, serie, distribuicao, presenca, diario);

  return (
    <div className="space-y-5">
      {erro && <AvisoErro mensagem={erro} />}

      <LinhaDoTempoDia segmentos={linhaTempo.dados} fuso={fuso} />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-5">
        <div className="min-w-0 xl:col-span-3">
          <GraficoArea
            dados={serie.dados}
            bucket={periodo.bucket}
            fuso={fuso}
            periodoRotulo={periodo.rotulo}
            titulo="Atividade no período"
          />
        </div>
        <div className="min-w-0 xl:col-span-2">
          <GraficoDonut dados={distribuicao.dados} titulo="Ferramentas mais usadas" />
        </div>
      </div>

      {presenca.dados.length > 0 && <SecaoPresenca linhas={presenca.dados} mostrarPessoa={false} />}

      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-medium text-slate-200">Dia a dia</h3>
          <Badge variante="neutro">
            jornada de {formatarHorasCurto(pessoa.jornada_minutos_dia ?? jornadaPadrao)}/dia
            {pessoa.jornada_minutos_dia === null && " (padrão da empresa)"}
          </Badge>
        </div>
        <TabelaDias linhas={diario.dados} fuso={fuso} />
      </section>
    </div>
  );
}

async function AplicativosPessoa({ supabase, periodo, escopo, admin, recorte }: any) {
  const [distribuicao, dominios] = await Promise.all([
    comFalha(buscarDistribuicao(supabase, periodo, escopo, 60), []),
    comFalha(buscarDominios(supabase, periodo, escopo, 20), []),
  ]);
  return (
    <>
      {distribuicao.erro && <AvisoErro mensagem={distribuicao.erro} />}
      <SecaoAplicativos
        apps={distribuicao.dados}
        categorias={[]}
        admin={admin}
        dominios={dominios.dados}
        recorte={recorte}
      />
    </>
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

async function HorasPessoa({ supabase, periodo, escopo, admin }: any) {
  const horas = await comFalha(buscarHorasExtras(supabase, periodo, escopo), []);
  return (
    <>
      {horas.erro && <AvisoErro mensagem={horas.erro} />}
      <SecaoHorasExtras linhas={horas.dados} mostrarEquipe={false} admin={admin} />
    </>
  );
}

async function EstacaoPessoa({ supabase, colaboradorId, orgId }: any) {
  const estacoes = await comFalha(buscarEstacoesColaborador(supabase, colaboradorId), []);
  const principal = estacoes.dados[0];
  const diario = principal
    ? await comFalha(buscarDiarioEstacao(supabase, orgId, 14, principal.id), [])
    : { dados: [], erro: null };

  if (estacoes.dados.length === 0) {
    return (
      <EstadoVazio
        titulo="Nenhuma estação vinculada"
        descricao="Assim que houver atividade registrada, a estação usada por esta pessoa aparece aqui, com versão do agente, status e o diário de liga/bloqueia/desliga."
      />
    );
  }

  return (
    <div className="space-y-5">
      {estacoes.erro && <AvisoErro mensagem={estacoes.erro} />}
      <div className="space-y-2">
        <h3 className="text-sm font-medium text-slate-200">
          {estacoes.dados.length === 1 ? "Estação desta pessoa" : "Estações desta pessoa"}
        </h3>
        <TabelaDispositivos linhas={estacoes.dados} />
      </div>
      {diario.dados.length > 0 && <DiarioEstacao eventos={diario.dados} dias={14} />}
    </div>
  );
}
