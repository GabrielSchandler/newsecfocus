import { UserSquare2 } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { BarraFiltros } from "@/components/painel/barra-filtros";
import { BentoKpis } from "@/components/painel/bento-kpis";
import { BotaoExportar } from "@/components/painel/botao-exportar";
import { AvisoErro, CabecalhoPagina } from "@/components/painel/cabecalho";
import { GraficoArea } from "@/components/painel/grafico-area";
import { GraficoDonut } from "@/components/painel/grafico-donut";
import { Tabela, type ColunaTabela } from "@/components/painel/tabela";
import { Badge } from "@/components/ui/badge";
import { criarClienteServidor } from "@/lib/supabase/server";
import { carregarContexto } from "@/lib/sessao";
import { comFalha, primeiroErro } from "@/lib/carregar";
import { lerFiltros, paramsDoRecorte, rotuloComparacao, type ParamsPagina } from "@/lib/filtros-url";
import {
  KPIS_VAZIOS,
  buscarDistribuicao,
  buscarKpisComparados,
  buscarRelatorioDiario,
  buscarSerie,
} from "@/lib/consultas";
import {
  dataCurta,
  faixaIndice,
  formatarHorasCurto,
  formatarPorcentagem,
  horaCurta,
} from "@/lib/formato";
import type { Escopo } from "@/lib/tipos";

export const dynamic = "force-dynamic";

interface LinhaDia {
  dia: string;
  minutos_ativos: number;
  minutos_ociosos: number;
  minutos_produtivos: number;
  minutos_improdutivos: number;
  indice: number | null;
  primeiro_sinal: string | null;
  ultimo_sinal: string | null;
}

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

  const { periodo } = lerFiltros(busca, contexto);
  const fuso = contexto.empresa.fuso;
  const recorte = paramsDoRecorte(busca);

  const escopo: Escopo = { equipeId: null, colaboradorId: id, dispositivoId: null };

  const [kpis, serie, distribuicao, diario] = await Promise.all([
    comFalha(buscarKpisComparados(supabase, periodo, escopo, fuso), {
      atual: KPIS_VAZIOS,
      anterior: KPIS_VAZIOS,
      variacao: {
        minutosAtivos: null,
        indice: null,
        minutosProdutivos: null,
        interacoes: null,
      },
    }),
    comFalha(buscarSerie(supabase, periodo, escopo, fuso), []),
    comFalha(buscarDistribuicao(supabase, periodo, escopo, 10), []),
    comFalha(buscarRelatorioDiario(supabase, periodo, escopo) as Promise<LinhaDia[]>, []),
  ]);

  const erro = primeiroErro(kpis, serie, distribuicao, diario);

  const colunasDia: ColunaTabela<LinhaDia>[] = [
    {
      chave: "dia",
      rotulo: "Data",
      principal: true,
      valorOrdenacao: (l) => l.dia,
      render: (l) => (
        <span className="font-medium text-slate-100">{dataCurta(`${l.dia}T12:00:00Z`, "UTC")}</span>
      ),
    },
    {
      chave: "expediente",
      rotulo: "Expediente",
      valorOrdenacao: (l) => l.primeiro_sinal ?? "",
      render: (l) => (
        <span className="tabular-nums text-slate-400">
          {horaCurta(l.primeiro_sinal, fuso)} — {horaCurta(l.ultimo_sinal, fuso)}
        </span>
      ),
    },
    {
      chave: "ativo",
      rotulo: "Ativo",
      alinhar: "direita",
      valorOrdenacao: (l) => Number(l.minutos_ativos),
      render: (l) => (
        <span className="tabular-nums text-slate-200">
          {formatarHorasCurto(Number(l.minutos_ativos))}
        </span>
      ),
    },
    {
      chave: "ocioso",
      rotulo: "Ocioso",
      alinhar: "direita",
      ocultarMobile: true,
      valorOrdenacao: (l) => Number(l.minutos_ociosos),
      render: (l) => (
        <span className="tabular-nums text-slate-400">
          {formatarHorasCurto(Number(l.minutos_ociosos))}
        </span>
      ),
    },
    {
      chave: "indice",
      rotulo: "Índice",
      alinhar: "direita",
      valorOrdenacao: (l) => l.indice ?? -1,
      render: (l) => {
        const faixa = faixaIndice(l.indice === null ? null : Number(l.indice));
        return (
          <span className={`font-medium tabular-nums ${faixa.classe}`}>
            {formatarPorcentagem(l.indice === null ? null : Number(l.indice), 1)}
          </span>
        );
      },
    },
  ];

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

      {erro && <AvisoErro mensagem={erro} />}

      <BentoKpis dados={kpis.dados} rotuloComparacao={rotuloComparacao(periodo)} />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-5">
        <div className="min-w-0 xl:col-span-3">
          <GraficoArea dados={serie.dados} titulo="Atividade no período" />
        </div>
        <div className="min-w-0 xl:col-span-2">
          <GraficoDonut dados={distribuicao.dados} titulo="Ferramentas mais usadas" />
        </div>
      </div>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-medium text-slate-200">Dia a dia</h3>
          <Badge variante="neutro">
            jornada de {formatarHorasCurto(pessoa.jornada_minutos_dia)}/dia
          </Badge>
        </div>
        <Tabela
          colunas={colunasDia}
          linhas={diario.dados}
          chave={(l) => l.dia}
          ordenacaoInicial={{ coluna: "dia", direcao: "desc" }}
          vazio="Sem registros nesse período."
        />
      </section>
    </div>
  );
}
