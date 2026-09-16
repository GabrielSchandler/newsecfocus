// ============================================================================
//  Peças comuns das telas do painel.
//
//  Tudo aqui é componente de servidor sem estado: cartão de indicador, seção,
//  aviso com ação, selos, barra de progresso, barras horizontais, paginação por
//  URL e avatar. Centralizar é o que impede cada tela de ter um raio de borda,
//  um cinza e um tamanho de número ligeiramente diferente.
// ============================================================================

import * as React from "react";
import Link from "next/link";
import { AlertCircle, AlertTriangle, ArrowRight, ChevronLeft, ChevronRight, Info } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { CORES_CATEGORIA, ROTULOS_CATEGORIA } from "@/lib/cores-expediente";
import type { TipoCategoria } from "@/lib/tipos";

type Icone = React.ReactElement<{ className?: string; strokeWidth?: number }>;

const comClasse = (icone: Icone, className: string) =>
  React.cloneElement(icone, { className, strokeWidth: 1.75 });

// ----------------------------------------------------------------------------
//  Indicadores
// ----------------------------------------------------------------------------

export function GradeIndicadores({
  children,
  colunas = 4,
  className,
}: {
  children: React.ReactNode;
  colunas?: 3 | 4;
  className?: string;
}) {
  return (
    <section
      aria-label="Indicadores"
      className={cn(
        "grid grid-cols-2 gap-3 sm:gap-4",
        colunas === 4 ? "xl:grid-cols-4" : "lg:grid-cols-3",
        className,
      )}
    >
      {children}
    </section>
  );
}

/**
 * Cartão de indicador: nome, valor, e uma linha que diz o que o número é ou
 * com o que se compara. `definicao` vira a dica do ícone de informação — o
 * gestor pergunta "isso é o quê?" antes de perguntar "isso é bom?".
 */
export function Indicador({
  icone,
  rotulo,
  valor,
  rodape,
  definicao,
  compacto = false,
  tom = "normal",
}: {
  icone: Icone;
  rotulo: string;
  valor: React.ReactNode;
  rodape?: React.ReactNode;
  definicao?: string;
  /** Versão de linha única (ícone à esquerda), usada em telas de cadastro. */
  compacto?: boolean;
  tom?: "normal" | "alerta";
}) {
  if (compacto) {
    return (
      <Card className="flex flex-col items-start gap-3 p-4 sm:flex-row sm:items-center sm:gap-4 sm:p-5">
        <span
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg sm:h-11 sm:w-11",
            tom === "alerta" ? "bg-rose-50 text-rose-600" : "bg-acao-suave text-acao",
          )}
        >
          {comClasse(icone, "h-5 w-5 sm:h-6 sm:w-6")}
        </span>
        <div className="min-w-0">
          <p className="numeros-tabulares whitespace-nowrap text-[22px] font-bold leading-none tracking-tight text-tinta sm:text-[26px]">{valor}</p>
          <p className="mt-1 text-sm text-slate-600" title={definicao}>
            {rotulo}
          </p>
          {rodape && <p className="text-xs text-slate-500">{rodape}</p>}
        </div>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col p-4 sm:p-5 sm:px-6">
      <span
        className="flex items-start gap-2 text-[13px] font-semibold leading-snug text-slate-800 sm:items-center sm:gap-2.5 sm:text-[15px] xl:text-[14px] 2xl:text-[15px]"
        title={definicao}
      >
        {comClasse(icone, cn("h-5 w-5 shrink-0 sm:h-6 sm:w-6", tom === "alerta" ? "text-rose-600" : "text-acao"))}
        <span className="min-w-0">
          {rotulo}
          {definicao && (
            <Info aria-label={definicao} className="ml-1 hidden h-3.5 w-3.5 -translate-y-px align-middle text-slate-400 sm:inline" />
          )}
        </span>
      </span>
      <p className="numeros-tabulares mt-3 whitespace-nowrap text-[1.7rem] font-bold leading-none tracking-tight text-tinta sm:mt-3.5 sm:text-[2.5rem] xl:text-[2.1rem] 2xl:text-[2.6rem]">
        {valor}
      </p>
      {rodape && <div className="mt-3 text-xs leading-snug text-slate-500 sm:mt-3.5 sm:text-sm">{rodape}</div>}
    </Card>
  );
}

