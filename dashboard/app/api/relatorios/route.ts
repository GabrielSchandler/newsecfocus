// ============================================================================
//  GET /api/relatorios
//
//  Gera o relatório em XLSX ou CSV e devolve como download. Roda no servidor
//  com o cookie de sessão do usuário, então o RLS continua valendo: um líder de
//  equipe exporta só a equipe dele, sem que esta rota precise saber disso.
//
//  Parâmetros:
//    tipo     diario | colaboradores | equipes | aplicativos
//    formato  xlsx | csv
//    preset   dia | semana | mes | ano | geral | personalizado
//    ancora   YYYY-MM-DD (referência do preset)
//    de, ate  ISO (apenas quando preset = personalizado)
//    equipe, colaborador, dispositivo  uuid (opcionais)
// ============================================================================

import { NextResponse, type NextRequest } from "next/server";
import { criarClienteServidor } from "@/lib/supabase/server";
import { carregarContexto } from "@/lib/sessao";
import { periodoDeParams } from "@/lib/periodos";
import { montarRelatorio, paraCsv, paraXlsx } from "@/lib/exportacao";
import { nomeArquivo } from "@/lib/formato";
import type { Escopo, TipoRelatorio } from "@/lib/tipos";
import { RELATORIOS } from "@/lib/tipos";

// exceljs precisa do runtime Node (não roda no Edge).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TIPO_XLSX =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export async function GET(request: NextRequest) {
  const supabase = await criarClienteServidor();
  const contexto = await carregarContexto(supabase);

  if (!contexto) {
    return NextResponse.json({ erro: "Sessão expirada." }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;

  const tipo = (params.get("tipo") ?? "diario") as TipoRelatorio;
  if (!(tipo in RELATORIOS)) {
    return NextResponse.json({ erro: "Tipo de relatório inválido." }, { status: 400 });
  }

  const formato = params.get("formato") === "csv" ? "csv" : "xlsx";
  const periodo = periodoDeParams(params, contexto.empresa.fuso);

  const escopo: Escopo = {
    // A empresa em foco só vale para a operação da NewSec; o banco recusa o
    // parâmetro para qualquer outro usuário.
    orgId: contexto.adminPlataforma ? params.get("empresa") || null : null,
    equipeId: params.get("equipe") || null,
    colaboradorId: params.get("colaborador") || null,
    dispositivoId: params.get("dispositivo") || null,
  };

  let tabela;
  try {
    tabela = await montarRelatorio(
      supabase,
      tipo,
      periodo,
      escopo,
      contexto.empresa.fuso,
      contexto.empresa.nome,
    );
  } catch (e) {
    const mensagem = e instanceof Error ? e.message : "Falha ao montar o relatório.";
    return NextResponse.json({ erro: mensagem }, { status: 500 });
  }

  const arquivo = nomeArquivo(tabela.titulo, periodo.rotulo, formato);

  if (formato === "csv") {
    return new NextResponse(paraCsv(tabela), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${arquivo}"`,
        "Cache-Control": "no-store",
      },
    });
  }

  const buffer = await paraXlsx(tabela);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": TIPO_XLSX,
      "Content-Disposition": `attachment; filename="${arquivo}"`,
      "Cache-Control": "no-store",
    },
  });
}
