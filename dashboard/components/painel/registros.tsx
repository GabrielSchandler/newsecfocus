"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, CalendarDays, Monitor, Search, UserRound } from "lucide-react";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { horaCurta } from "@/lib/formato";
import type { Colaborador, Dispositivo, Registro } from "@/lib/tipos";

const ESTADOS: Record<Registro["estado"], { rotulo: string; classe: string; ponto: string }> = {
  ATIVO: { rotulo: "Ativo", classe: "bg-emerald-50 text-emerald-800", ponto: "bg-emerald-500" },
  OCIOSO: { rotulo: "Ocioso", classe: "bg-amber-50 text-amber-800", ponto: "bg-amber-500" },
  BLOQUEADO: { rotulo: "Bloqueado", classe: "bg-rose-50 text-rose-800", ponto: "bg-rose-500" },
};

/** Filtros de registros: pessoa, estação, dia, estado e busca — tudo na URL. */
export function FiltrosRegistros({
  colaboradores,
  dispositivos,
  dia,
  hoje,
}: {
  colaboradores: Colaborador[];
  dispositivos: Dispositivo[];
  dia: string;
  hoje: string;
}) {
  const router = useRouter();
  const caminho = usePathname();
  const params = useSearchParams();
  const [busca, setBusca] = useState(params.get("busca") ?? "");

  function aplicar(mudancas: Record<string, string | null>) {
    const novos = new URLSearchParams(params.toString());
    novos.delete("pagina");
    // Recorte por dia: os presets de período das outras telas não valem aqui.
    for (const chave of ["preset", "ancora", "de", "ate"]) novos.delete(chave);
    for (const [k, v] of Object.entries(mudancas)) {
      if (!v || v === "todos") novos.delete(k);
      else novos.set(k, v);
    }
    router.push(`${caminho}?${novos.toString()}`, { scroll: false });
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-[1.2fr_1.2fr_0.9fr_0.8fr_1.2fr]">
      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium text-slate-600">Pessoa</span>
        <Select
          aria-label="Pessoa"
          classeCampo="h-11"
          icone={<UserRound className="h-[18px] w-[18px]" />}
          valor={params.get("colaborador") ?? "todos"}
          aoMudar={(v) => aplicar({ colaborador: v })}
          opcoes={[{ valor: "todos", rotulo: "Todas as pessoas" }, ...colaboradores.map((c) => ({ valor: c.id, rotulo: c.nome ?? c.os_user }))]}
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium text-slate-600">Dispositivo</span>
        <Select
          aria-label="Dispositivo"
          classeCampo="h-11"
          icone={<Monitor className="h-[18px] w-[18px]" />}
          valor={params.get("dispositivo") ?? "todos"}
          aoMudar={(v) => aplicar({ dispositivo: v })}
          opcoes={[{ valor: "todos", rotulo: "Todas as estações" }, ...dispositivos.map((d) => ({ valor: d.id, rotulo: d.machine_name }))]}
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium text-slate-600">Data</span>
        <span className="relative">
          <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-600" />
          <input
            type="date"
            value={dia}
            max={hoje}
            onChange={(e) => e.target.value && aplicar({ data: e.target.value })}
            className="h-11 w-full rounded-lg border border-borda bg-white pl-10 pr-3 text-sm text-slate-900 outline-none focus:border-acao/60 focus:ring-2 focus:ring-acao/15"
          />
        </span>
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium text-slate-600">Estado</span>
        <Select
          aria-label="Estado"
          classeCampo="h-11"
          valor={params.get("estado") ?? "todos"}
          aoMudar={(v) => aplicar({ estado: v })}
          opcoes={[
            { valor: "todos", rotulo: "Todos" },
            { valor: "ATIVO", rotulo: "Ativo" },
            { valor: "OCIOSO", rotulo: "Ocioso" },
            { valor: "BLOQUEADO", rotulo: "Bloqueado" },
          ]}
        />
      </label>
      <form
        className="flex flex-col gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          aplicar({ busca: busca.trim() || null });
        }}
      >
        <span className="text-[13px] font-medium text-slate-600">Processo, domínio ou título</span>
        <span className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar e Enter…"
            className="h-11 w-full rounded-lg border border-borda bg-white pl-9 pr-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-acao/60 focus:ring-2 focus:ring-acao/15"
          />
        </span>
      </form>
    </div>
  );
}

/**
 * Registros da página atual com o detalhe do selecionado ao lado. A seleção é
 * local (não muda a URL): ela só abre o que já veio do banco nesta página.
 */
