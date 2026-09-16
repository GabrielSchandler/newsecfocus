import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, CheckCircle2, Download, Layers, Monitor, Search } from "lucide-react";
import { AbasPainel } from "@/components/painel/abas-painel";
import { AvisoErro, CabecalhoPagina, EstadoVazio } from "@/components/painel/cabecalho";
import { DiarioEstacao } from "@/components/painel/diario-estacao";
import { Aviso, GradeIndicadores, Indicador, Secao, Selo, TabelaSimples } from "@/components/painel/kit";
import { criarClienteServidor } from "@/lib/supabase/server";
import { carregarContexto, podeAdministrar } from "@/lib/sessao";
import { comFalha } from "@/lib/carregar";
import { buscarDiarioEstacao, buscarEstacoes } from "@/lib/consultas";
import { lerFiltros, orgEfetiva, type ParamsPagina } from "@/lib/filtros-url";
import { dataCurta, formatarDuracao, horaCurta } from "@/lib/formato";
import { cn } from "@/lib/utils";
import type { Estacao } from "@/lib/tipos";

export const dynamic = "force-dynamic";

const DIAS_DIARIO = 7;
const texto = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

function SeloSituacao({ e }: { e: Estacao }) {
  if (e.situacao === "RECENTE") return <Selo tom="sucesso">Recente</Selo>;
  if (e.situacao === "SEM_ENVIO") return <Selo tom="neutro">Nunca enviou</Selo>;
  return <Selo tom={e.emExpedienteAgora ? "atencao" : "neutro"}>Sem envio recente</Selo>;
}

