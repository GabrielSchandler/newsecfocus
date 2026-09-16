import Link from "next/link";
import { AppWindow, Globe } from "lucide-react";
import { ClassificarAplicativo } from "./classificar-aplicativo";
import { Paginacao, SeloCategoria, TabelaSimples } from "./kit";
import { formatarDuracao } from "@/lib/formato";
import type { Categoria, LinhaAplicativo } from "@/lib/tipos";

/**
 * Lista de aplicativos e sites do período, paginada no banco. Usada na tela de
 * Aplicativos e nas abas de equipe e pessoa — sempre a mesma tabela.
 */
export function ListaAplicativos({
  linhas,
  total,
  pagina,
  porPagina,
  hrefPagina,
  recorte,
  categorias,
  admin,
  vazio = "Nenhum aplicativo ou site no filtro escolhido.",
}: {
  linhas: LinhaAplicativo[];
  total: number;
  pagina: number;
  porPagina: number;
  hrefPagina: (pagina: number) => string;
  recorte: string;
  categorias: Categoria[];
  admin: boolean;
  vazio?: string;
}) {
  if (linhas.length === 0) {
    return <p className="rounded-lg border border-dashed border-borda py-8 text-center text-sm text-slate-500">{vazio}</p>;
  }

  return (
    <>
      <TabelaSimples minimo="min-w-[680px]">
        <thead>
          <tr>
            <th>Aplicativo / domínio</th>
            <th>Categoria</th>
            <th className="!text-right">Tempo ativo</th>
            <th className="!text-right">Pessoas</th>
            <th className="!text-right">Dias</th>
            {admin && <th className="!text-right">Ação</th>}
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => {
            const Icone = l.ehSite ? Globe : AppWindow;
            return (
              <tr key={l.alvo} className="hover:bg-slate-50">
                <td>
                  <Link
                    href={`/painel/aplicativos/${encodeURIComponent(l.alvo)}${recorte}`}
                    className="flex min-w-0 items-center gap-2 font-medium text-slate-900 hover:text-acao hover:underline"
                  >
                    <Icone className="h-4 w-4 shrink-0 text-slate-400" />
                    <span className="truncate">{l.alvo}</span>
                  </Link>
                </td>
                <td>
                  <SeloCategoria tipo={l.tipo} />
                  {l.tipo && !l.regraPor && (
                    <span className="ml-2 text-xs text-slate-400" title="Categoria herdada da regra do processo (ex.: navegador)">
                      pela regra do processo
                    </span>
                  )}
                </td>
                <td className="numeros-tabulares text-right">{formatarDuracao(l.minutos)}</td>
                <td className="numeros-tabulares text-right">{l.pessoas}</td>
                <td className="numeros-tabulares text-right">{l.dias}</td>
                {admin && (
                  <td className="text-right">
                    <ClassificarAplicativo
                      alvo={l.alvo}
                      ehSite={l.ehSite}
                      mapeamentoId={l.mapeamentoId}
                      categoriaId={l.categoriaId}
                      categorias={categorias}
                    />
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </TabelaSimples>
      <Paginacao pagina={pagina} porPagina={porPagina} total={total} href={hrefPagina} rotuloItens="itens" />
    </>
  );
}