export function RegistrosComDetalhe({
  linhas,
  fuso,
  colaboradorId,
}: {
  linhas: Registro[];
  fuso: string;
  /** Pessoa do filtro, se houver: vira o link "Ver pessoa". */
  colaboradorId: string | null;
}) {
  const [indice, setIndice] = useState(0);
  const atual = linhas[indice] ?? null;

  if (linhas.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-borda py-10 text-center text-sm text-slate-500">
        Nenhum registro para este filtro. Fora da retenção do dado detalhado, só o consolidado permanece.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="overflow-x-auto rounded-lg border border-borda">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="bg-slate-50 text-left text-[13px] text-slate-600">
              <th className="px-3 py-2.5 font-medium">Horário</th>
              <th className="px-3 py-2.5 font-medium">Pessoa</th>
              <th className="px-3 py-2.5 font-medium">Processo</th>
              <th className="px-3 py-2.5 font-medium">Domínio</th>
              <th className="px-3 py-2.5 font-medium">Estado</th>
              <th className="px-3 py-2.5 text-right font-medium">Seg. ativos</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l, i) => (
              <tr
                key={`${l.momento}-${l.maquina}-${l.processo}`}
                onClick={() => setIndice(i)}
                aria-selected={i === indice}
                className={cn("cursor-pointer border-t border-borda", i === indice ? "bg-acao-suave" : "hover:bg-slate-50")}
              >
                <td className="numeros-tabulares px-3 py-2">{horaCurta(l.momento, fuso)}</td>
                <td className="max-w-[160px] truncate px-3 py-2">{l.colaborador}</td>
                <td className="max-w-[160px] truncate px-3 py-2">{l.processo}</td>
                <td className="max-w-[180px] truncate px-3 py-2 text-slate-600">{l.dominio ?? "—"}</td>
                <td className="px-3 py-2">
                  <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium", ESTADOS[l.estado].classe)}>
                    <span className={cn("h-1.5 w-1.5 rounded-full", ESTADOS[l.estado].ponto)} />
                    {ESTADOS[l.estado].rotulo}
                  </span>
                </td>
                <td className="numeros-tabulares px-3 py-2 text-right">{l.segundosAtivos}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {atual && (
        <aside className="rounded-lg border border-borda p-4" aria-live="polite">
          <h3 className="text-[15px] font-semibold text-slate-900">Registro selecionado</h3>
          <dl className="mt-3 grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm">
            <dt className="text-slate-500">Horário</dt>
            <dd className="numeros-tabulares text-slate-900">{horaCurta(atual.momento, fuso)}</dd>
            <dt className="text-slate-500">Pessoa</dt>
            <dd className="truncate text-slate-900">{atual.colaborador}</dd>
            <dt className="text-slate-500">Estação</dt>
            <dd className="truncate text-slate-900">{atual.maquina ?? "—"}</dd>
            <dt className="text-slate-500">Processo</dt>
            <dd className="truncate text-slate-900">{atual.processo}</dd>
            <dt className="text-slate-500">Domínio</dt>
            <dd className="truncate text-slate-900">{atual.dominio ?? "—"}</dd>
            <dt className="text-slate-500">Estado</dt>
            <dd className="text-slate-900">{ESTADOS[atual.estado].rotulo}</dd>
            <dt className="text-slate-500">Seg. ativos</dt>
            <dd className="numeros-tabulares text-slate-900">{atual.segundosAtivos}</dd>
          </dl>
          <p className="mt-4 text-xs text-slate-500">Título registrado (já higienizado pelo agente)</p>
          <p className="mt-1 break-words text-sm text-slate-900">{atual.titulo || "—"}</p>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            {[
              ["Teclas", atual.teclas],
              ["Cliques", atual.cliques],
              ["Rolagens", atual.rolagens],
            ].map(([rotulo, valor]) => (
              <div key={rotulo as string} className="rounded-md bg-slate-50 py-2">
                <p className="text-xs text-slate-500">{rotulo}</p>
                <p className="numeros-tabulares text-base font-semibold text-slate-900">{valor as number}</p>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-slate-500">Apenas contagens — nenhum conteúdo digitado é coletado.</p>
          <Link
            href={colaboradorId ? `/painel/pessoas/${colaboradorId}` : `/painel/pessoas?busca=${encodeURIComponent(atual.colaborador)}`}
            className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-acao/70 text-sm font-medium text-acao hover:bg-acao-suave"
          >
            Ver pessoa
            <ArrowRight className="h-4 w-4" />
          </Link>
        </aside>
      )}
    </div>
  );
}
