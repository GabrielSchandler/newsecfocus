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
import { buscarAplicativosLista, buscarProdutividade, buscarProdutividadeDiaria } from "./consultas";
import { agruparPorEquipe, janelaAtual } from "./produtividade";
import type { Escopo, MinutosExpediente, Periodo, TipoRelatorio } from "./tipos";
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
  /** Observações que acompanham o arquivo (critério, aproximação). */
  notas: string[];
}

// ----------------------------------------------------------------------------
//  Montagem das tabelas
//
//  Os quatro relatórios saem das MESMAS funções das telas (fonte única da
//  migration 0036), com a MESMA janela (período cortado no presente) e o MESMO
//  escopo. A prévia da tela de Relatórios chama esta função — o que se vê é o
//  que se baixa.
// ----------------------------------------------------------------------------

const COLUNAS_MINUTOS: ColunaRelatorio[] = [
  { chave: "expediente", rotulo: "Expediente previsto", tipo: "duracao", largura: 16 },
  { chave: "registrados", rotulo: "Com registro", tipo: "duracao" },
  { chave: "ativos", rotulo: "Tempo ativo", tipo: "duracao" },
  { chave: "produtivos", rotulo: "Produtivo", tipo: "duracao" },
  { chave: "neutros", rotulo: "Neutro", tipo: "duracao" },
  { chave: "improdutivos", rotulo: "Improdutivo", tipo: "duracao" },
  { chave: "semClassificar", rotulo: "Sem classificação", tipo: "duracao", largura: 16 },
  { chave: "ociosos", rotulo: "Ocioso", tipo: "duracao" },
  { chave: "bloqueado", rotulo: "Bloqueado", tipo: "duracao" },
  { chave: "semDados", rotulo: "Sem dados", tipo: "duracao" },
  { chave: "ativosFora", rotulo: "Fora da escala", tipo: "duracao" },
];

const minutos = (m: MinutosExpediente) => ({
  expediente: m.expediente,
  registrados: Math.min(m.registrados, m.expediente),
  ativos: m.ativos,
  produtivos: m.produtivos,
  neutros: m.neutros,
  improdutivos: m.improdutivos,
  semClassificar: m.semClassificar,
  ociosos: m.ociosos,
  bloqueado: m.bloqueado,
  semDados: m.semDados,
  ativosFora: m.ativosFora,
});

const NOTAS_COMUNS = [
  "Índice = tempo em aplicativos produtivos ÷ expediente previsto até o momento da exportação.",
  "Fora da escala é estimativa por blocos de 15 minutos; não é marcação de ponto nem banco de horas.",
  "Sem dados = expediente sem nenhum registro recebido (máquina desligada, agente parado ou envio atrasado).",
];

