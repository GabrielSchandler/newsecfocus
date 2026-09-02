// ============================================================================
//  Exportação de relatórios em XLSX e CSV.
//
//  Roda no servidor (Route Handler), por três motivos: o relatório pode ter
//  dezenas de milhares de linhas e travaria o navegador; o RLS do Supabase
//  continua valendo com o cookie do usuário; e o arquivo chega pronto, sem
//  passar por processamento no cliente.
//
//  Convenções que fazem o arquivo ser útil de verdade no Excel:
//    • tempo vai como FRAÇÃO DE DIA com formato [h]:mm — soma e média funcionam,
//      e a coluna aparece como duração ("07:32"), não como texto;
//    • percentuais vão como número com formato 0.0%, não como string "72,4%";
//    • cabeçalho congelado e autofiltro ligados;
//    • no CSV, separador ";" e vírgula decimal (padrão pt-BR do Excel), com BOM
//      UTF-8 para os acentos não quebrarem.
// ============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buscarRankingColaboradores,
  buscarRankingEquipes,
  buscarRelatorioAplicativos,
  buscarRelatorioDiario,
} from "./consultas";
import { horaCurta } from "./formato";
import type { Escopo, Periodo, TipoRelatorio } from "./tipos";
import { RELATORIOS } from "./tipos";

export type TipoColuna = "texto" | "inteiro" | "duracao" | "percentual" | "data" | "hora";

export interface ColunaRelatorio {
  chave: string;
  rotulo: string;
  tipo: TipoColuna;
  largura?: number;
}

export interface TabelaRelatorio {
  titulo: string;
  subtitulo: string;
  colunas: ColunaRelatorio[];
  linhas: Record<string, unknown>[];
}

// ----------------------------------------------------------------------------
//  Montagem das tabelas
// ----------------------------------------------------------------------------

