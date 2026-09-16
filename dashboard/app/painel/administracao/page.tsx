import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Building2, CalendarClock, Settings2, UserPlus } from "lucide-react";
import { AbasPainel } from "@/components/painel/abas-painel";
import { AvisoErro, CabecalhoPagina } from "@/components/painel/cabecalho";
import { Card } from "@/components/ui/card";
import { PainelAgente } from "./formulario-agente";
import { PainelExpediente } from "./expediente";
import { PainelUsuarios } from "./usuarios";
import { PainelClassificacao, PainelColaboradores, PainelEmpresa, PainelEquipes } from "./formularios";
import { criarClienteServidor } from "@/lib/supabase/server";
import { carregarContexto, podeAdministrar } from "@/lib/sessao";
import { comFalha, primeiroErro } from "@/lib/carregar";
import {
  CATALOGO_VAZIO,
  buscarCatalogoApps,
  buscarCategorias,
  buscarColaboradores,
  buscarEquipes,
  buscarEscalas,
  buscarMapeamentos,
  buscarUsuariosAcesso,
} from "@/lib/consultas";
import { formatarCodigoInstalacao } from "@/lib/formato";
import type { ParamsPagina } from "@/lib/filtros-url";
import type { ConfiguracaoAgente, LinhaEscala } from "@/lib/tipos";

export const dynamic = "force-dynamic";

const ABAS = [
  { chave: "empresa", rotulo: "Empresa" },
  { chave: "equipes", rotulo: "Equipes" },
  { chave: "pessoas", rotulo: "Pessoas" },
  { chave: "escalas", rotulo: "Escalas" },
  { chave: "acessos", rotulo: "Acessos" },
  { chave: "classificacao", rotulo: "Classificação" },
  { chave: "agente", rotulo: "Agente" },
] as const;

type Aba = (typeof ABAS)[number]["chave"];

/** Nomes antigos das abas, para links salvos continuarem abrindo o lugar certo. */
const APELIDOS: Record<string, Aba> = { expediente: "escalas", usuarios: "acessos" };

const hora = (v: string | null) => (v ? v.slice(0, 5) : null);