/** "▲ +4 p.p. vs mês anterior" — ou "sem base de comparação". */
export function Variacao({
  valor,
  rotulo,
  semBase = "sem base de comparação",
}: {
  valor: number | null;
  rotulo?: string | null;
  semBase?: string;
}) {
  if (valor === null) return <span className="text-slate-500">{semBase}</span>;
  const neutro = Math.abs(valor) < 0.05;
  const cor = neutro ? "text-slate-500" : valor > 0 ? "text-emerald-700" : "text-rose-700";
  const numero = Math.abs(valor).toFixed(1).replace(".", ",").replace(/,0$/, "");
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1.5">
      <span className={cn("inline-flex items-center gap-1 font-semibold", cor)}>
        {!neutro && <span aria-hidden className="text-[10px] leading-none">{valor > 0 ? "▲" : "▼"}</span>}
        {valor > 0 ? "+" : valor < 0 ? "−" : ""}
        {numero} p.p.
      </span>
      {rotulo && <span className="text-slate-500">{rotulo}</span>}
    </span>
  );
}

// ----------------------------------------------------------------------------
//  Seção (cartão com título)
// ----------------------------------------------------------------------------

export function Secao({
  icone,
  titulo,
  subtitulo,
  acao,
  children,
  rodape,
  className,
  corpoClassName,
}: {
  icone?: Icone;
  titulo: string;
  subtitulo?: React.ReactNode;
  acao?: React.ReactNode;
  children: React.ReactNode;
  rodape?: React.ReactNode;
  className?: string;
  corpoClassName?: string;
}) {
  return (
    <Card className={cn("flex min-w-0 flex-col p-5 sm:px-6", className)}>
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="flex min-w-0 flex-1 basis-[12rem] items-start gap-3">
          {icone && comClasse(icone, "mt-0.5 h-6 w-6 shrink-0 text-acao")}
          <div className="min-w-0">
            <h2 className="text-[17px] font-semibold text-slate-900">{titulo}</h2>
            {subtitulo && <p className="mt-0.5 text-sm text-slate-500">{subtitulo}</p>}
          </div>
        </div>
        {acao && <div className="shrink-0">{acao}</div>}
      </div>
      <div className={cn("mt-4 min-w-0 flex-1", corpoClassName)}>{children}</div>
      {rodape && <div className="mt-4 text-xs leading-relaxed text-slate-500">{rodape}</div>}
    </Card>
  );
}

/** Link de ação "Texto →" usado em seções, avisos e listas. */
export function LinkAcao({
  href,
  children,
  className,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn("inline-flex shrink-0 items-center gap-1.5 text-sm font-medium text-acao hover:underline", className)}
    >
      {children}
      <ArrowRight className="h-4 w-4" />
    </Link>
  );
}

// ----------------------------------------------------------------------------
//  Aviso com ação
// ----------------------------------------------------------------------------

const TONS_AVISO = {
  atencao: { caixa: "border-amber-200 bg-amber-50", icone: "text-amber-500", titulo: "text-amber-900", Icone: AlertTriangle },
  info: { caixa: "border-acao/25 bg-acao-suave", icone: "text-acao", titulo: "text-slate-900", Icone: Info },
  erro: { caixa: "border-rose-200 bg-rose-50", icone: "text-rose-600", titulo: "text-rose-900", Icone: AlertCircle },
} as const;

/**
 * Faixa compacta: o que é (rótulo), o que está acontecendo e onde resolver.
 * Sem botão de "resolver" que não resolve nada — a ação sempre leva a uma tela.
 */
export function Aviso({
  tom = "atencao",
  titulo,
  children,
  acao,
  className,
}: {
  tom?: keyof typeof TONS_AVISO;
  titulo?: string;
  children: React.ReactNode;
  acao?: { href: string; rotulo: string };
  className?: string;
}) {
  const t = TONS_AVISO[tom];
  return (
    <div
      role="status"
      className={cn(
        "flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl2 border px-4 py-3 sm:flex-nowrap sm:px-5",
        t.caixa,
        className,
      )}
    >
      <span className="flex shrink-0 items-center gap-3">
        <t.Icone className={cn("h-5 w-5", t.icone)} strokeWidth={2} />
        {titulo && <span className={cn("text-sm font-semibold", t.titulo)}>{titulo}</span>}
      </span>
      {titulo && <span className="hidden h-6 border-l border-black/10 sm:block" aria-hidden />}
      <div className="min-w-0 flex-1 basis-full text-sm text-slate-700 sm:basis-auto">{children}</div>
      {acao && (
        <Link
          href={acao.href}
          className={cn("flex shrink-0 items-center gap-1.5 text-sm font-medium hover:underline", t.titulo)}
        >
          {acao.rotulo}
          <ArrowRight className="h-4 w-4" />
        </Link>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------
//  Selos
// ----------------------------------------------------------------------------

export function SeloCategoria({ tipo, className }: { tipo: TipoCategoria | null; className?: string }) {
  const chave = tipo ?? "SEM";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-medium",
        tipo === "PRODUCTIVE" && "border-emerald-200 bg-emerald-50 text-emerald-800",
        tipo === "NEUTRAL" && "border-slate-200 bg-slate-50 text-slate-700",
        tipo === "UNPRODUCTIVE" && "border-rose-200 bg-rose-50 text-rose-800",
        tipo === null && "border-slate-200 bg-white text-slate-500",
        className,
      )}
    >
      <span className="h-2 w-2 rounded-full" style={{ background: CORES_CATEGORIA[chave] }} />
      {ROTULOS_CATEGORIA[chave]}
    </span>
  );
}

export function Selo({
  tom,
  children,
  className,
}: {
  tom: "sucesso" | "atencao" | "erro" | "neutro" | "info";
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium",
        tom === "sucesso" && "bg-emerald-50 text-emerald-800",
        tom === "atencao" && "bg-amber-50 text-amber-800",
        tom === "erro" && "bg-rose-50 text-rose-800",
        tom === "neutro" && "bg-slate-100 text-slate-600",
        tom === "info" && "bg-acao-suave text-acao",
        className,
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          tom === "sucesso" && "bg-emerald-500",
          tom === "atencao" && "bg-amber-500",
          tom === "erro" && "bg-rose-500",
          tom === "neutro" && "bg-slate-400",
          tom === "info" && "bg-acao",
        )}
      />
      {children}
    </span>
  );
}