export async function montarRelatorio(
  supabase: SupabaseClient,
  tipo: TipoRelatorio,
  periodo: Periodo,
  escopo: Escopo,
  fuso: string,
  empresa: string,
): Promise<TabelaRelatorio> {
  const subtitulo = `${empresa} · ${periodo.rotulo}`;

  switch (tipo) {
    case "diario": {
      const dados = await buscarRelatorioDiario(supabase, periodo, escopo);
      return {
        titulo: RELATORIOS.diario.titulo,
        subtitulo,
        colunas: [
          { chave: "dia", rotulo: "Data", tipo: "data", largura: 12 },
          { chave: "colaborador", rotulo: "Colaborador", tipo: "texto", largura: 28 },
          { chave: "equipe", rotulo: "Equipe", tipo: "texto", largura: 20 },
          { chave: "cargo", rotulo: "Cargo", tipo: "texto", largura: 20 },
          { chave: "ativo", rotulo: "Tempo ativo", tipo: "duracao" },
          { chave: "ocioso", rotulo: "Tempo ocioso", tipo: "duracao" },
          { chave: "produtivo", rotulo: "Produtivo", tipo: "duracao" },
          { chave: "neutro", rotulo: "Neutro", tipo: "duracao" },
          { chave: "improdutivo", rotulo: "Improdutivo", tipo: "duracao" },
          { chave: "sem_classificar", rotulo: "Sem classificação", tipo: "duracao", largura: 18 },
          { chave: "indice", rotulo: "Índice", tipo: "percentual" },
          { chave: "entrada", rotulo: "1º sinal", tipo: "hora" },
          { chave: "saida", rotulo: "Último sinal", tipo: "hora", largura: 14 },
          { chave: "teclas", rotulo: "Teclas", tipo: "inteiro" },
          { chave: "cliques", rotulo: "Cliques", tipo: "inteiro" },
        ],
        linhas: dados.map((r: any) => ({
          dia: r.dia,
          colaborador: r.colaborador,
          equipe: r.equipe,
          cargo: r.cargo ?? "",
          ativo: Number(r.minutos_ativos ?? 0),
          ocioso: Number(r.minutos_ociosos ?? 0),
          produtivo: Number(r.minutos_produtivos ?? 0),
          neutro: Number(r.minutos_neutros ?? 0),
          improdutivo: Number(r.minutos_improdutivos ?? 0),
          sem_classificar: Number(r.minutos_sem_classificar ?? 0),
          indice: r.indice === null ? null : Number(r.indice),
          entrada: r.primeiro_sinal ? horaCurta(r.primeiro_sinal, fuso) : "",
          saida: r.ultimo_sinal ? horaCurta(r.ultimo_sinal, fuso) : "",
          teclas: Number(r.teclas ?? 0),
          cliques: Number(r.cliques ?? 0),
        })),
      };
    }

    case "colaboradores": {
      const dados = await buscarRankingColaboradores(supabase, periodo, escopo.equipeId, 5000);
      return {
        titulo: RELATORIOS.colaboradores.titulo,
        subtitulo,
        colunas: [
          { chave: "colaborador", rotulo: "Colaborador", tipo: "texto", largura: 28 },
          { chave: "equipe", rotulo: "Equipe", tipo: "texto", largura: 20 },
          { chave: "cargo", rotulo: "Cargo", tipo: "texto", largura: 20 },
          { chave: "dias", rotulo: "Dias com registro", tipo: "inteiro", largura: 18 },
          { chave: "ativo", rotulo: "Tempo ativo", tipo: "duracao" },
          { chave: "ocioso", rotulo: "Tempo ocioso", tipo: "duracao" },
          { chave: "produtivo", rotulo: "Produtivo", tipo: "duracao" },
          { chave: "neutro", rotulo: "Neutro", tipo: "duracao" },
          { chave: "improdutivo", rotulo: "Improdutivo", tipo: "duracao" },
          { chave: "indice", rotulo: "Índice", tipo: "percentual" },
          { chave: "aderencia", rotulo: "Aderência à jornada", tipo: "percentual", largura: 20 },
          { chave: "teclas", rotulo: "Teclas", tipo: "inteiro" },
          { chave: "cliques", rotulo: "Cliques", tipo: "inteiro" },
        ],
        linhas: dados.map((r) => ({
          colaborador: r.colaborador,
          equipe: r.equipe ?? "Sem equipe",
          cargo: r.cargo ?? "",
          dias: r.diasComRegistro,
          ativo: r.minutosAtivos,
          ocioso: r.minutosOciosos,
          produtivo: r.minutosProdutivos,
          neutro: r.minutosNeutros,
          improdutivo: r.minutosImprodutivos,
          indice: r.indice,
          aderencia: r.aderencia,
          teclas: r.teclas,
          cliques: r.cliques,
        })),
      };
    }

    case "equipes": {
      const dados = await buscarRankingEquipes(supabase, periodo);
      return {
        titulo: RELATORIOS.equipes.titulo,
        subtitulo,
        colunas: [
          { chave: "equipe", rotulo: "Equipe", tipo: "texto", largura: 26 },
          { chave: "pessoas", rotulo: "Pessoas", tipo: "inteiro" },
          { chave: "ativo", rotulo: "Tempo ativo", tipo: "duracao" },
          { chave: "ocioso", rotulo: "Tempo ocioso", tipo: "duracao" },
          { chave: "produtivo", rotulo: "Produtivo", tipo: "duracao" },
          { chave: "neutro", rotulo: "Neutro", tipo: "duracao" },
          { chave: "improdutivo", rotulo: "Improdutivo", tipo: "duracao" },
          { chave: "indice", rotulo: "Índice", tipo: "percentual" },
          { chave: "aderencia", rotulo: "Aderência à jornada", tipo: "percentual", largura: 20 },
        ],
        linhas: dados.map((r) => ({
          equipe: r.equipe,
          pessoas: r.pessoas,
          ativo: r.minutosAtivos,
          ocioso: r.minutosOciosos,
          produtivo: r.minutosProdutivos,
          neutro: r.minutosNeutros,
          improdutivo: r.minutosImprodutivos,
          indice: r.indice,
          aderencia: r.aderencia,
        })),
      };
    }

    case "aplicativos": {
      const dados = await buscarRelatorioAplicativos(supabase, periodo, escopo);
      return {
        titulo: RELATORIOS.aplicativos.titulo,
        subtitulo,
        colunas: [
          { chave: "aplicativo", rotulo: "Aplicativo / site", tipo: "texto", largura: 30 },
          { chave: "categoria", rotulo: "Categoria", tipo: "texto", largura: 20 },
          { chave: "colaborador", rotulo: "Colaborador", tipo: "texto", largura: 28 },
          { chave: "equipe", rotulo: "Equipe", tipo: "texto", largura: 20 },
          { chave: "tempo", rotulo: "Tempo", tipo: "duracao" },
          { chave: "teclas", rotulo: "Teclas", tipo: "inteiro" },
          { chave: "cliques", rotulo: "Cliques", tipo: "inteiro" },
        ],
        linhas: dados.map((r: any) => ({
          aplicativo: r.aplicativo,
          categoria: r.categoria,
          colaborador: r.colaborador,
          equipe: r.equipe,
          tempo: Number(r.minutos ?? 0),
          teclas: Number(r.teclas ?? 0),
          cliques: Number(r.cliques ?? 0),
        })),
      };
    }
  }
}

// ----------------------------------------------------------------------------
//  CSV — separador ";" e vírgula decimal, o que o Excel pt-BR espera
// ----------------------------------------------------------------------------

const BOM = "﻿";