export default async function PaginaAdministracao({
  searchParams,
}: {
  searchParams: Promise<ParamsPagina>;
}) {
  const params = await searchParams;
  const supabase = await criarClienteServidor();
  const contexto = await carregarContexto(supabase);

  if (!contexto) redirect("/entrar");
  // A página some para quem não administra; as ações conferem o papel de novo
  // no servidor, e o RLS confere no banco.
  if (!podeAdministrar(contexto)) redirect("/painel");

  const bruta = Array.isArray(params.aba) ? params.aba[0] : params.aba;
  const escolhida = bruta ? (APELIDOS[bruta] ?? bruta) : undefined;
  const aba: Aba = ABAS.some((a) => a.chave === escolhida) ? (escolhida as Aba) : "empresa";

  const org = contexto.empresa.id;

  const [equipes, colaboradores, categorias, mapeamentos, catalogo, organizacao, usuarios, escalas] = await Promise.all([
    comFalha(buscarEquipes(supabase, org), []),
    comFalha(buscarColaboradores(supabase, null, org), []),
    comFalha(buscarCategorias(supabase, org), []),
    comFalha(buscarMapeamentos(supabase, org), []),
    comFalha(buscarCatalogoApps(supabase, org), CATALOGO_VAZIO),
    comFalha(
      (async () => {
        const { data } = await supabase
          .from("organizations")
          .select(
            "contato_email, sync_interval_minutes, agente_segundos_ocioso, agente_janela_inicio, agente_janela_fim, agente_extrair_dominio, agente_mostrar_bandeja, agente_redigir_numeros, agente_tamanho_lote, agente_dias_buffer, agente_processos_sigilosos",
          )
          .eq("id", contexto.empresa.id)
          .maybeSingle();
        return (data ?? null) as (ConfiguracaoAgente & { contato_email: string | null }) | null;
      })(),
      null as (ConfiguracaoAgente & { contato_email: string | null }) | null,
    ),
    comFalha(buscarUsuariosAcesso(supabase, org), []),
    comFalha(buscarEscalas(supabase, org), []),
  ]);

  const erro = primeiroErro(equipes, colaboradores, categorias, mapeamentos, catalogo);
  const pendentes = colaboradores.dados.filter((c) => !c.team_id || !c.perfil_completo).length;

  return (
    <div className="space-y-4 sm:space-y-5">
      <CabecalhoPagina
        titulo="Administração"
        descricao="Gerencie a empresa, as equipes, as pessoas, as escalas, os acessos e o agente."
        acoes={
          <Link
            href="/painel/administracao?aba=acessos#convite"
            className="inline-flex h-11 items-center gap-2 rounded-lg bg-acao px-4 text-[15px] font-medium text-white hover:bg-acao-escuro"
          >
            <UserPlus className="h-[18px] w-[18px]" />
            Convidar usuário
          </Link>
        }
      />

      <AbasPainel
        param="aba"
        ativa={aba}
        variante="sublinhado"
        abas={ABAS.map((a) => ({
          ...a,
          selo: a.chave === "pessoas" ? pendentes : a.chave === "classificacao" ? catalogo.dados.linhas.filter((l) => !l.categoryId).length : undefined,
        }))}
      />

      {erro && <AvisoErro mensagem={erro} />}

      {aba === "empresa" && (
        <PainelEmpresa
          contexto={contexto}
          intervaloSync={organizacao.dados?.sync_interval_minutes ?? null}
          contatoEmail={organizacao.dados?.contato_email ?? null}
        />
      )}

      {aba === "equipes" && <PainelEquipes equipes={equipes.dados} />}

      {aba === "pessoas" && (
        <PainelColaboradores
          colaboradores={colaboradores.dados}
          equipes={equipes.dados}
          jornadaPadrao={contexto.empresa.jornadaPadraoMinutos}
        />
      )}

      {aba === "escalas" && (
        <PainelExpediente equipes={equipes.dados} colaboradores={colaboradores.dados} escalas={escalas.dados} />
      )}

      {aba === "acessos" && (
        <PainelUsuarios
          usuarios={usuarios.dados}
          equipes={equipes.dados}
          papelAtual={contexto.papel}
          usuarioAtual={contexto.usuarioId}
        />
      )}

      {aba === "classificacao" && (
        <PainelClassificacao categorias={categorias.dados} mapeamentos={mapeamentos.dados} catalogo={catalogo.dados} />
      )}

      {aba === "agente" && <PainelAgente config={organizacao.dados} somenteLeitura={!podeAdministrar(contexto)} />}

      {/* Resumo das configurações que mais mudam a leitura dos números. */}
      {!["empresa", "escalas", "agente"].includes(aba) && (
        <div className="grid grid-cols-1 gap-4 pt-2 lg:grid-cols-3">
          <Resumo
            icone={<CalendarClock className="h-6 w-6 text-acao" strokeWidth={1.75} />}
            titulo="Escalas"
            subtitulo="Pessoa → Equipe → Empresa"
            href="/painel/administracao?aba=escalas"
            itens={resumoEscala(escalas.dados)}
          />
          <Resumo
            icone={<Settings2 className="h-6 w-6 text-acao" strokeWidth={1.75} />}
            titulo="Agente"
            href="/painel/administracao?aba=agente"
            itens={[
              ["Envio de dados", organizacao.dados?.sync_interval_minutes ? `a cada ${organizacao.dados.sync_interval_minutes} min` : "padrão do agente (5 min)"],
              ["Ociosidade", organizacao.dados ? `${organizacao.dados.agente_segundos_ocioso} s sem interação` : "—"],
            ]}
          />
          <Resumo
            icone={<Building2 className="h-6 w-6 text-acao" strokeWidth={1.75} />}
            titulo="Empresa"
            href="/painel/administracao?aba=empresa"
            itens={[
              ["Fuso horário", contexto.empresa.fuso],
              ["Retenção de detalhe", `${contexto.empresa.retencaoDias} dias`],
              ["Código da empresa", formatarCodigoInstalacao(contexto.empresa.codigoInstalacao).replace(/\d/g, "•")],
            ]}
          />
        </div>
      )}
    </div>
  );
}

function resumoEscala(escalas: LinhaEscala[]): [string, string][] {
  const empresa = escalas.filter((e) => e.escopo === "EMPRESA" && e.trabalha).sort((a, b) => a.diaSemana - b.diaSemana)[0];
  const personalizadas = new Set(escalas.filter((e) => e.escopo !== "EMPRESA").map((e) => e.equipeId ?? e.colaboradorId)).size;
  return [
    ["Horário padrão", empresa ? `${hora(empresa.inicio)} – ${hora(empresa.fim)}` : "08:00 – 18:00 (padrão)"],
    ["Intervalo", empresa?.intervaloInicio ? `${hora(empresa.intervaloInicio)} – ${hora(empresa.intervaloFim)}` : empresa ? "sem intervalo" : "12:00 – 13:00 (padrão)"],
    ["Personalizadas", `${personalizadas} ${personalizadas === 1 ? "equipe ou pessoa" : "equipes ou pessoas"}`],
  ];
}

function Resumo({
  icone,
  titulo,
  subtitulo,
  href,
  itens,
}: {
  icone: React.ReactNode;
  titulo: string;
  subtitulo?: string;
  href: string;
  itens: [string, string][];
}) {
  return (
    <Card className="flex flex-col p-5">
      <div className="flex items-start gap-3">
        {icone}
        <div>
          <h2 className="text-[15px] font-semibold text-slate-900">{titulo}</h2>
          {subtitulo && <p className="text-xs text-slate-500">{subtitulo}</p>}
        </div>
      </div>
      <dl className="mt-4 flex-1 space-y-2 text-sm">
        {itens.map(([k, v]) => (
          <div key={k} className="flex items-center justify-between gap-3">
            <dt className="text-slate-500">{k}</dt>
            <dd className="numeros-tabulares text-right text-slate-900">{v}</dd>
          </div>
        ))}
      </dl>
      <Link
        href={href}
        className="mt-4 inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-acao/70 text-sm font-medium text-acao hover:bg-acao-suave"
      >
        Editar
        <ArrowRight className="h-4 w-4" />
      </Link>
    </Card>
  );
}