export default async function PaginaDispositivos({
  searchParams,
}: {
  searchParams: Promise<ParamsPagina>;
}) {
  const params = await searchParams;
  const supabase = await criarClienteServidor();
  const contexto = await carregarContexto(supabase);

  if (!contexto) redirect("/entrar");

  const { escopo } = lerFiltros(params, contexto);
  const orgId = orgEfetiva(contexto, escopo);
  const fuso = contexto.empresa.fuso;
  const admin = podeAdministrar(contexto);

  const estacoes = await comFalha(buscarEstacoes(supabase, escopo.orgId), []);
  const todas = estacoes.dados;
  const busca = texto(params.busca)?.trim().toLowerCase() || "";
  const situacao = texto(params.situacao) === "atrasadas" ? "atrasadas" : "todas";

  const filtradas = todas.filter(
    (e) =>
      (situacao === "todas" || e.situacao !== "RECENTE") &&
      (!busca ||
        [e.maquina, e.usuarioWindows, e.colaborador].some((v) => v?.toLowerCase().includes(busca))),
  );
  const pedida = texto(params.estacao);
  const selecionada =
    todas.find((e) => e.id === pedida) ?? filtradas.find((e) => e.situacao !== "RECENTE") ?? filtradas[0] ?? null;

  const diario = selecionada
    ? await comFalha(buscarDiarioEstacao(supabase, orgId, DIAS_DIARIO, selecionada.id), [])
    : { dados: [], erro: null };

  const limiar = todas[0]?.limiarMinutos ?? null;
  const atrasadas = todas.filter((e) => e.situacao !== "RECENTE");
  const noExpediente = atrasadas.filter((e) => e.emExpedienteAgora);
  const versoes = new Set(todas.map((e) => e.versao).filter(Boolean));
  const versaoMaisComum = [...versoes].sort(
    (a, b) => todas.filter((e) => e.versao === b).length - todas.filter((e) => e.versao === a).length,
  )[0];

  const hrefCom = (mudancas: Record<string, string | null>) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      const valor = texto(v);
      if (valor) u.set(k, valor);
    }
    for (const [k, v] of Object.entries(mudancas)) {
      if (v === null) u.delete(k);
      else u.set(k, v);
    }
    const q = u.toString();
    return `/painel/dispositivos${q ? `?${q}` : ""}`;
  };
  const quando = (iso: string | null) => (iso ? `${dataCurta(iso, fuso).slice(0, 5)} ${horaCurta(iso, fuso)}` : "—");

  return (
    <div className="space-y-4 sm:space-y-5">
      <CabecalhoPagina
        trilha={admin ? [{ rotulo: "Administração", href: "/painel/administracao" }, { rotulo: "Dispositivos" }] : undefined}
        titulo="Dispositivos e coleta"
        descricao="Estações registradas, situação do envio de dados e versão do agente."
        acoes={
          admin ? (
            <Link
              href="/painel/administracao?aba=empresa"
              className="inline-flex h-11 items-center gap-2 rounded-lg bg-acao px-4 text-[15px] font-medium text-white hover:bg-acao-escuro"
            >
              <Download className="h-[18px] w-[18px]" />
              Instalar agente
            </Link>
          ) : undefined
        }
      />

      {estacoes.erro && <AvisoErro mensagem={estacoes.erro} />}

      <GradeIndicadores>
        <Indicador compacto icone={<Monitor />} rotulo="Estações registradas" valor={todas.length} rodape={`limite do plano: ${contexto.empresa.maxDispositivos}`} />
        <Indicador compacto icone={<CheckCircle2 />} rotulo="Com envio recente" valor={todas.length - atrasadas.length} rodape={limiar ? `enviaram nos últimos ${limiar} min` : undefined} />
        <Indicador
          compacto
          tom={noExpediente.length > 0 ? "alerta" : "normal"}
          icone={<AlertTriangle />}
          rotulo="Sem envio recente"
          valor={atrasadas.length}
          rodape={`${noExpediente.length} no horário de expediente`}
        />
        <Indicador compacto icone={<Layers />} rotulo="Versões do agente em uso" valor={versoes.size} rodape={versaoMaisComum ? `mais comum: ${versaoMaisComum}` : undefined} />
      </GradeIndicadores>

      {todas.length === 0 && !estacoes.erro ? (
        <EstadoVazio
          titulo="Nenhuma estação registrada"
          descricao="Instale o agente nas máquinas com o código de instalação da empresa. A estação aparece aqui no primeiro envio."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:gap-5 xl:grid-cols-[minmax(0,1fr)_24rem]">
          <Secao
            icone={<Monitor />}
            titulo={`Estações (${filtradas.length})`}
            acao={
              <form action="/painel/dispositivos" method="get" role="search" className="relative hidden w-64 sm:block">
                {situacao === "atrasadas" && <input type="hidden" name="situacao" value="atrasadas" />}
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  name="busca"
                  defaultValue={busca}
                  placeholder="Buscar estação ou usuário…"
                  aria-label="Buscar estação"
                  className="h-10 w-full rounded-lg border border-borda bg-white pl-9 pr-3 text-sm outline-none placeholder:text-slate-400 focus:border-acao/60 focus:ring-2 focus:ring-acao/15"
                />
              </form>
            }
          >
            <div className="mb-4">
              <AbasPainel
                param="situacao"
                ativa={situacao}
                abas={[
                  { chave: "todas", rotulo: "Todas" },
                  { chave: "atrasadas", rotulo: "Sem envio recente", selo: atrasadas.length },
                ]}
              />
            </div>
            {filtradas.length === 0 ? (
              <p className="rounded-lg border border-dashed border-borda py-8 text-center text-sm text-slate-500">Nenhuma estação neste filtro.</p>
            ) : (
              <TabelaSimples minimo="min-w-[720px]">
                <thead>
                  <tr>
                    <th>Estação</th>
                    <th>Usuário Windows</th>
                    <th>Pessoa</th>
                    <th className="!text-right">Último envio</th>
                    <th>Versão</th>
                    <th>Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {filtradas.map((e) => (
                    <tr key={e.id} className={cn(selecionada?.id === e.id ? "bg-acao-suave/70" : "hover:bg-slate-50")}>
                      <td>
                        <Link href={hrefCom({ estacao: e.id })} scroll={false} className="font-medium text-slate-900 hover:text-acao hover:underline">
                          {e.maquina}
                        </Link>
                      </td>
                      <td className="text-slate-700">{e.usuarioWindows ?? "—"}</td>
                      <td>
                        {e.colaboradorId ? (
                          <Link href={`/painel/pessoas/${e.colaboradorId}`} className="text-slate-700 hover:text-acao hover:underline">
                            {e.colaborador}
                          </Link>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="numeros-tabulares text-right text-slate-700">{quando(e.ultimoEnvio)}</td>
                      <td className="text-slate-700">{e.versao ?? "—"}</td>
                      <td>
                        <SeloSituacao e={e} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </TabelaSimples>
            )}
          </Secao>

          {selecionada && (
            <Secao
              icone={<Monitor />}
              titulo={selecionada.maquina}
              subtitulo={selecionada.colaborador ?? selecionada.usuarioWindows ?? "Sem pessoa vinculada"}
              acao={<SeloSituacao e={selecionada} />}
            >
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <div>
                  <dt className="text-xs text-slate-500">Último envio</dt>
                  <dd className="numeros-tabulares text-slate-900">{quando(selecionada.ultimoEnvio)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Último registro</dt>
                  <dd className="numeros-tabulares text-slate-900">{quando(selecionada.ultimoRegistro)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Sem enviar há</dt>
                  <dd className="numeros-tabulares text-slate-900">
                    {selecionada.minutosSemEnvio === null ? "—" : formatarDuracao(selecionada.minutosSemEnvio)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Agente</dt>
                  <dd className="text-slate-900">{selecionada.versao ?? "—"}</dd>
                </div>
              </dl>
              <p className="mt-3 text-xs leading-relaxed text-slate-500">
                Último envio é quando a estação mandou o lote; último registro é o minuto mais recente
                de atividade que chegou nele. Atrasada = sem envio há mais de {selecionada.limiarMinutos} min
                (2,5 × o intervalo configurado).
              </p>
              <h3 className="mb-2 mt-5 text-[15px] font-semibold text-slate-900">Diário da estação</h3>
              {diario.erro ? <AvisoErro mensagem={diario.erro} /> : <DiarioEstacao eventos={diario.dados} dias={DIAS_DIARIO} />}
            </Secao>
          )}
        </div>
      )}

      <Aviso titulo="Atraso de envio não confirma computador desligado">
        A estação pode estar sem rede, com o agente parado ou apenas acumulando o lote. Enquanto o envio não
        volta, o expediente dela aparece como “sem dados” — nunca como improdutivo ou falta.
      </Aviso>
    </div>
  );
}
