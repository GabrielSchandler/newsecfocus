// ============================================================================
//  Motor de períodos.
//
//  Todo recorte do painel nasce aqui: dia, semana, mês, ano, geral e intervalo
//  personalizado — cada um com início inclusivo, fim EXCLUSIVO e o bucket certo
//  para o gráfico.
//
//  O cálculo é feito no FUSO DA EMPRESA, não no fuso do navegador. Sem isso, um
//  gestor acessando de outro estado (ou o próprio servidor, que roda em UTC)
//  veria "hoje" começando na hora errada — foi exatamente o bug da primeira
//  versão, que misturava setHours() do navegador com date_trunc() em UTC.
// ============================================================================

import type { BucketSerie, Periodo, PresetPeriodo } from "./tipos";

export const FUSO_PADRAO = "America/Sao_Paulo";

// ----------------------------------------------------------------------------
//  Conversão entre instante (UTC) e hora de parede num fuso
// ----------------------------------------------------------------------------

interface PartesData {
  ano: number;
  mes: number; // 1-12
  dia: number;
  hora: number;
  minuto: number;
  segundo: number;
}

const FORMATADORES = new Map<string, Intl.DateTimeFormat>();

function formatador(fuso: string): Intl.DateTimeFormat {
  let f = FORMATADORES.get(fuso);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: fuso,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    FORMATADORES.set(fuso, f);
  }
  return f;
}

/** Hora de parede de um instante, no fuso informado. */
export function partesNoFuso(instante: Date, fuso: string): PartesData {
  const p = formatador(fuso).formatToParts(instante);
  const v = (tipo: string) => Number(p.find((x) => x.type === tipo)?.value ?? 0);
  return {
    ano: v("year"),
    mes: v("month"),
    dia: v("day"),
    // Em algumas engines a meia-noite sai como "24" com hour12:false.
    hora: v("hour") % 24,
    minuto: v("minute"),
    segundo: v("second"),
  };
}

/** Diferença, em ms, entre a hora de parede no fuso e o UTC daquele instante. */
function deslocamento(instante: Date, fuso: string): number {
  const p = partesNoFuso(instante, fuso);
  const comoUtc = Date.UTC(p.ano, p.mes - 1, p.dia, p.hora, p.minuto, p.segundo);
  return comoUtc - instante.getTime();
}

/**
 * Instante UTC correspondente a uma hora de parede no fuso.
 * Duas passadas: a primeira estima o deslocamento, a segunda corrige quando o
 * palpite cai do outro lado de uma virada de horário de verão.
 */
export function instanteNoFuso(
  fuso: string,
  ano: number,
  mes: number,
  dia: number,
  hora = 0,
  minuto = 0,
  segundo = 0,
): Date {
  const palpite = Date.UTC(ano, mes - 1, dia, hora, minuto, segundo);
  let instante = new Date(palpite - deslocamento(new Date(palpite), fuso));
  instante = new Date(palpite - deslocamento(instante, fuso));
  return instante;
}

/** "YYYY-MM-DD" do instante, no fuso da empresa. */
export function diaNoFuso(instante: Date, fuso: string): string {
  const p = partesNoFuso(instante, fuso);
  return `${p.ano}-${String(p.mes).padStart(2, "0")}-${String(p.dia).padStart(2, "0")}`;
}

export function hojeNoFuso(fuso: string): string {
  return diaNoFuso(new Date(), fuso);
}

function partesDaAncora(ancora: string): { ano: number; mes: number; dia: number } {
  const [ano, mes, dia] = ancora.split("-").map(Number);
  return { ano, mes, dia };
}

// ----------------------------------------------------------------------------
//  Rótulos
// ----------------------------------------------------------------------------

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

