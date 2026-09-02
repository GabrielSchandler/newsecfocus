import { Settings } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AvisoErro, CabecalhoPagina } from "@/components/painel/cabecalho";
import { PainelAgente } from "./formulario-agente";
import {
  PainelClassificacao,
  PainelColaboradores,
  PainelEmpresa,
  PainelEquipes,
} from "./formularios";
import { criarClienteServidor } from "@/lib/supabase/server";
import { carregarContexto, podeAdministrar } from "@/lib/sessao";
import { comFalha, primeiroErro } from "@/lib/carregar";
import {
  buscarCategorias,
  buscarColaboradores,
  buscarEquipes,
  buscarMapeamentos,
} from "@/lib/consultas";
import { cn } from "@/lib/utils";
import type { ParamsPagina } from "@/lib/filtros-url";
import type { ConfiguracaoAgente } from "@/lib/tipos";

export const dynamic = "force-dynamic";

const ABAS = [
  { chave: "equipes", rotulo: "Equipes" },
  { chave: "pessoas", rotulo: "Colaboradores" },
  { chave: "classificacao", rotulo: "Classificação" },
  { chave: "agente", rotulo: "Agente" },
  { chave: "empresa", rotulo: "Empresa" },
] as const;

type Aba = (typeof ABAS)[number]["chave"];

export default async function PaginaAdministracao({
  searchParams,
}: {
  searchParams: Promise<ParamsPagina>;
}) {
  const params = await searchParams;
  const supabase = await criarClienteServidor();
  const contexto = await carregarContexto(supabase);

  if (!contexto) redirect("/entrar");
  if (!podeAdministrar(contexto)) redirect("/painel");

  const abaBruta = params.aba;
  const escolhida = (Array.isArray(abaBruta) ? abaBruta[0] : abaBruta) as Aba | undefined;
  const aba: Aba = ABAS.some((a) => a.chave === escolhida) ? escolhida! : "equipes";

  const org = contexto.empresa.id;

  const [equipes, colaboradores, categorias, mapeamentos, organizacao] = await Promise.all([
    comFalha(buscarEquipes(supabase, org), []),
    comFalha(buscarColaboradores(supabase, null, org), []),
    comFalha(buscarCategorias(supabase, org), []),
    comFalha(buscarMapeamentos(supabase, org), []),
    comFalha(
      (async () => {
        const { data } = await supabase
          .from("organizations")
          .select(
            "sync_interval_minutes, agente_segundos_ocioso, agente_janela_inicio, agente_janela_fim, agente_extrair_dominio, agente_mostrar_bandeja, agente_redigir_numeros, agente_tamanho_lote, agente_dias_buffer, agente_processos_sigilosos",
          )
          .eq("id", contexto.empresa.id)
          .maybeSingle();
        return (data ?? null) as ConfiguracaoAgente | null;
      })(),
      null as ConfiguracaoAgente | null,
    ),
  ]);

  const erro = primeiroErro(equipes, colaboradores, categorias, mapeamentos);

  const semEquipe = colaboradores.dados.filter((c) => !c.team_id).length;

  return (
    <div className="space-y-5">
      <CabecalhoPagina
        titulo="Administração"
        descricao="Equipes, pessoas, classificação de aplicativos e dados da empresa."
        icone={<Settings className="h-5 w-5 text-cyan-400" />}
      />

      <nav
        aria-label="Seções da administração"
        className="flex gap-1 overflow-x-auto rounded-lg border border-borda bg-fundo-suave p-1"
      >
        {ABAS.map((item) => (
          <Link
            key={item.chave}
            href={`/painel/administracao?aba=${item.chave}`}
            aria-current={aba === item.chave ? "page" : undefined}
            className={cn(
              "whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              aba === item.chave
                ? "bg-cyan-500/15 text-cyan-300"
                : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-200",
            )}
          >
            {item.rotulo}
            {item.chave === "pessoas" && semEquipe > 0 && (
              <span className="ml-1.5 rounded-full bg-amber-500/20 px-1.5 text-xs text-amber-300">
                {semEquipe}
              </span>
            )}
          </Link>
        ))}
      </nav>

      {erro && <AvisoErro mensagem={erro} />}

      {aba === "equipes" && <PainelEquipes equipes={equipes.dados} />}

      {aba === "pessoas" && (
        <PainelColaboradores
          colaboradores={colaboradores.dados}
          equipes={equipes.dados}
          jornadaPadrao={contexto.empresa.jornadaPadraoMinutos}
        />
      )}

      {aba === "classificacao" && (
        <PainelClassificacao categorias={categorias.dados} mapeamentos={mapeamentos.dados} />
      )}

      {aba === "agente" && (
        <PainelAgente
          config={organizacao.dados}
          somenteLeitura={!podeAdministrar(contexto)}
        />
      )}

      {aba === "empresa" && (
        <PainelEmpresa
          contexto={contexto}
          intervaloSync={organizacao.dados?.sync_interval_minutes ?? null}
        />
      )}
    </div>
  );
}
