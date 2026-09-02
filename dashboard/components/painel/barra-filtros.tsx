"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { RotateCcw, SlidersHorizontal } from "lucide-react";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { SeletorPeriodo } from "./seletor-periodo";
import { periodoParaParams } from "@/lib/periodos";
import type { Colaborador, Dispositivo, Equipe, Escopo, Periodo } from "@/lib/tipos";

export type CampoFiltro = "equipe" | "colaborador" | "dispositivo";

interface Props {
  periodo: Periodo;
  escopo: Escopo;
  fuso: string;
  equipes?: Equipe[];
  colaboradores?: Colaborador[];
  dispositivos?: Dispositivo[];
  /** Quais seletores de escopo mostrar. Vazio = só o período. */
  campos?: CampoFiltro[];
  /** Líder de equipe não escolhe equipe: o escopo dele já é fixo. */
  travarEquipe?: boolean;
}

/**
 * Barra de filtros do painel. O estado vive na URL, não em useState — assim o
 * recorte é compartilhável por link, sobrevive ao F5 e o botão "voltar" do
 * navegador funciona como o gestor espera.
 */
export function BarraFiltros({
  periodo,
  escopo,
  fuso,
  equipes = [],
  colaboradores = [],
  dispositivos = [],
  campos = ["equipe", "colaborador"],
  travarEquipe = false,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const aplicar = useCallback(
    (mudancas: Record<string, string | null>) => {
      const novos = new URLSearchParams(params.toString());
      for (const [chave, valor] of Object.entries(mudancas)) {
        if (valor === null || valor === "" || valor === "todos") novos.delete(chave);
        else novos.set(chave, valor);
      }
      router.push(`${pathname}?${novos.toString()}`, { scroll: false });
    },
    [params, pathname, router],
  );

  function mudarPeriodo(novo: Periodo) {
    const p = periodoParaParams(novo);
    aplicar({
      preset: p.preset,
      ancora: p.ancora,
      de: novo.preset === "personalizado" ? p.de : null,
      ate: novo.preset === "personalizado" ? p.ate : null,
    });
  }

  // Trocar de equipe zera o colaborador — senão sobra um filtro de alguém que
  // não pertence à equipe escolhida e a tela volta vazia sem explicação.
  function mudarEquipe(valor: string) {
    aplicar({ equipe: valor === "todos" ? null : valor, colaborador: null });
  }

  const pessoasVisiveis = escopo.equipeId
    ? colaboradores.filter((c) => c.team_id === escopo.equipeId)
    : colaboradores;

  const mostrarEquipe = campos.includes("equipe") && !travarEquipe;
  const mostrarColaborador = campos.includes("colaborador");
  const mostrarDispositivo = campos.includes("dispositivo") && dispositivos.length > 0;
  const temEscopo = mostrarEquipe || mostrarColaborador || mostrarDispositivo;

  const temFiltro =
    !!escopo.equipeId || !!escopo.colaboradorId || !!escopo.dispositivoId;

  return (
    <section
      aria-label="Filtros do painel"
      className="flex flex-col gap-4 rounded-xl2 border border-borda vidro p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-500">
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Período
        </span>
        {temFiltro && (
          <Button
            variante="fantasma"
            tamanho="sm"
            onClick={() => aplicar({ equipe: null, colaborador: null, dispositivo: null })}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Limpar filtros
          </Button>
        )}
      </div>

      <SeletorPeriodo periodo={periodo} fuso={fuso} aoMudar={mudarPeriodo} />

      {temEscopo && (
      <div className="grid grid-cols-1 gap-3 border-t border-borda pt-4 sm:grid-cols-2 lg:grid-cols-3">
        {mostrarEquipe && (
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Equipe
            </span>
            <Select
              aria-label="Equipe"
              valor={escopo.equipeId ?? "todos"}
              aoMudar={mudarEquipe}
              opcoes={[
                { valor: "todos", rotulo: "Todas as equipes" },
                ...equipes.map((e) => ({
                  valor: e.id,
                  rotulo: e.total_pessoas ? `${e.nome} (${e.total_pessoas})` : e.nome,
                })),
              ]}
            />
          </label>
        )}

        {mostrarColaborador && (
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Colaborador
          </span>
          <Select
            aria-label="Colaborador"
            valor={escopo.colaboradorId ?? "todos"}
            aoMudar={(v) => aplicar({ colaborador: v === "todos" ? null : v })}
            opcoes={[
              { valor: "todos", rotulo: "Todos os colaboradores" },
              ...pessoasVisiveis.map((c) => ({
                valor: c.id,
                rotulo: c.nome ?? c.os_user,
              })),
            ]}
          />
        </label>
        )}

        {mostrarDispositivo && (
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Dispositivo
            </span>
            <Select
              aria-label="Dispositivo"
              valor={escopo.dispositivoId ?? "todos"}
              aoMudar={(v) => aplicar({ dispositivo: v === "todos" ? null : v })}
              opcoes={[
                { valor: "todos", rotulo: "Todos os dispositivos" },
                ...dispositivos.map((d) => ({ valor: d.id, rotulo: d.machine_name })),
              ]}
            />
          </label>
        )}
      </div>
      )}
    </section>
  );
}