function capitalizar(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function rotuloDia(ancora: string, fuso: string): string {
  const hoje = hojeNoFuso(fuso);
  if (ancora === hoje) return "Hoje";

  const { ano, mes, dia } = partesDaAncora(ancora);
  const ontem = diaNoFuso(new Date(Date.now() - 86_400_000), fuso);
  if (ancora === ontem) return "Ontem";

  return `${String(dia).padStart(2, "0")} de ${MESES[mes - 1]} de ${ano}`;
}

function rotuloIntervalo(inicio: Date, fim: Date, fuso: string): string {
  const a = partesNoFuso(inicio, fuso);
  // O fim é exclusivo: recua 1 segundo para nomear o último dia de fato incluído.
  const b = partesNoFuso(new Date(fim.getTime() - 1000), fuso);
  const fmt = (p: PartesData) => `${String(p.dia).padStart(2, "0")}/${String(p.mes).padStart(2, "0")}`;
  if (a.ano === b.ano) return `${fmt(a)} a ${fmt(b)}/${a.ano}`;
  return `${fmt(a)}/${a.ano} a ${fmt(b)}/${b.ano}`;
}

// ----------------------------------------------------------------------------
//  Construção dos períodos
// ----------------------------------------------------------------------------

/** Bucket adequado ao tamanho da janela — evita gráfico com 8.000 pontos. */
export function bucketPara(inicio: Date, fim: Date): BucketSerie {
  const dias = (fim.getTime() - inicio.getTime()) / 86_400_000;
  if (dias <= 2) return "hour";
  if (dias <= 92) return "day";
  if (dias <= 400) return "week";
  return "month";
}

export interface OpcoesPeriodo {
  /** Data de referência YYYY-MM-DD. Padrão: hoje no fuso da empresa. */
  ancora?: string;
  /** Só para o preset "personalizado" (ambos YYYY-MM-DD, fim inclusivo). */
  de?: string;
  ate?: string;
}

export function criarPeriodo(
  preset: PresetPeriodo,
  fuso: string = FUSO_PADRAO,
  opcoes: OpcoesPeriodo = {},
): Periodo {
  const ancora = opcoes.ancora ?? hojeNoFuso(fuso);
  const { ano, mes, dia } = partesDaAncora(ancora);

  let inicio: Date;
  let fim: Date;
  let bucket: BucketSerie;
  let rotulo: string;

  switch (preset) {
    case "dia": {
      inicio = instanteNoFuso(fuso, ano, mes, dia);
      fim = instanteNoFuso(fuso, ano, mes, dia + 1);
      bucket = "hour";
      rotulo = rotuloDia(ancora, fuso);
      break;
    }

    case "semana": {
      // Semana de segunda a domingo (padrão brasileiro de relatório).
      const meioDia = instanteNoFuso(fuso, ano, mes, dia, 12);
      const diaSemana = (meioDia.getUTCDay() + 6) % 7; // 0 = segunda
      inicio = instanteNoFuso(fuso, ano, mes, dia - diaSemana);
      fim = instanteNoFuso(fuso, ano, mes, dia - diaSemana + 7);
      bucket = "day";
      rotulo = `Semana de ${rotuloIntervalo(inicio, fim, fuso)}`;
      break;
    }

    case "mes": {
      inicio = instanteNoFuso(fuso, ano, mes, 1);
      fim = instanteNoFuso(fuso, ano, mes + 1, 1);
      bucket = "day";
      rotulo = capitalizar(`${MESES[mes - 1]} de ${ano}`);
      break;
    }

    case "ano": {
      inicio = instanteNoFuso(fuso, ano, 1, 1);
      fim = instanteNoFuso(fuso, ano + 1, 1, 1);
      bucket = "month";
      rotulo = String(ano);
      break;
    }

    case "geral": {
      // Tudo o que existir. O agregado mensal aguenta sem esforço.
      inicio = instanteNoFuso(fuso, 2000, 1, 1);
      fim = instanteNoFuso(fuso, ano, mes, dia + 1);
      bucket = "month";
      rotulo = "Todo o período";
      break;
    }

    case "personalizado": {
      const de = opcoes.de ?? ancora;
      const ate = opcoes.ate ?? ancora;
      const p1 = partesDaAncora(de);
      const p2 = partesDaAncora(ate);
      inicio = instanteNoFuso(fuso, p1.ano, p1.mes, p1.dia);
      fim = instanteNoFuso(fuso, p2.ano, p2.mes, p2.dia + 1);
      bucket = bucketPara(inicio, fim);
      rotulo = rotuloIntervalo(inicio, fim, fuso);
      break;
    }
  }

  return {
    preset,
    inicio: inicio.toISOString(),
    fim: fim.toISOString(),
    bucket,
    rotulo,
    ancora,
  };
}

/**
 * Mesma duração, imediatamente antes. É a base de toda comparação do painel
 * ("+12% vs. período anterior"), que na primeira versão estava fixa em zero.
 */
export function periodoAnterior(periodo: Periodo, fuso: string): Periodo {
  const inicio = new Date(periodo.inicio);
  const fim = new Date(periodo.fim);

  switch (periodo.preset) {
    case "dia": {
      const p = partesNoFuso(inicio, fuso);
      return criarPeriodo("dia", fuso, {
        ancora: diaNoFuso(instanteNoFuso(fuso, p.ano, p.mes, p.dia - 1, 12), fuso),
      });
    }
    case "semana": {
      const p = partesNoFuso(inicio, fuso);
      return criarPeriodo("semana", fuso, {
        ancora: diaNoFuso(instanteNoFuso(fuso, p.ano, p.mes, p.dia - 7, 12), fuso),
      });
    }
    case "mes": {
      const p = partesNoFuso(inicio, fuso);
      return criarPeriodo("mes", fuso, {
        ancora: diaNoFuso(instanteNoFuso(fuso, p.ano, p.mes - 1, 1, 12), fuso),
      });
    }
    case "ano": {
      const p = partesNoFuso(inicio, fuso);
      return criarPeriodo("ano", fuso, {
        ancora: diaNoFuso(instanteNoFuso(fuso, p.ano - 1, 1, 1, 12), fuso),
      });
    }
    default: {
      // Geral e personalizado: desloca a janela inteira para trás.
      const duracao = fim.getTime() - inicio.getTime();
      const novoInicio = new Date(inicio.getTime() - duracao);
      return {
        preset: periodo.preset,
        inicio: novoInicio.toISOString(),
        fim: inicio.toISOString(),
        bucket: periodo.bucket,
        rotulo: "Período anterior",
        ancora: diaNoFuso(novoInicio, fuso),
      };
    }
  }
}

/** Move o período uma unidade para trás (-1) ou para frente (+1). */
export function navegar(periodo: Periodo, direcao: -1 | 1, fuso: string): Periodo {
  if (periodo.preset === "geral") return periodo;

  const p = partesNoFuso(new Date(periodo.inicio), fuso);
  const passo = {
    dia: () => instanteNoFuso(fuso, p.ano, p.mes, p.dia + direcao, 12),
    semana: () => instanteNoFuso(fuso, p.ano, p.mes, p.dia + 7 * direcao, 12),
    mes: () => instanteNoFuso(fuso, p.ano, p.mes + direcao, 1, 12),
    ano: () => instanteNoFuso(fuso, p.ano + direcao, 1, 1, 12),
  } as const;

  if (periodo.preset === "personalizado") {
    const duracao = new Date(periodo.fim).getTime() - new Date(periodo.inicio).getTime();
    const novoInicio = new Date(new Date(periodo.inicio).getTime() + duracao * direcao);
    const novoFim = new Date(new Date(periodo.fim).getTime() + duracao * direcao);
    return criarPeriodo("personalizado", fuso, {
      de: diaNoFuso(novoInicio, fuso),
      ate: diaNoFuso(new Date(novoFim.getTime() - 1000), fuso),
    });
  }

  return criarPeriodo(periodo.preset, fuso, {
    ancora: diaNoFuso(passo[periodo.preset](), fuso),
  });
}

/** True quando o período já alcança o presente — desabilita o botão "próximo". */
export function ehPeriodoAtual(periodo: Periodo): boolean {
  return new Date(periodo.fim).getTime() >= Date.now();
}

export const PRESETS: { valor: PresetPeriodo; rotulo: string; atalho: string }[] = [
  { valor: "dia", rotulo: "Dia", atalho: "D" },
  { valor: "semana", rotulo: "Semana", atalho: "S" },
  { valor: "mes", rotulo: "Mês", atalho: "M" },
  { valor: "ano", rotulo: "Ano", atalho: "A" },
  { valor: "geral", rotulo: "Geral", atalho: "G" },
  { valor: "personalizado", rotulo: "Personalizado", atalho: "P" },
];

/** Serializa o período para a query string (compartilhar link do recorte). */
export function periodoParaParams(periodo: Periodo): Record<string, string> {
  return {
    preset: periodo.preset,
    ancora: periodo.ancora,
    de: periodo.inicio,
    ate: periodo.fim,
  };
}

/** Recria o período a partir da query string, com validação. */
export function periodoDeParams(
  params: URLSearchParams | Record<string, string | undefined>,
  fuso: string,
): Periodo {
  const ler = (chave: string) =>
    params instanceof URLSearchParams ? params.get(chave) : params[chave];

  const preset = (ler("preset") ?? "dia") as PresetPeriodo;
  const valido = PRESETS.some((p) => p.valor === preset);
  if (!valido) return criarPeriodo("dia", fuso);

  if (preset === "personalizado") {
    const de = ler("de");
    const ate = ler("ate");
    if (de && ate) {
      return criarPeriodo("personalizado", fuso, {
        de: diaNoFuso(new Date(de), fuso),
        ate: diaNoFuso(new Date(new Date(ate).getTime() - 1000), fuso),
      });
    }
    return criarPeriodo("dia", fuso);
  }

  return criarPeriodo(preset, fuso, { ancora: ler("ancora") ?? undefined });
}