export async function montarRelatorio(
  supabase: SupabaseClient,
  tipo: TipoRelatorio,
  periodo: Periodo,
  escopo: Escopo,
  _fuso: string,
  empresa: string,
): Promise<TabelaRelatorio> {
  const subtitulo = `${empresa} · ${periodo.rotulo}`;
  const janela = janelaAtual(periodo);

  switch (tipo) {
    case "diario": {
      const dados = await buscarProdutividadeDiaria(supabase, janela, escopo);
      return {
        titulo: RELATORIOS.diario.titulo,
        subtitulo,
        colunas: [
          { chave: "dia", rotulo: "Data", tipo: "data", largura: 12 },
          { chave: "pessoa", rotulo: "Pessoa", tipo: "texto", largura: 26 },
          { chave: "equipe", rotulo: "Equipe", tipo: "texto", largura: 18 },
          { chave: "escala", rotulo: "Escala", tipo: "texto", largura: 22 },
          ...COLUNAS_MINUTOS,
          { chave: "indice", rotulo: "Índice", tipo: "percentual" },
          { chave: "cobertura", rotulo: "Cobertura", tipo: "percentual" },
          { chave: "aproximado", rotulo: "Horário rateado", tipo: "texto", largura: 14 },
        ],
        linhas: dados.map((l) => ({
          dia: l.dia,
          pessoa: l.colaborador,
          equipe: l.equipe ?? "Sem equipe",
          escala: l.trabalha
            ? `${l.escalaInicio}–${l.escalaFim}${l.intervaloInicio ? ` (int. ${l.intervaloInicio}–${l.intervaloFim})` : ""}`
            : "Sem expediente",
          ...minutos(l.minutos),
          indice: l.indice,
          cobertura: l.cobertura,
          aproximado: l.aproximado ? "Sim" : "Não",
        })),
        notas: NOTAS_COMUNS,
      };
    }

    case "colaboradores": {
      const dados = await buscarProdutividade(supabase, janela, escopo);
      return {
        titulo: RELATORIOS.colaboradores.titulo,
        subtitulo,
        colunas: [
          { chave: "pessoa", rotulo: "Pessoa", tipo: "texto", largura: 26 },
          { chave: "equipe", rotulo: "Equipe", tipo: "texto", largura: 18 },
          { chave: "diasExpediente", rotulo: "Dias com expediente", tipo: "inteiro", largura: 16 },
          { chave: "diasRegistro", rotulo: "Dias com registro", tipo: "inteiro", largura: 16 },
          ...COLUNAS_MINUTOS,
          { chave: "indice", rotulo: "Índice", tipo: "percentual" },
          { chave: "cobertura", rotulo: "Cobertura", tipo: "percentual" },
        ],
        linhas: dados.map((l) => ({
          pessoa: l.colaborador,
          equipe: l.equipe ?? "Sem equipe",
          diasExpediente: l.diasComExpediente,
          diasRegistro: l.diasComRegistro,
          ...minutos(l.minutos),
          indice: l.indice,
          cobertura: l.cobertura,
        })),
        notas: NOTAS_COMUNS,
      };
    }

    case "equipes": {
      const dados = await buscarProdutividade(supabase, janela, escopo);
      return {
        titulo: RELATORIOS.equipes.titulo,
        subtitulo,
        colunas: [
          { chave: "equipe", rotulo: "Equipe", tipo: "texto", largura: 22 },
          { chave: "pessoas", rotulo: "Pessoas", tipo: "inteiro" },
          { chave: "indice", rotulo: "Índice (média por pessoa)", tipo: "percentual", largura: 18 },
          { chave: "cobertura", rotulo: "Cobertura (horas)", tipo: "percentual", largura: 16 },
          ...COLUNAS_MINUTOS,
        ],
        linhas: agruparPorEquipe(dados).map((g) => ({
          equipe: g.equipe,
          pessoas: g.resumo.pessoas,
          indice: g.resumo.indiceMedio,
          cobertura: g.resumo.cobertura,
          ...minutos(g.resumo.minutos),
        })),
        notas: [
          "Índice da equipe = média simples do índice de cada pessoa (cada pessoa pesa igual).",
          "Cobertura e horas da equipe = somas das pessoas da equipe.",
          ...NOTAS_COMUNS.slice(1),
        ],
      };
    }

    case "aplicativos": {
      const { linhas } = await buscarAplicativosLista(supabase, janela, escopo, { limite: 500 });
      const rotulos = { PRODUCTIVE: "Produtivo", NEUTRAL: "Neutro", UNPRODUCTIVE: "Improdutivo" } as const;
      return {
        titulo: RELATORIOS.aplicativos.titulo,
        subtitulo,
        colunas: [
          { chave: "alvo", rotulo: "Aplicativo / domínio", tipo: "texto", largura: 30 },
          { chave: "tipoAlvo", rotulo: "Tipo", tipo: "texto", largura: 12 },
          { chave: "categoria", rotulo: "Categoria", tipo: "texto", largura: 18 },
          { chave: "minutos", rotulo: "Tempo ativo", tipo: "duracao" },
          { chave: "pessoas", rotulo: "Pessoas", tipo: "inteiro" },
          { chave: "dias", rotulo: "Dias com uso", tipo: "inteiro" },
        ],
        linhas: linhas.map((l) => ({
          alvo: l.alvo,
          tipoAlvo: l.ehSite ? "Site" : "Aplicativo",
          categoria: l.tipo ? rotulos[l.tipo] : "Sem classificação",
          minutos: l.minutos,
          pessoas: l.pessoas,
          dias: l.dias,
        })),
        notas: [
          "Tempo ativo inclui uso dentro e fora da escala.",
          "A categoria de um domínio específico prevalece sobre a do processo do navegador.",
        ],
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

  const notas = tabela.notas.map((n) => celulaCsv(n, "texto"));
  return BOM + [cabecalho, ...corpo, ...(notas.length ? ["", ...notas] : [])].join("\r\n") + "\r\n";
}

// ----------------------------------------------------------------------------
//  XLSX — planilha formatada, com totais, congelamento e autofiltro
// ----------------------------------------------------------------------------

const AZUL_ESCURO = "FF13233A";
const CIANO = "FF1F9FB2";

export async function paraXlsx(tabela: TabelaRelatorio): Promise<Buffer> {
  const ExcelJS = (await import("exceljs")).default;
  const livro = new ExcelJS.Workbook();

  livro.creator = "NewSec Focus";
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
    celula.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE4F4F6" } };
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

  if (tabela.notas.length > 0) {
    aba.addRow([]);
    for (const nota of tabela.notas) {
      const linha = aba.addRow([nota]);
      linha.getCell(1).font = { size: 9, italic: true, color: { argb: "FF64748B" } };
    }
  }

  aba.autoFilter = {
    from: { row: 4, column: 1 },
    to: { row: 4 + tabela.linhas.length, column: totalColunas },
  };

  const buffer = await livro.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