function celulaCsv(valor: unknown, tipo: TipoColuna): string {
  if (valor === null || valor === undefined || valor === "") return "";

  switch (tipo) {
    case "duracao": {
      // Horas decimais: soma e média funcionam em qualquer planilha.
      const horas = Number(valor) / 60;
      return horas.toFixed(2).replace(".", ",");
    }
    case "percentual":
      return Number(valor).toFixed(1).replace(".", ",");
    case "inteiro":
      return String(Math.round(Number(valor)));
    default: {
      const texto = String(valor);
      // Escapa aspas e envolve o campo quando há separador, aspas ou quebra.
      if (/[";\n\r]/.test(texto)) return `"${texto.replace(/"/g, '""')}"`;
      return texto;
    }
  }
}

export function paraCsv(tabela: TabelaRelatorio): string {
  const cabecalho = tabela.colunas
    .map((c) => (c.tipo === "duracao" ? `${c.rotulo} (horas)` : c.rotulo))
    .join(";");

  const corpo = tabela.linhas.map((linha) =>
    tabela.colunas.map((c) => celulaCsv(linha[c.chave], c.tipo)).join(";"),
  );

  return BOM + [cabecalho, ...corpo].join("\r\n") + "\r\n";
}

// ----------------------------------------------------------------------------
//  XLSX — planilha formatada, com totais, congelamento e autofiltro
// ----------------------------------------------------------------------------

const AZUL_ESCURO = "FF0F1524";
const CIANO = "FF22D3EE";

export async function paraXlsx(tabela: TabelaRelatorio): Promise<Buffer> {
  const ExcelJS = (await import("exceljs")).default;
  const livro = new ExcelJS.Workbook();

  livro.creator = "Telemetria de Produtividade";
  livro.created = new Date();

  const aba = livro.addWorksheet("Relatório", {
    views: [{ state: "frozen", ySplit: 4 }],
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  const totalColunas = tabela.colunas.length;

  // Título e subtítulo ocupando a largura da tabela.
  aba.mergeCells(1, 1, 1, totalColunas);
  const celulaTitulo = aba.getCell(1, 1);
  celulaTitulo.value = tabela.titulo;
  celulaTitulo.font = { size: 14, bold: true, color: { argb: "FFFFFFFF" } };
  celulaTitulo.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AZUL_ESCURO } };
  celulaTitulo.alignment = { vertical: "middle" };
  aba.getRow(1).height = 26;

  aba.mergeCells(2, 1, 2, totalColunas);
  const celulaSub = aba.getCell(2, 1);
  celulaSub.value = tabela.subtitulo;
  celulaSub.font = { size: 10, color: { argb: "FF64748B" } };

  aba.getRow(3).height = 6;

  // Cabeçalho da tabela.
  const linhaCabecalho = aba.getRow(4);
  tabela.colunas.forEach((coluna, i) => {
    const celula = linhaCabecalho.getCell(i + 1);
    celula.value = coluna.rotulo;
    celula.font = { bold: true, size: 10, color: { argb: AZUL_ESCURO } };
    celula.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2F5F9" } };
    celula.border = { bottom: { style: "medium", color: { argb: CIANO } } };
    celula.alignment = { vertical: "middle", wrapText: true };
    aba.getColumn(i + 1).width = coluna.largura ?? 14;
  });
  linhaCabecalho.height = 22;

  // Corpo.
  for (const linha of tabela.linhas) {
    const valores = tabela.colunas.map((coluna) => {
      const bruto = linha[coluna.chave];
      if (bruto === null || bruto === undefined) return null;

      switch (coluna.tipo) {
        case "duracao":
          // Fração de dia: com o formato [h]:mm o Excel trata como duração real.
          return Number(bruto) / 1440;
        case "percentual":
          return Number(bruto) / 100;
        case "inteiro":
          return Number(bruto);
        case "data":
          return new Date(`${bruto}T12:00:00`);
        default:
          return bruto;
      }
    });

    const nova = aba.addRow(valores);
    tabela.colunas.forEach((coluna, i) => {
      const celula = nova.getCell(i + 1);
      switch (coluna.tipo) {
        case "duracao":
          celula.numFmt = "[h]:mm";
          celula.alignment = { horizontal: "right" };
          break;
        case "percentual":
          celula.numFmt = "0.0%";
          celula.alignment = { horizontal: "right" };
          break;
        case "inteiro":
          celula.numFmt = "#,##0";
          celula.alignment = { horizontal: "right" };
          break;
        case "data":
          celula.numFmt = "dd/mm/yyyy";
          break;
      }
      celula.font = { size: 10 };
    });
  }

  // Linha de totais para as colunas somáveis.
  if (tabela.linhas.length > 0) {
    const primeira = 5;
    const ultima = 4 + tabela.linhas.length;
    const totais = aba.addRow(
      tabela.colunas.map((coluna, i) => {
        if (coluna.tipo === "duracao" || coluna.tipo === "inteiro") {
          const letra = aba.getColumn(i + 1).letter;
          return { formula: `SUM(${letra}${primeira}:${letra}${ultima})` };
        }
        if (i === 0) return "Total";
        return null;
      }),
    );

    totais.eachCell((celula, i) => {
      const coluna = tabela.colunas[i - 1];
      celula.font = { bold: true, size: 10 };
      celula.border = { top: { style: "thin", color: { argb: "FF94A3B8" } } };
      if (coluna?.tipo === "duracao") celula.numFmt = "[h]:mm";
      if (coluna?.tipo === "inteiro") celula.numFmt = "#,##0";
    });
  }

  aba.autoFilter = {
    from: { row: 4, column: 1 },
    to: { row: 4 + tabela.linhas.length, column: totalColunas },
  };

  const buffer = await livro.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
