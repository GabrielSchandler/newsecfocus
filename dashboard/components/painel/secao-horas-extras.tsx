import Link from "next/link";
import { TabelaHorasExtras } from "./tabela-horas-extras";
import { EstadoVazio } from "./cabecalho";
import { Card } from "@/components/ui/card";
import type { LinhaHorasExtras } from "@/lib/tipos";

/**
 * Bloco "Horas extras" reaproveitável: atividade fora da janela de expediente.
 * Usado na aba Horas extras da Visão geral / Equipe / Pessoa, sempre igual.
 */
export function SecaoHorasExtras({
  linhas,
  mostrarEquipe,
  admin,
}: {
  linhas: LinhaHorasExtras[];
  mostrarEquipe: boolean;
  admin: boolean;
}) {
  const semJanelaConfigurada = linhas.length > 0 && linhas.every((l) => !l.temJanelaDefinida);

  return (
    <div className="space-y-5">
      {semJanelaConfigurada && admin && (
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
        <TabelaHorasExtras linhas={linhas} mostrarEquipe={mostrarEquipe} />
      )}
    </div>
  );
}
