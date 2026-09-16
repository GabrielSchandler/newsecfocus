import { BarraFiltros } from "./barra-filtros";
import { BotaoExportar } from "./botao-exportar";
import { AvisoErro, CabecalhoPagina } from "./cabecalho";
import { CartoesIndicadores, UsoExpediente, type ForaDoExpediente } from "./resumo-expediente";
import { PontosAtencao } from "./pontos-atencao";
import { GraficoEvolucaoIndice } from "./grafico-evolucao-indice";
import { ComparativoEquipes } from "./comparativo-equipes";
import { Aviso } from "./kit";
import { dataCurta, formatarDuracao, horaCurta } from "@/lib/formato";
import { diaNoFuso } from "@/lib/periodos";
import { rotuloIntervaloCurto } from "@/lib/visao-geral";
import type { LinhaComparativoEquipe, PontoAtencao, PontoEvolucao } from "@/lib/visao-geral";
import type { Equipe, Escopo, Estacao, Periodo, ResumoProdutividade } from "@/lib/tipos";

export interface PropsResumoVisaoGeral {
  periodo: Periodo;
  escopo: Escopo;
  fuso: string;
  equipes: Equipe[];
  travarEquipe: boolean;
  estacoes: Estacao[];
  ultimaConsolidacao: string | null;
  /** Falha de uma das consultas principais — dita em voz alta no topo. */
  erro: string | null;
  resumo: ResumoProdutividade;
  variacao: number | null;
  rotuloComparacao: string | null;
  foraDoExpediente?: ForaDoExpediente;
  pontos: PontoAtencao[];
  evolucao: { pontos: PontoEvolucao[]; descricao: string; temAnterior: boolean; erro: string | null };
  equipesComparadas: { linhas: LinhaComparativoEquipe[]; temAnterior: boolean; erro: string | null };
  /** Query string do recorte, para os links levarem o período junto. */
  recorte: string;
}

/**
 * A Visão geral: cabeçalho, indicadores, aviso de coleta, uso do expediente,
 * pontos de atenção, evolução e equipes. Só desenha — quem busca é a página.
 */
export function ResumoVisaoGeral(p: PropsResumoVisaoGeral) {
  const atrasadas = p.estacoes.filter((e) => e.situacao !== "RECENTE" && e.emExpedienteAgora);

  return (
    <>
      <CabecalhoPagina
        titulo="Visão geral"
        descricao="Atividade da operação, com contexto para decidir."
        acoes={
          <>
            <BarraFiltros
              variante="topo"
              rotuloPeriodo={rotuloIntervaloCurto(p.periodo, p.fuso)}
              periodo={p.periodo}
              escopo={p.escopo}
              fuso={p.fuso}
              equipes={p.equipes}
              campos={["equipe"]}
              travarEquipe={p.travarEquipe}
            />
            <BotaoExportar periodo={p.periodo} escopo={p.escopo} destaque />
          </>
        }
        nota={<NotaAtualizacao estacoes={p.estacoes} consolidacao={p.ultimaConsolidacao} fuso={p.fuso} />}
      />

      {p.erro && <AvisoErro mensagem={p.erro} />}

      <CartoesIndicadores
        resumo={p.resumo}
        variacao={p.variacao}
        rotuloComparacao={p.rotuloComparacao}
        foraDoExpediente={p.foraDoExpediente}
      />

      {atrasadas.length > 0 && (
        <Aviso
          titulo="Atenção aos dados"
          acao={{ rotulo: "Ver dispositivos", href: "/painel/dispositivos?situacao=atrasadas" }}
        >
          {atrasadas.length === 1
            ? `1 estação sem enviar dados há mais de ${atrasadas[0].limiarMinutos} min durante o expediente`
            : `${atrasadas.length} estações sem enviar dados há mais de ${atrasadas[0].limiarMinutos} min durante o expediente`}
          {atrasadas[0].minutosSemEnvio !== null &&
            ` (${atrasadas[0].maquina}: ${formatarDuracao(atrasadas[0].minutosSemEnvio)})`}
          . O tempo delas aparece como “sem dados” até o envio voltar.
        </Aviso>
      )}

      <div className="grid grid-cols-1 gap-4 sm:gap-5 xl:grid-cols-[minmax(0,1.62fr)_minmax(0,1fr)]">
        <UsoExpediente minutos={p.resumo.minutos} aproximado={p.resumo.aproximado} dividida />
        <PontosAtencao pontos={p.pontos} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:gap-5 xl:grid-cols-[minmax(0,0.93fr)_minmax(0,1fr)]">
        <GraficoEvolucaoIndice
          pontos={p.evolucao.pontos}
          descricao={p.evolucao.descricao}
          temAnterior={p.evolucao.temAnterior}
          erro={p.evolucao.erro}
        />
        <ComparativoEquipes
          linhas={p.equipesComparadas.linhas}
          recorte={p.recorte}
          temAnterior={p.equipesComparadas.temAnterior}
          erro={p.equipesComparadas.erro}
        />
      </div>
    </>
  );
}

/**
 * Quando chegou o último envio e quando os números foram consolidados. São
 * coisas diferentes: a estação pode ter mandado dado às 10:25 e o resumo só
 * ter rodado às 10:20 — quem desconfia de um número precisa ver as duas.
 */
export function NotaAtualizacao({
  estacoes,
  consolidacao,
  fuso,
}: {
  estacoes: Estacao[];
  consolidacao: string | null;
  fuso: string;
}) {
  const ultimoEnvio = estacoes
    .map((e) => e.ultimoEnvio)
    .filter((v): v is string => !!v)
    .sort()
    .pop();

  const quando = (iso: string) =>
    diaNoFuso(new Date(), fuso) === diaNoFuso(new Date(iso), fuso)
      ? horaCurta(iso, fuso)
      : `${dataCurta(iso, fuso)} ${horaCurta(iso, fuso)}`;

  if (!ultimoEnvio) return <span>Nenhuma estação enviou dados ainda</span>;

  return (
    <span className="numeros-tabulares">
      Último envio: {quando(ultimoEnvio)}
      {consolidacao && <> · números atualizados às {quando(consolidacao)}</>} · {fuso}
    </span>
  );
}
