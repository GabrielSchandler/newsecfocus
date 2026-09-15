import { Users } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { BarraFiltros } from "@/components/painel/barra-filtros";
import { BotaoExportar } from "@/components/painel/botao-exportar";
import { AvisoErro, CabecalhoPagina } from "@/components/painel/cabecalho";
import { AbasPainel, type AbaPainel } from "@/components/painel/abas-painel";
import { ResumoExpediente } from "@/components/painel/resumo-expediente";
import { GraficoArea } from "@/components/painel/grafico-area";
import { GraficoDonut } from "@/components/painel/grafico-donut";
import { SecaoAplicativos } from "@/components/painel/secao-aplicativos";
import { SecaoDispersao } from "@/components/painel/secao-dispersao";
import { SecaoHorasExtras } from "@/components/painel/secao-horas-extras";
import { SecaoPresenca } from "@/components/painel/secao-presenca";
import { SecaoRitmo } from "@/components/painel/secao-ritmo";
import { TabelaColaboradores } from "@/components/painel/tabela-colaboradores";
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
  buscarDispersao,
  buscarDistribuicao,
  buscarDominios,
  buscarHorasExtras,
  buscarProdutividade,
  buscarPresenca,
  buscarRankingColaboradores,
  buscarRitmo,
  buscarSerie,
} from "@/lib/consultas";
import type { Escopo } from "@/lib/tipos";

export const dynamic = "force-dynamic";

const ABAS: AbaPainel[] = [
  { chave: "resumo", rotulo: "Resumo" },
  { chave: "pessoas", rotulo: "Pessoas" },
  { chave: "aplicativos", rotulo: "Aplicativos" },
  { chave: "presenca", rotulo: "Presença" },
  { chave: "ritmo", rotulo: "Ritmo" },
  { chave: "horas", rotulo: "Horas extras" },
];


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

  const escopo: Escopo = {
    orgId: recorteAtual.orgId,
    equipeId: id,
    colaboradorId: null,
    dispositivoId: null,
  };

  const abaBruta = busca.visao;
  const escolhida = Array.isArray(abaBruta) ? abaBruta[0] : abaBruta;
  const aba = ABAS.some((a) => a.chave === escolhida) ? escolhida! : "resumo";

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
        titulo={equipe.nome}
        descricao={equipe.descricao ?? periodo.rotulo}
        icone={
          <span className="h-3 w-3 rounded-full" style={{ background: equipe.cor ?? "#22d3ee" }} />
        }
        voltarPara={{ href: `/painel/equipes${recorte}`, rotulo: "Equipes" }}
        acoes={
          <BotaoExportar
            periodo={periodo}
            escopo={escopo}
            tipos={["colaboradores", "diario", "aplicativos"]}
          />
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
        <ResumoEquipe supabase={supabase} periodo={periodo} escopo={escopo} fuso={fuso} />
      )}
      {aba === "pessoas" && (
        <PessoasEquipe supabase={supabase} periodo={periodo} escopo={escopo} equipeId={id} recorte={recorte} />
      )}
      {aba === "aplicativos" && (
        <AplicativosEquipe supabase={supabase} periodo={periodo} escopo={escopo} admin={admin} />
      )}
      {aba === "presenca" && (
        <PresencaEquipe supabase={supabase} periodo={periodo} escopo={escopo} />
      )}
      {aba === "ritmo" && <RitmoEquipe supabase={supabase} periodo={periodo} escopo={escopo} />}
      {aba === "horas" && (
        <HorasEquipe supabase={supabase} periodo={periodo} escopo={escopo} admin={admin} />
      )}
    </div>
  );
}


async function ResumoEquipe({ supabase, periodo, escopo, fuso }: any) {
  const [serie, distribuicao] = await Promise.all([
    comFalha(buscarSerie(supabase, periodo, escopo, fuso), []),
    comFalha(buscarDistribuicao(supabase, periodo, escopo, 8), []),
  ]);
  const erro = primeiroErro(serie, distribuicao);
  return (
    <div className="space-y-5">
      {erro && <AvisoErro mensagem={erro} />}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-5">
        <div className="min-w-0 xl:col-span-3">
          <GraficoArea
            dados={serie.dados}
            bucket={periodo.bucket}
            fuso={fuso}
            periodoRotulo={periodo.rotulo}
            titulo="Produtividade da equipe"
          />
        </div>
        <div className="min-w-0 xl:col-span-2">
          <GraficoDonut dados={distribuicao.dados} titulo="Ferramentas da equipe" />
        </div>
      </div>
    </div>
  );
}

async function PessoasEquipe({ supabase, periodo, escopo, equipeId, recorte }: any) {
  const pessoas = await comFalha(
    buscarRankingColaboradores(supabase, periodo, equipeId, 100, escopo.orgId),
    [],
  );
  return (
    <>
      {pessoas.erro && <AvisoErro mensagem={pessoas.erro} />}
      <TabelaColaboradores linhas={pessoas.dados} recorte={recorte} mostrarEquipe={false} />
    </>
  );
}

async function AplicativosEquipe({ supabase, periodo, escopo, admin }: any) {
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
      />
    </>
  );
}

async function PresencaEquipe({ supabase, periodo, escopo }: any) {
  const presenca = await comFalha(buscarPresenca(supabase, periodo, escopo), []);
  return (
    <>
      {presenca.erro && <AvisoErro mensagem={presenca.erro} />}
      <SecaoPresenca linhas={presenca.dados} mostrarPessoa={false} />
    </>
  );
}

async function RitmoEquipe({ supabase, periodo, escopo }: any) {
  const [ritmo, dispersao] = await Promise.all([
    comFalha(buscarRitmo(supabase, periodo, escopo), []),
    comFalha(buscarDispersao(supabase, periodo, escopo), []),
  ]);
  return (
    <>
      {ritmo.erro && <AvisoErro mensagem={ritmo.erro} />}
      <SecaoRitmo dados={ritmo.dados} />
      <SecaoDispersao linhas={dispersao.dados} />
    </>
  );
}

async function HorasEquipe({ supabase, periodo, escopo, admin }: any) {
  const horas = await comFalha(buscarHorasExtras(supabase, periodo, escopo), []);
  return (
    <>
      {horas.erro && <AvisoErro mensagem={horas.erro} />}
      <SecaoHorasExtras linhas={horas.dados} mostrarEquipe={false} admin={admin} />
    </>
  );
}
