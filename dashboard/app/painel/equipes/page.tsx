import { Users } from "lucide-react";
import { redirect } from "next/navigation";
import { BarraFiltros } from "@/components/painel/barra-filtros";
import { BotaoExportar } from "@/components/painel/botao-exportar";
import { AvisoErro, CabecalhoPagina, EstadoVazio } from "@/components/painel/cabecalho";
import { GraficoBarras } from "@/components/painel/grafico-barras";
import { Tabela, CelulaBarra, type ColunaTabela } from "@/components/painel/tabela";
import { Badge } from "@/components/ui/badge";
import { criarClienteServidor } from "@/lib/supabase/server";
import { carregarContexto } from "@/lib/sessao";
import { comFalha } from "@/lib/carregar";
import { lerFiltros, paramsDoRecorte, type ParamsPagina } from "@/lib/filtros-url";
import { buscarRankingEquipes } from "@/lib/consultas";
import { faixaIndice, formatarHorasCurto, formatarPorcentagem } from "@/lib/formato";
import type { LinhaRankingEquipe } from "@/lib/tipos";

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

  const ranking = await comFalha(buscarRankingEquipes(supabase, periodo), []);
  const equipes = ranking.dados;
  const maiorTempo = Math.max(1, ...equipes.map((e) => e.minutosAtivos));

  const colunas: ColunaTabela<LinhaRankingEquipe>[] = [
    {
      chave: "equipe",
      rotulo: "Equipe",
      principal: true,
      valorOrdenacao: (l) => l.equipe,
      render: (l) => (
        <span className="flex items-center gap-2">
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ background: l.cor ?? "#475569" }}
          />
          <span className="truncate font-medium text-slate-100">{l.equipe}</span>
        </span>
      ),
    },
    {
      chave: "pessoas",
      rotulo: "Pessoas",
      alinhar: "direita",
      valorOrdenacao: (l) => l.pessoas,
      render: (l) => <span className="tabular-nums text-slate-300">{l.pessoas}</span>,
    },
    {
      chave: "ativo",
      rotulo: "Tempo ativo",
      alinhar: "direita",
      valorOrdenacao: (l) => l.minutosAtivos,
      render: (l) => (
        <CelulaBarra
          valor={l.minutosAtivos}
          maximo={maiorTempo}
          rotulo={formatarHorasCurto(l.minutosAtivos)}
        />
      ),
    },
    {
      chave: "produtivo",
      rotulo: "Produtivo",
      alinhar: "direita",
      ocultarMobile: true,
      valorOrdenacao: (l) => l.minutosProdutivos,
      render: (l) => (
        <span className="tabular-nums text-slate-400">
          {formatarHorasCurto(l.minutosProdutivos)}
        </span>
      ),
    },
    {
      chave: "improdutivo",
      rotulo: "Improdutivo",
      alinhar: "direita",
      ocultarMobile: true,
      valorOrdenacao: (l) => l.minutosImprodutivos,
      render: (l) => (
        <span className="tabular-nums text-slate-400">
          {formatarHorasCurto(l.minutosImprodutivos)}
        </span>
      ),
    },
    {
      chave: "aderencia",
      rotulo: "Aderência",
      alinhar: "direita",
      valorOrdenacao: (l) => l.aderencia ?? -1,
      render: (l) => (
        <span className="tabular-nums text-slate-300">
          {formatarPorcentagem(l.aderencia, 0)}
        </span>
      ),
    },
    {
      chave: "indice",
      rotulo: "Índice",
      alinhar: "direita",
      valorOrdenacao: (l) => l.indice ?? -1,
      render: (l) => {
        const faixa = faixaIndice(l.indice);
        return (
          <span className={`font-medium tabular-nums ${faixa.classe}`}>
            {formatarPorcentagem(l.indice, 1)}
          </span>
        );
      },
    },
  ];

  return (
    <div className="space-y-5">
      <CabecalhoPagina
        titulo="Equipes"
        descricao={`${equipes.length} ${equipes.length === 1 ? "equipe" : "equipes"} · ${periodo.rotulo}`}
        icone={<Users className="h-5 w-5 text-cyan-400" />}
        acoes={
          <BotaoExportar
            periodo={periodo}
            escopo={escopo}
            tipos={["equipes", "colaboradores"]}
          />
        }
      />

      <BarraFiltros periodo={periodo} escopo={escopo} fuso={contexto.empresa.fuso} campos={[]} />

      {ranking.erro && <AvisoErro mensagem={ranking.erro} />}

      {equipes.length === 0 ? (
        <EstadoVazio
          titulo="Nenhuma equipe cadastrada"
          descricao="Crie as equipes em Administração e vincule os colaboradores. Sem equipe, o painel só consegue comparar pessoas individualmente."
        />
      ) : (
        <>
          <GraficoBarras
            titulo="Comparativo entre equipes"
            subtitulo="tempo ativo por categoria no período"
            dados={equipes.map((e) => ({
              id: e.equipeId,
              nome: e.equipe,
              produtivo: e.minutosProdutivos,
              neutro: e.minutosNeutros,
              improdutivo: e.minutosImprodutivos,
              indice: e.indice,
            }))}
          />

          <Tabela
            colunas={colunas}
            linhas={equipes}
            chave={(l) => l.equipeId}
            href={(l) => `/painel/equipes/${l.equipeId}${recorte}`}
            ordenacaoInicial={{ coluna: "ativo", direcao: "desc" }}
          />

          <p className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
            <Badge variante="neutro">como ler</Badge>
            Aderência compara o tempo ativo com a jornada esperada das pessoas da equipe.
            Índice é o tempo produtivo sobre o tempo classificado — aplicativos sem categoria
            não entram na conta.
          </p>
        </>
      )}
    </div>
  );
}