// ----------------------------------------------------------------------------
//  Barras
// ----------------------------------------------------------------------------

/** Barra de progresso com o número ao lado ("▬▬▬▬░░ 66%"). */
export function BarraPercentual({
  valor,
  cor,
  className,
  largura = "min-w-[72px]",
}: {
  valor: number | null;
  cor?: string;
  className?: string;
  largura?: string;
}) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <span className={cn("h-2 w-full overflow-hidden rounded-full bg-slate-100", largura)}>
        <span
          className={cn("block h-full rounded-full", !cor && "bg-marca")}
          style={{ width: `${Math.max(0, Math.min(100, valor ?? 0))}%`, background: cor }}
        />
      </span>
      <span className="numeros-tabulares w-10 shrink-0 text-right text-sm font-medium text-slate-800">
        {valor === null ? "—" : `${Math.round(valor)}%`}
      </span>
    </div>
  );
}

/** Lista de barras horizontais: rótulo, barra proporcional ao maior, valor e %. */
export function BarrasHorizontais({
  itens,
  vazio = "Nada no período.",
}: {
  itens: {
    chave: string;
    rotulo: React.ReactNode;
    valor: number;
    texto: string;
    percentual?: number | null;
    href?: string;
    cor?: string;
  }[];
  vazio?: string;
}) {
  if (itens.length === 0) return <p className="text-sm text-slate-500">{vazio}</p>;
  const maior = Math.max(...itens.map((i) => i.valor), 1);
  return (
    <ul className="space-y-3">
      {itens.map((i) => {
        const conteudo = (
          <>
            <span className="min-w-0 truncate text-sm text-slate-800">{i.rotulo}</span>
            <span className="h-2.5 overflow-hidden rounded-full bg-slate-100">
              <span
                className="block h-full rounded-full bg-marca"
                style={{ width: `${(i.valor / maior) * 100}%`, background: i.cor }}
              />
            </span>
            <span className="numeros-tabulares whitespace-nowrap text-right text-sm font-medium text-slate-800">
              {i.texto}
            </span>
            {i.percentual !== undefined && (
              <span className="numeros-tabulares text-right text-xs text-slate-500">
                {i.percentual === null ? "—" : `${Math.round(i.percentual)}%`}
              </span>
            )}
          </>
        );
        const grade = cn(
          "grid items-center gap-3",
          i.percentual !== undefined
            ? "grid-cols-[minmax(0,9rem)_minmax(0,1fr)_4.5rem_2.5rem]"
            : "grid-cols-[minmax(0,9rem)_minmax(0,1fr)_4.5rem]",
        );
        return (
          <li key={i.chave}>
            {i.href ? (
              <Link href={i.href} className={cn(grade, "rounded-md transition-colors hover:bg-slate-50")}>
                {conteudo}
              </Link>
            ) : (
              <div className={grade}>{conteudo}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

// ----------------------------------------------------------------------------
//  Tabela simples e paginação por URL
// ----------------------------------------------------------------------------

/** Moldura de tabela: cabeçalho cinza claro e rolagem horizontal controlada. */
export function TabelaSimples({
  children,
  minimo = "min-w-[640px]",
  className,
}: {
  children: React.ReactNode;
  minimo?: string;
  className?: string;
}) {
  return (
    <div className={cn("overflow-x-auto rounded-lg border border-borda", className)}>
      <table
        className={cn(
          "w-full text-sm [&_tbody_tr]:border-t [&_tbody_tr]:border-borda [&_td]:px-3 [&_td]:py-2.5 [&_th]:px-3 [&_th]:py-2.5 [&_th]:text-left [&_th]:text-[13px] [&_th]:font-medium [&_th]:text-slate-600 [&_thead_tr]:bg-slate-50",
          minimo,
        )}
      >
        {children}
      </table>
    </div>
  );
}

/**
 * Paginação que vive na URL (?pagina=). O banco devolve só a página pedida,
 * então nada de baixar a lista inteira para fatiar no navegador.
 */
export function Paginacao({
  pagina,
  porPagina,
  total,
  href,
  rotuloItens = "registros",
}: {
  pagina: number;
  porPagina: number;
  total: number;
  href: (pagina: number) => string;
  rotuloItens?: string;
}) {
  const paginas = Math.max(1, Math.ceil(total / porPagina));
  if (total === 0) return null;
  const de = (pagina - 1) * porPagina + 1;
  const ate = Math.min(total, pagina * porPagina);

  const numeros: (number | "…")[] = [];
  for (let p = 1; p <= paginas; p++) {
    if (p === 1 || p === paginas || Math.abs(p - pagina) <= 1) numeros.push(p);
    else if (numeros[numeros.length - 1] !== "…") numeros.push("…");
  }

  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
      <p className="numeros-tabulares text-[13px] text-slate-500">
        Exibindo {de}–{ate} de {total} {rotuloItens}
      </p>
      {paginas > 1 && (
        <nav aria-label="Paginação" className="flex items-center gap-1">
          <PaginaLink href={href(pagina - 1)} desabilitado={pagina <= 1} rotulo="Página anterior">
            <ChevronLeft className="h-4 w-4" />
          </PaginaLink>
          {numeros.map((n, i) =>
            n === "…" ? (
              <span key={`r${i}`} className="px-1.5 text-sm text-slate-400">
                …
              </span>
            ) : (
              <Link
                key={n}
                href={href(n)}
                aria-current={n === pagina ? "page" : undefined}
                className={cn(
                  "flex h-8 min-w-8 items-center justify-center rounded-md px-2 text-sm",
                  n === pagina ? "bg-acao font-medium text-white" : "text-slate-700 hover:bg-slate-100",
                )}
              >
                {n}
              </Link>
            ),
          )}
          <PaginaLink href={href(pagina + 1)} desabilitado={pagina >= paginas} rotulo="Próxima página">
            <ChevronRight className="h-4 w-4" />
          </PaginaLink>
        </nav>
      )}
    </div>
  );
}

function PaginaLink({
  href,
  desabilitado,
  rotulo,
  children,
}: {
  href: string;
  desabilitado: boolean;
  rotulo: string;
  children: React.ReactNode;
}) {
  if (desabilitado) {
    return (
      <span aria-disabled className="flex h-8 w-8 items-center justify-center rounded-md text-slate-300">
        {children}
      </span>
    );
  }
  return (
    <Link href={href} aria-label={rotulo} className="flex h-8 w-8 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100">
      {children}
    </Link>
  );
}

/** Cabeçalho de coluna ordenável por URL (?ordem=&dir=). */
export function ColunaOrdenavel({
  rotulo,
  chave,
  ordemAtual,
  decrescente,
  href,
  alinhar = "esquerda",
  className,
}: {
  rotulo: string;
  chave: string;
  ordemAtual: string;
  decrescente: boolean;
  href: (ordem: string, decrescente: boolean) => string;
  alinhar?: "esquerda" | "direita";
  className?: string;
}) {
  const ativa = ordemAtual === chave;
  return (
    <th
      scope="col"
      aria-sort={ativa ? (decrescente ? "descending" : "ascending") : "none"}
      className={cn(alinhar === "direita" && "!text-right", className)}
    >
      <Link
        href={href(chave, ativa ? !decrescente : chave !== "nome" && chave !== "equipe")}
        className={cn("inline-flex items-center gap-1 hover:text-slate-900", ativa && "text-slate-900")}
      >
        {rotulo}
        {ativa && <span aria-hidden className="text-[10px]">{decrescente ? "▼" : "▲"}</span>}
      </Link>
    </th>
  );
}

// ----------------------------------------------------------------------------
//  Avatar
// ----------------------------------------------------------------------------

export function iniciais(nome: string): string {
  const partes = nome.split("@")[0].trim().split(/[\s._-]+/).filter(Boolean);
  if (partes.length >= 2) return `${partes[0][0]}${partes[partes.length - 1][0]}`.toUpperCase();
  return nome.slice(0, 2).toUpperCase();
}

export function Avatar({ nome, tamanho = "sm" }: { nome: string; tamanho?: "sm" | "lg" }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-slate-200 font-semibold text-slate-700",
        tamanho === "sm" ? "h-8 w-8 text-xs" : "h-14 w-14 text-lg",
      )}
    >
      {iniciais(nome)}
    </span>
  );
}
