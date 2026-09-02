import { FileSpreadsheet } from "lucide-react";
import { redirect } from "next/navigation";
import { BarraFiltros } from "@/components/painel/barra-filtros";
import { BotaoExportar } from "@/components/painel/botao-exportar";
import { AvisoErro, CabecalhoPagina } from "@/components/painel/cabecalho";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { criarClienteServidor } from "@/lib/supabase/server";
import { carregarContexto } from "@/lib/sessao";
import { comFalha, primeiroErro } from "@/lib/carregar";
import { lerFiltros, orgEfetiva, type ParamsPagina } from "@/lib/filtros-url";
import { buscarColaboradores, buscarEquipes } from "@/lib/consultas";
import { RELATORIOS, type TipoRelatorio } from "@/lib/tipos";

export const dynamic = "force-dynamic";

const ORDEM: TipoRelatorio[] = ["diario", "colaboradores", "equipes", "aplicativos"];

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

  const org = orgEfetiva(contexto, escopo);

  const [equipes, colaboradores] = await Promise.all([
    comFalha(buscarEquipes(supabase, org), []),
    comFalha(buscarColaboradores(supabase, null, org), []),
  ]);

  const erro = primeiroErro(equipes, colaboradores);

  const equipeEscolhida = equipes.dados.find((e) => e.id === escopo.equipeId);
  const pessoaEscolhida = colaboradores.dados.find((c) => c.id === escopo.colaboradorId);

  return (
    <div className="space-y-5">
      <CabecalhoPagina
        titulo="Relatórios"
        descricao="Exportação em XLSX ou CSV, com o mesmo recorte de período e escopo do painel."
        icone={<FileSpreadsheet className="h-5 w-5 text-cyan-400" />}
      />

      <BarraFiltros
        periodo={periodo}
        escopo={escopo}
        fuso={contexto.empresa.fuso}
        equipes={equipes.dados}
        colaboradores={colaboradores.dados}
        travarEquipe={!!contexto.equipeEscopo}
      />

      {erro && <AvisoErro mensagem={erro} />}

      <Card className="p-5">
        <h3 className="text-sm font-medium text-slate-200">Recorte selecionado</h3>
        <div className="mt-3 flex flex-wrap gap-2">
          <Badge variante="ciano">{periodo.rotulo}</Badge>
          <Badge variante="neutro">
            {equipeEscolhida ? `Equipe: ${equipeEscolhida.nome}` : "Todas as equipes"}
          </Badge>
          <Badge variante="neutro">
            {pessoaEscolhida
              ? `Colaborador: ${pessoaEscolhida.nome ?? pessoaEscolhida.os_user}`
              : "Todos os colaboradores"}
          </Badge>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-slate-500">
          No XLSX o tempo sai como duração (soma e média funcionam direto na planilha) e o
          índice como percentual, com cabeçalho congelado, autofiltro e linha de totais. No CSV
          o separador é ponto e vírgula e o decimal é vírgula — o padrão que o Excel em
          português abre sem pedir importação.
        </p>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {ORDEM.map((tipo) => (
          <Card key={tipo} className="flex flex-col justify-between gap-4 p-5">
            <div>
              <h3 className="text-sm font-medium text-slate-100">{RELATORIOS[tipo].titulo}</h3>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">
                {RELATORIOS[tipo].descricao}
              </p>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-slate-600">{periodo.rotulo}</span>
              <BotaoExportar
                periodo={periodo}
                escopo={escopo}
                tipos={[tipo]}
                rotulo="Baixar"
              />
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
