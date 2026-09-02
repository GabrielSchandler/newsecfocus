"use client";

import { useCallback, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { IndicadorLed } from "./indicador-led";
import { formatarNumero } from "@/lib/formato";
import { partesNoFuso } from "@/lib/periodos";
import type { Registro } from "@/lib/tipos";

interface Props {
  linhas: Registro[];
  total: number;
  pagina: number;
  porPagina: number;
  fuso: string;
  estado: string | null;
  busca: string | null;
}

const ESTADOS = [
  { valor: "todos", rotulo: "Todos os estados" },
  { valor: "ATIVO", rotulo: "Ativo" },
  { valor: "OCIOSO", rotulo: "Ocioso" },
  { valor: "BLOQUEADO", rotulo: "Bloqueado" },
];

/**
 * Atividade minuto a minuto. É o detalhe por trás dos gráficos: quando um
 * número do consolidado parece estranho, é aqui que se descobre por quê.
 *
 * Paginado no banco, não no navegador — o período de um mês numa empresa média
 * passa de um milhão de linhas.
 */
export function TabelaRegistros({
  linhas,
  total,
  pagina,
  porPagina,
  fuso,
  estado,
  busca,
}: Props) {
  const router = useRouter();
  const caminho = usePathname();
  const params = useSearchParams();
  const [textoBusca, setTextoBusca] = useState(busca ?? "");

  const aplicar = useCallback(
    (mudancas: Record<string, string | null>) => {
      const novos = new URLSearchParams(params.toString());
      for (const [chave, valor] of Object.entries(mudancas)) {
        if (valor === null || valor === "" || valor === "todos") novos.delete(chave);
        else novos.set(chave, valor);
      }
      router.push(`${caminho}?${novos.toString()}`, { scroll: false });
    },
    [params, caminho, router],
  );

  const totalPaginas = Math.max(1, Math.ceil(total / porPagina));
  const primeira = total === 0 ? 0 : (pagina - 1) * porPagina + 1;
  const ultima = Math.min(pagina * porPagina, total);

  function horario(iso: string) {
    const p = partesNoFuso(new Date(iso), fuso);
    const dd = String(p.dia).padStart(2, "0");
    const mm = String(p.mes).padStart(2, "0");
    const hh = String(p.hora).padStart(2, "0");
    const mi = String(p.minuto).padStart(2, "0");
    return { data: `${dd}/${mm}`, hora: `${hh}:${mi}` };
  }

  return (
    <Card className="overflow-hidden">
      {/* Filtros próprios desta tela */}
      <div className="flex flex-col gap-3 border-b border-borda p-4 sm:flex-row sm:items-center">
        <Select
          aria-label="Estado"
          className="sm:w-52"
          valor={estado ?? "todos"}
          aoMudar={(v) => aplicar({ estado: v, pagina: null })}
          opcoes={ESTADOS}
        />

        <form
          className="relative flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            aplicar({ busca: textoBusca.trim() || null, pagina: null });
          }}
        >
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <Input
            value={textoBusca}
            onChange={(e) => setTextoBusca(e.target.value)}
            placeholder="Filtrar por aplicativo, site ou título da janela…"
            aria-label="Buscar nos registros"
            className="pl-9"
          />
        </form>

        <p className="shrink-0 text-xs text-slate-500">
          {total === 0
            ? "nenhum registro"
            : `${formatarNumero(primeira)}–${formatarNumero(ultima)} de ${formatarNumero(total)}`}
        </p>
      </div>

      {linhas.length === 0 ? (
        <p className="p-10 text-center text-sm text-slate-500">
          Nenhum registro no período com esses filtros. Lembre que a atividade minuto a minuto
          existe só dentro da janela de retenção da empresa — fora dela sobra o consolidado.
        </p>
      ) : (
        <>
          {/* Desktop */}
          <div className="hidden overflow-x-auto lg:block">
            <table className="w-full text-sm">
              <thead className="border-b border-borda">
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3 font-medium">Momento</th>
                  <th className="px-4 py-3 font-medium">Colaborador</th>
                  <th className="px-4 py-3 font-medium">Estação</th>
                  <th className="px-4 py-3 font-medium">Aplicativo / site</th>
                  <th className="px-4 py-3 font-medium">Estado</th>
                  <th className="px-4 py-3 text-right font-medium">Teclas</th>
                  <th className="px-4 py-3 text-right font-medium">Cliques</th>
                  <th className="px-4 py-3 text-right font-medium">Ativo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {linhas.map((l, i) => {
                  const t = horario(l.momento);
                  return (
                    <tr key={`${l.momento}-${l.colaborador}-${i}`} className="hover:bg-slate-800/30">
                      <td className="whitespace-nowrap px-4 py-2.5 tabular-nums text-slate-300">
                        <span className="text-slate-500">{t.data}</span> {t.hora}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="block truncate text-slate-200">{l.colaborador}</span>
                        <span className="block truncate text-xs text-slate-600">{l.equipe}</span>
                      </td>
                      <td className="px-4 py-2.5 text-slate-400">{l.maquina ?? "—"}</td>
                      <td className="max-w-[22rem] px-4 py-2.5">
                        <span className="block truncate text-slate-300">
                          {l.dominio ?? l.processo}
                        </span>
                        {l.titulo && (
                          <span className="block truncate text-xs text-slate-600" title={l.titulo}>
                            {l.titulo}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="flex items-center gap-2 text-xs text-slate-400">
                          <IndicadorLed
                            estado={
                              l.estado === "ATIVO"
                                ? "ativo"
                                : l.estado === "OCIOSO"
                                  ? "ocioso"
                                  : "offline"
                            }
                          />
                          {l.estado.toLowerCase()}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-slate-400">
                        {l.teclas}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-slate-400">
                        {l.cliques}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-slate-400">
                        {l.segundosAtivos}s
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Celular */}
          <ul className="divide-y divide-slate-800/70 lg:hidden">
            {linhas.map((l, i) => {
              const t = horario(l.momento);
              return (
                <li key={`${l.momento}-${l.colaborador}-m${i}`} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-100">
                        {l.colaborador}
                      </p>
                      <p className="truncate text-xs text-slate-500">
                        {l.equipe} · {l.maquina ?? "—"}
                      </p>
                    </div>
                    <span className="shrink-0 tabular-nums text-xs text-slate-400">
                      {t.data} {t.hora}
                    </span>
                  </div>
                  <p className="mt-2 truncate text-sm text-slate-300">
                    {l.dominio ?? l.processo}
                  </p>
                  {l.titulo && (
                    <p className="truncate text-xs text-slate-600">{l.titulo}</p>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <Badge
                      variante={
                        l.estado === "ATIVO"
                          ? "ativo"
                          : l.estado === "OCIOSO"
                            ? "ocioso"
                            : "offline"
                      }
                    >
                      {l.estado.toLowerCase()}
                    </Badge>
                    <span>{l.teclas} teclas</span>
                    <span>{l.cliques} cliques</span>
                    <span>{l.segundosAtivos}s ativo</span>
                  </div>
                </li>
              );
            })}
          </ul>

          {/* Paginação */}
          <div className="flex items-center justify-between gap-3 border-t border-borda p-4">
            <Button
              variante="contorno"
              tamanho="sm"
              disabled={pagina <= 1}
              onClick={() => aplicar({ pagina: pagina <= 2 ? null : String(pagina - 1) })}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Anterior
            </Button>

            <span className="text-xs text-slate-500">
              página {formatarNumero(pagina)} de {formatarNumero(totalPaginas)}
            </span>

            <Button
              variante="contorno"
              tamanho="sm"
              disabled={pagina >= totalPaginas}
              onClick={() => aplicar({ pagina: String(pagina + 1) })}
            >
              Próxima
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}
