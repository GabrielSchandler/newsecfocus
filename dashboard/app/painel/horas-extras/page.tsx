import { AlarmClockCheck } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BarraFiltros } from "@/components/painel/barra-filtros";
import { AvisoErro, CabecalhoPagina, EstadoVazio } from "@/components/painel/cabecalho";
import { TabelaHorasExtras } from "@/components/painel/tabela-horas-extras";
import { Card } from "@/components/ui/card";
import { criarClienteServidor } from "@/lib/supabase/server";
import { carregarContexto, podeAdministrar } from "@/lib/sessao";
import { comFalha, primeiroErro } from "@/lib/carregar";
import { lerFiltros, type ParamsPagina } from "@/lib/filtros-url";
import { buscarEquipes, buscarHorasExtras } from "@/lib/consultas";

export const dynamic = "force-dynamic";

export default async function PaginaHorasExtras({
  searchParams,
}: {
  searchParams: Promise<ParamsPagina>;
}) {
  const params = await searchParams;
  const supabase = await criarClienteServidor();
  const contexto = await carregarContexto(supabase);

  if (!contexto) redirect("/entrar");

  const { periodo, escopo } = lerFiltros(params, contexto);

  const [equipes, horasExtras] = await Promise.all([
    comFalha(buscarEquipes(supabase, escopo.orgId), []),
    comFalha(buscarHorasExtras(supabase, periodo, escopo), []),
  ]);

  const erro = primeiroErro(equipes, horasExtras);
  const linhas = horasExtras.dados;

  const semJanelaConfigurada = linhas.length > 0 && linhas.every((l) => !l.temJanelaDefinida);

  return (
    <div className="space-y-5">
      <CabecalhoPagina
        titulo="Horas extras"
        descricao={`Atividade fora da janela de expediente esperada · ${periodo.rotulo}`}
        icone={<AlarmClockCheck className="h-5 w-5 text-cyan-400" />}
      />

      <BarraFiltros
        periodo={periodo}
        escopo={escopo}
        fuso={contexto.empresa.fuso}
        equipes={equipes.dados}
        campos={["equipe"]}
        travarEquipe={!!contexto.equipeEscopo}
      />

      {erro && <AvisoErro mensagem={erro} />}

      {semJanelaConfigurada && podeAdministrar(contexto) && (
        <Card className="border-amber-500/20 p-4 text-sm text-amber-200/90">
          Nenhuma janela de expediente está configurada — nem padrão da empresa, nem por
          colaborador. Sem isso, não é possível calcular hora extra.{" "}
          <Link
            href="/painel/administracao?aba=empresa"
            className="font-medium underline underline-offset-2 hover:text-amber-100"
          >
            Configurar o expediente padrão
          </Link>
          .
        </Card>
      )}

      {linhas.length === 0 ? (
        <EstadoVazio
          titulo="Nenhum registro no período"
          descricao="Assim que houver atividade das estações classificada por hora, a comparação com a janela de expediente aparece aqui."
        />
      ) : (
        <TabelaHorasExtras linhas={linhas} mostrarEquipe={!escopo.equipeId} />
      )}
    </div>
  );
}
