import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckCircle2, Eye, LayoutGrid, SlidersHorizontal, User, UserRound, UsersRound } from "lucide-react";
import { BarraFiltros } from "@/components/painel/barra-filtros";
import { AvisoErro, CabecalhoPagina } from "@/components/painel/cabecalho";
import { GerarRelatorio } from "@/components/painel/gerar-relatorio";
import { Secao, TabelaSimples } from "@/components/painel/kit";
import { Card } from "@/components/ui/card";
import { criarClienteServidor } from "@/lib/supabase/server";
import { carregarContexto } from "@/lib/sessao";
import { comFalha, primeiroErro } from "@/lib/carregar";
import { lerFiltros, orgEfetiva, paramsDoRecorte, type ParamsPagina } from "@/lib/filtros-url";
import { formatarDuracao } from "@/lib/formato";
import { montarRelatorio, type ColunaRelatorio } from "@/lib/exportacao";
import { rotuloIntervaloCurto, juntar } from "@/lib/visao-geral";
import { buscarColaboradores, buscarEquipes } from "@/lib/consultas";
import { cn } from "@/lib/utils";
import { RELATORIOS, type TipoRelatorio } from "@/lib/tipos";

export const dynamic = "force-dynamic";

const ORDEM: TipoRelatorio[] = ["diario", "colaboradores", "equipes", "aplicativos"];
const ICONES = { diario: User, colaboradores: UserRound, equipes: UsersRound, aplicativos: LayoutGrid } as const;
const LINHAS_PREVIA = 10;

function celula(valor: unknown, coluna: ColunaRelatorio) {
  if (valor === null || valor === undefined || valor === "") return "—";
  switch (coluna.tipo) {
    case "duracao":
      return formatarDuracao(Number(valor));
    case "percentual":
      return `${Math.round(Number(valor))}%`;
    case "data":
      return String(valor).split("-").reverse().join("/");
    default:
      return String(valor);
  }
}

export default async function PaginaRelatorios({
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
  const tipoBruto = Array.isArray(params.tipo) ? params.tipo[0] : params.tipo;
  const tipo = ORDEM.includes(tipoBruto as TipoRelatorio) ? (tipoBruto as TipoRelatorio) : "diario";

  const [equipes, colaboradores, previa] = await Promise.all([
    comFalha(buscarEquipes(supabase, org), []),
    comFalha(buscarColaboradores(supabase, null, org), []),
    comFalha(montarRelatorio(supabase, tipo, periodo, escopo, fuso, contexto.empresa.nome), null),
  ]);

  const erro = primeiroErro(equipes, previa);
  const tabela = previa.dados;

  return (
    <div className="space-y-4 sm:space-y-5">
      <CabecalhoPagina
        titulo="Relatórios"
        descricao="Exporte dados de uso e produtividade com os mesmos filtros e critérios do painel."
      />

      {erro && <AvisoErro mensagem={erro} />}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-4">
        {ORDEM.map((t) => {
          const Icone = ICONES[t];
          const ativo = t === tipo;
          return (
            <Link
              key={t}
              href={`/painel/relatorios${juntar(recorte, `tipo=${t}`)}`}
              aria-current={ativo ? "true" : undefined}
              className={cn(
                "relative rounded-xl2 border bg-white p-5 transition-colors",
                ativo ? "border-acao bg-acao-suave/40 ring-1 ring-acao" : "border-borda hover:border-slate-300",
              )}
            >
              {ativo && <CheckCircle2 className="absolute right-4 top-4 h-5 w-5 text-acao" />}
              <Icone className="h-7 w-7 text-acao" strokeWidth={1.75} />
              <p className="mt-3 text-[15px] font-semibold text-slate-900">{RELATORIOS[t].titulo}</p>
              <p className="mt-1 text-sm leading-snug text-slate-500">{RELATORIOS[t].descricao}</p>
            </Link>
          );
        })}
      </div>

      <Card className="p-5 sm:px-6">
        <div className="mb-3 flex items-center gap-2 text-[15px] font-semibold text-slate-900">
          <SlidersHorizontal className="h-5 w-5 text-acao" strokeWidth={1.75} />
          Filtros
        </div>
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <BarraFiltros
            variante="topo"
            rotuloPeriodo={rotuloIntervaloCurto(periodo, fuso)}
            periodo={periodo}
            escopo={escopo}
            fuso={fuso}
            equipes={equipes.dados}
            colaboradores={colaboradores.dados}
            campos={tipo === "equipes" ? ["equipe"] : ["equipe", "colaborador"]}
            travarEquipe={!!contexto.equipeEscopo}
          />
          <GerarRelatorio tipo={tipo} periodo={periodo} escopo={escopo} />
        </div>
      </Card>

      <Secao
        icone={<Eye />}
        titulo="Prévia do relatório"
        subtitulo={
          tabela
            ? `${tabela.titulo} · ${tabela.subtitulo} · ${tabela.linhas.length === 0 ? "sem linhas" : `mostrando ${Math.min(LINHAS_PREVIA, tabela.linhas.length)} de ${tabela.linhas.length} linhas`}`
            : "—"
        }
        acao={<span className="hidden text-sm text-slate-500 sm:inline">Mesmos filtros e critérios do painel</span>}
        rodape={tabela?.notas.length ? tabela.notas.join(" ") : undefined}
      >
        {!tabela ? null : tabela.linhas.length === 0 ? (
          <p className="rounded-lg border border-dashed border-borda py-10 text-center text-sm text-slate-500">
            Nenhuma linha para este recorte. O arquivo sairia só com o cabeçalho.
          </p>
        ) : (
          <TabelaSimples minimo="min-w-[1100px]">
            <thead>
              <tr>
                {tabela.colunas.map((c) => (
                  <th key={c.chave} className={c.tipo === "texto" || c.tipo === "data" ? "whitespace-nowrap" : "whitespace-nowrap !text-right"}>
                    {c.rotulo}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tabela.linhas.slice(0, LINHAS_PREVIA).map((linha, i) => (
                <tr key={i}>
                  {tabela.colunas.map((c) => (
                    <td key={c.chave} className={cn("whitespace-nowrap", c.tipo !== "texto" && c.tipo !== "data" && "numeros-tabulares text-right")}>
                      {celula(linha[c.chave], c)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </TabelaSimples>
        )}
      </Secao>
    </div>
  );
}
