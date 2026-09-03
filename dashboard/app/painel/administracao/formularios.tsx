"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Check, Loader2, Pencil, Plus, Trash2, TriangleAlert, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Campo, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { ROTULOS_TIPO, formatarHorasCurto } from "@/lib/formato";
import { CodigoInstalacao } from "./codigo-instalacao";
import {
  aplicarCatalogoPadrao,
  excluirCategoria,
  excluirEquipe,
  excluirMapeamento,
  salvarCategoria,
  salvarColaborador,
  salvarEmpresa,
  salvarEquipe,
  salvarMapeamento,
  type ResultadoAcao,
} from "./acoes";
import type { Categoria, Colaborador, ContextoSessao, Equipe, MapeamentoApp } from "@/lib/tipos";

// ----------------------------------------------------------------------------
//  Peças compartilhadas
// ----------------------------------------------------------------------------

function BotaoEnviar({ children = "Salvar" }: { children?: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" tamanho="sm" disabled={pending}>
      {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
      {children}
    </Button>
  );
}

function Mensagem({ estado }: { estado: ResultadoAcao | null }) {
  if (!estado) return null;
  return (
    <p
      role="status"
      className={`flex items-center gap-1.5 text-xs ${
        estado.ok ? "text-emerald-400" : "text-rose-400"
      }`}
    >
      {estado.ok ? <Check className="h-3.5 w-3.5" /> : <TriangleAlert className="h-3.5 w-3.5" />}
      {estado.mensagem}
    </p>
  );
}

function BotaoExcluir({
  acao,
  id,
  confirmacao,
}: {
  acao: (anterior: ResultadoAcao | null, dados: FormData) => Promise<ResultadoAcao>;
  id: string;
  confirmacao: string;
}) {
  const [estado, enviar] = useFormState(acao, null);
  const [confirmando, setConfirmando] = useState(false);

  if (!confirmando) {
    return (
      <button
        type="button"
        onClick={() => setConfirmando(true)}
        aria-label="Excluir"
        className="rounded-md p-1.5 text-slate-500 transition-colors hover:bg-rose-500/10 hover:text-rose-400"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    );
  }

  return (
    <form action={enviar} className="flex items-center gap-1.5">
      <input type="hidden" name="id" value={id} />
      <span className="text-xs text-slate-400">{confirmacao}</span>
      <Button type="submit" tamanho="sm" variante="contorno" className="text-rose-300">
        Excluir
      </Button>
      <button
        type="button"
        onClick={() => setConfirmando(false)}
        aria-label="Cancelar"
        className="rounded-md p-1.5 text-slate-500 hover:text-slate-300"
      >
        <X className="h-3.5 w-3.5" />
      </button>
      <Mensagem estado={estado} />
    </form>
  );
}

// ----------------------------------------------------------------------------
//  Equipes
// ----------------------------------------------------------------------------

export function PainelEquipes({ equipes }: { equipes: Equipe[] }) {
  const [estado, enviar] = useFormState(salvarEquipe, null);
  const [editando, setEditando] = useState<Equipe | null>(null);

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <h3 className="text-sm font-medium text-slate-200">
          {editando ? `Editar ${editando.nome}` : "Nova equipe"}
        </h3>

        <form action={enviar} className="mt-4 space-y-4">
          {editando && <input type="hidden" name="id" value={editando.id} />}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Campo rotulo="Nome">
              <Input
                name="nome"
                required
                maxLength={60}
                defaultValue={editando?.nome ?? ""}
                placeholder="Comercial"
              />
            </Campo>
            <Campo rotulo="Descrição" className="sm:col-span-2">
              <Input
                name="descricao"
                maxLength={140}
                defaultValue={editando?.descricao ?? ""}
                placeholder="O que essa equipe faz"
              />
            </Campo>
            <Campo rotulo="Cor" dica="usada nos gráficos">
              <Input
                type="color"
                name="cor"
                defaultValue={editando?.cor ?? "#22d3ee"}
                className="h-10 p-1"
              />
            </Campo>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <BotaoEnviar>{editando ? "Salvar alterações" : "Criar equipe"}</BotaoEnviar>
            {editando && (
              <Button
                type="button"
                variante="fantasma"
                tamanho="sm"
                onClick={() => setEditando(null)}
              >
                Cancelar
              </Button>
            )}
            <Mensagem estado={estado} />
          </div>
        </form>
      </Card>

      <Card className="overflow-hidden">
        {equipes.length === 0 ? (
          <p className="p-8 text-center text-sm text-slate-500">
            Nenhuma equipe ainda. Crie a primeira acima.
          </p>
        ) : (
          <ul className="divide-y divide-slate-800/70">
            {equipes.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-3 p-4">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: e.cor ?? "#475569" }}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-100">{e.nome}</p>
                  {e.descricao && (
                    <p className="truncate text-xs text-slate-500">{e.descricao}</p>
                  )}
                </div>
                <Badge variante="neutro">
                  {e.total_pessoas ?? 0} {e.total_pessoas === 1 ? "pessoa" : "pessoas"}
                </Badge>
                <button
                  type="button"
                  onClick={() => setEditando(e)}
                  aria-label={`Editar ${e.nome}`}
                  className="rounded-md p-1.5 text-slate-500 transition-colors hover:bg-slate-800/60 hover:text-slate-300"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <BotaoExcluir acao={excluirEquipe} id={e.id} confirmacao="Confirma?" />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

// ----------------------------------------------------------------------------
//  Colaboradores
// ----------------------------------------------------------------------------

export function PainelColaboradores({
  colaboradores,
  equipes,
  jornadaPadrao,
}: {
  colaboradores: Colaborador[];
  equipes: Equipe[];
  jornadaPadrao: number;
}) {
  const [busca, setBusca] = useState("");

  const filtrados = colaboradores.filter((c) => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return true;
    return [c.nome, c.os_user, c.cargo, c.equipe_nome]
      .filter(Boolean)
      .some((campo) => String(campo).toLowerCase().includes(termo));
  });

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <h3 className="text-sm font-medium text-slate-200">Colaboradores</h3>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">
          As pessoas aparecem sozinhas na primeira sincronização de cada estação, identificadas
          pelo usuário do Windows. Aqui você dá o nome de verdade, o cargo, a equipe e a jornada
          esperada — a jornada é a base do indicador de aderência.
        </p>
        <div className="mt-4">
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome, usuário, cargo ou equipe…"
            aria-label="Buscar colaborador"
          />
        </div>
      </Card>

      {filtrados.length === 0 ? (
        <Card className="p-8 text-center text-sm text-slate-500">
          {colaboradores.length === 0
            ? "Nenhum colaborador ainda. Eles aparecem quando o primeiro agente sincronizar."
            : "Nenhum resultado para essa busca."}
        </Card>
      ) : (
        <div className="space-y-3">
          {filtrados.map((c) => (
            <FormularioColaborador
              key={c.id}
              colaborador={c}
              equipes={equipes}
              jornadaPadrao={jornadaPadrao}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function FormularioColaborador({
  colaborador,
  equipes,
  jornadaPadrao,
}: {
  colaborador: Colaborador;
  equipes: Equipe[];
  jornadaPadrao: number;
}) {
  const [estado, enviar] = useFormState(salvarColaborador, null);
  const [equipeId, setEquipeId] = useState(colaborador.team_id ?? "");

  return (
    <Card className="p-4">
      <form action={enviar} className="space-y-3">
        <input type="hidden" name="id" value={colaborador.id} />
        <input type="hidden" name="team_id" value={equipeId} />

        <div className="flex flex-wrap items-center gap-2">
          <Badge variante="neutro">{colaborador.os_user}</Badge>
          {!colaborador.ativo && <Badge variante="offline">inativo</Badge>}
          {!colaborador.team_id && <Badge variante="ocioso">sem equipe</Badge>}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Campo rotulo="Nome">
            <Input name="nome" defaultValue={colaborador.nome ?? ""} maxLength={80} />
          </Campo>
          <Campo rotulo="Cargo">
            <Input name="cargo" defaultValue={colaborador.cargo ?? ""} maxLength={60} />
          </Campo>
          <Campo rotulo="E-mail">
            <Input type="email" name="email" defaultValue={colaborador.email ?? ""} />
          </Campo>
          <Campo rotulo="Equipe">
            <Select
              aria-label="Equipe do colaborador"
              valor={equipeId}
              aoMudar={setEquipeId}
              opcoes={[
                { valor: "", rotulo: "Sem equipe" },
                ...equipes.map((e) => ({ valor: e.id, rotulo: e.nome })),
              ]}
            />
          </Campo>
          <Campo
            rotulo="Jornada (min/dia)"
            dica={
              colaborador.jornada_minutos_dia === null
                ? `vazio = padrão da empresa (${formatarHorasCurto(jornadaPadrao)})`
                : formatarHorasCurto(colaborador.jornada_minutos_dia)
            }
          >
            <Input
              type="number"
              name="jornada_minutos_dia"
              min={60}
              max={1440}
              step={30}
              placeholder={String(jornadaPadrao)}
              defaultValue={colaborador.jornada_minutos_dia ?? ""}
            />
          </Campo>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-xs text-slate-400">
            <input
              type="checkbox"
              name="ativo"
              defaultChecked={colaborador.ativo}
              className="h-4 w-4 rounded border-borda bg-fundo-suave accent-cyan-500"
            />
            Ativo
          </label>
          <BotaoEnviar />
          <Mensagem estado={estado} />
        </div>
      </form>
    </Card>
  );
}

// ----------------------------------------------------------------------------
//  Classificação: categorias + regras de aplicativo
// ----------------------------------------------------------------------------

export function PainelClassificacao({
  categorias,
  mapeamentos,
}: {
  categorias: Categoria[];
  mapeamentos: MapeamentoApp[];
}) {
  return (
    <div className="space-y-4">
      <Card className="border-cyan-500/20 p-5">
        <h3 className="text-sm font-medium text-slate-200">Como o índice é calculado</h3>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">
          Cada aplicativo ou site é ligado a uma categoria, e a categoria diz se aquele tempo é
          produtivo, neutro ou improdutivo. O índice é o tempo produtivo dividido pelo tempo
          classificado. O que não tem regra fica de fora da conta — por isso vale classificar
          primeiro o que mais aparece na tela de Aplicativos. Ao salvar uma regra, os últimos 90
          dias são recalculados automaticamente.
        </p>
      </Card>

      <BotaoCatalogoPadrao />
      <FormularioCategoria categorias={categorias} />
      <FormularioMapeamento categorias={categorias} mapeamentos={mapeamentos} />
    </div>
  );
}

function BotaoCatalogoPadrao() {
  const [estado, enviar] = useFormState(aplicarCatalogoPadrao, null);

  return (
    <Card className="p-5">
      <h3 className="text-sm font-medium text-slate-200">Catálogo padrão</h3>
      <p className="mt-1 text-xs leading-relaxed text-slate-500">
        Repõe as categorias e as regras que acompanham o sistema — pacote Office, ferramentas
        de gestão, comunicação, redes sociais, streaming e compras. Nada do que você já
        configurou é sobrescrito, então dá para rodar quantas vezes quiser.
      </p>
      <form action={enviar} className="mt-4 flex flex-wrap items-center gap-3">
        <BotaoEnviar>Aplicar catálogo padrão</BotaoEnviar>
        <Mensagem estado={estado} />
      </form>
    </Card>
  );
}

function FormularioCategoria({ categorias }: { categorias: Categoria[] }) {
  const [estado, enviar] = useFormState(salvarCategoria, null);
  const [tipo, setTipo] = useState("PRODUCTIVE");

  return (
    <Card className="p-5">
      <h3 className="text-sm font-medium text-slate-200">Categorias</h3>

      <form action={enviar} className="mt-4 space-y-3">
        <input type="hidden" name="type" value={tipo} />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Campo rotulo="Nome">
            <Input name="name" required maxLength={60} placeholder="Trabalho / Produção" />
          </Campo>
          <Campo rotulo="Classificação">
            <Select
              aria-label="Classificação"
              valor={tipo}
              aoMudar={setTipo}
              opcoes={[
                { valor: "PRODUCTIVE", rotulo: ROTULOS_TIPO.PRODUCTIVE },
                { valor: "NEUTRAL", rotulo: ROTULOS_TIPO.NEUTRAL },
                { valor: "UNPRODUCTIVE", rotulo: ROTULOS_TIPO.UNPRODUCTIVE },
              ]}
            />
          </Campo>
          <Campo rotulo="Cor">
            <Input type="color" name="color" defaultValue="#22d3ee" className="h-10 p-1" />
          </Campo>
          <div className="flex items-end">
            <BotaoEnviar>
              <Plus className="h-3.5 w-3.5" />
              Adicionar
            </BotaoEnviar>
          </div>
        </div>
        <Mensagem estado={estado} />
      </form>

      {categorias.length > 0 && (
        <ul className="mt-4 divide-y divide-slate-800/70 border-t border-borda">
          {categorias.map((c) => (
            <li key={c.id} className="flex items-center gap-3 py-3">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ background: c.color ?? "#475569" }}
              />
              <span className="flex-1 truncate text-sm text-slate-200">{c.name}</span>
              <Badge
                variante={
                  c.type === "PRODUCTIVE" ? "ativo" : c.type === "NEUTRAL" ? "roxo" : "offline"
                }
              >
                {ROTULOS_TIPO[c.type]}
              </Badge>
              <BotaoExcluir acao={excluirCategoria} id={c.id} confirmacao="Excluir?" />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function FormularioMapeamento({
  categorias,
  mapeamentos,
}: {
  categorias: Categoria[];
  mapeamentos: MapeamentoApp[];
}) {
  const [estado, enviar] = useFormState(salvarMapeamento, null);
  const [categoriaId, setCategoriaId] = useState(categorias[0]?.id ?? "");

  return (
    <Card className="p-5">
      <h3 className="text-sm font-medium text-slate-200">Regras de aplicativo e site</h3>
      <p className="mt-1 text-xs text-slate-500">
        Use o processo (excel.exe) ou o domínio (youtube.com) — um por regra.
      </p>

      {categorias.length === 0 ? (
        <p className="mt-4 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-200/90">
          Crie ao menos uma categoria antes de cadastrar regras.
        </p>
      ) : (
        <form action={enviar} className="mt-4 space-y-3">
          <input type="hidden" name="category_id" value={categoriaId} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Campo rotulo="Processo">
              <Input name="process_name" placeholder="excel.exe" maxLength={120} />
            </Campo>
            <Campo rotulo="Domínio">
              <Input name="domain" placeholder="youtube.com" maxLength={160} />
            </Campo>
            <Campo rotulo="Categoria">
              <Select
                aria-label="Categoria da regra"
                valor={categoriaId}
                aoMudar={setCategoriaId}
                opcoes={categorias.map((c) => ({
                  valor: c.id,
                  rotulo: `${c.name} · ${ROTULOS_TIPO[c.type]}`,
                }))}
              />
            </Campo>
            <div className="flex items-end">
              <BotaoEnviar>
                <Plus className="h-3.5 w-3.5" />
                Adicionar
              </BotaoEnviar>
            </div>
          </div>
          <Mensagem estado={estado} />
        </form>
      )}

      {mapeamentos.length > 0 && (
        <ul className="mt-4 divide-y divide-slate-800/70 border-t border-borda">
          {mapeamentos.map((m) => (
            <li key={m.id} className="flex items-center gap-3 py-3">
              <span className="flex-1 truncate font-mono text-xs text-slate-300">
                {m.process_name ?? m.domain}
              </span>
              <Badge
                variante={
                  m.categoria_tipo === "PRODUCTIVE"
                    ? "ativo"
                    : m.categoria_tipo === "NEUTRAL"
                      ? "roxo"
                      : m.categoria_tipo === "UNPRODUCTIVE"
                        ? "offline"
                        : "neutro"
                }
              >
                {m.categoria_nome ?? "sem categoria"}
              </Badge>
              <BotaoExcluir acao={excluirMapeamento} id={m.id} confirmacao="Remover?" />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// ----------------------------------------------------------------------------
//  Empresa
// ----------------------------------------------------------------------------

const FUSOS = [
  "America/Sao_Paulo",
  "America/Manaus",
  "America/Cuiaba",
  "America/Belem",
  "America/Fortaleza",
  "America/Recife",
  "America/Rio_Branco",
  "America/Noronha",
];

export function PainelEmpresa({
  contexto,
  intervaloSync,
}: {
  contexto: ContextoSessao;
  intervaloSync: number | null;
}) {
  const [estado, enviar] = useFormState(salvarEmpresa, null);
  const [fuso, setFuso] = useState(contexto.empresa.fuso);
  const somenteLeitura = contexto.papel !== "OWNER";

  return (
    <div className="space-y-4">
    <CodigoInstalacao
      codigo={contexto.empresa.codigoInstalacao}
      podeGirar={!somenteLeitura}
    />

    <Card className="p-5">
      <h3 className="text-sm font-medium text-slate-200">Dados da empresa</h3>
      <p className="mt-1 text-xs leading-relaxed text-slate-500">
        O fuso define a virada do dia em todo o painel e nos relatórios. A retenção é por quanto
        tempo a atividade minuto a minuto fica guardada — os resumos agregados são permanentes,
        então reduzir a retenção não apaga o histórico gerencial.
      </p>

      <form action={enviar} className="mt-4 space-y-4">
        <input type="hidden" name="fuso" value={fuso} />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Campo rotulo="Nome">
            <Input
              name="name"
              defaultValue={contexto.empresa.nome}
              disabled={somenteLeitura}
              maxLength={80}
            />
          </Campo>
          <Campo rotulo="E-mail de contato">
            <Input type="email" name="contato_email" disabled={somenteLeitura} />
          </Campo>
          <Campo rotulo="Fuso horário">
            <Select
              aria-label="Fuso horário"
              valor={fuso}
              aoMudar={setFuso}
              opcoes={FUSOS.map((f) => ({ valor: f, rotulo: f.replace("America/", "") }))}
            />
          </Campo>
          <Campo
            rotulo="Jornada padrão (min/dia)"
            dica={`${formatarHorasCurto(contexto.empresa.jornadaPadraoMinutos)} — vale para quem não tem exceção`}
          >
            <Input
              type="number"
              name="jornada_padrao_minutos"
              min={60}
              max={1440}
              step={30}
              defaultValue={contexto.empresa.jornadaPadraoMinutos}
              disabled={somenteLeitura}
            />
          </Campo>
          <Campo rotulo="Retenção (dias)" dica="entre 7 e 3650">
            <Input
              type="number"
              name="retencao_dias"
              min={7}
              max={3650}
              defaultValue={contexto.empresa.retencaoDias}
              disabled={somenteLeitura}
            />
          </Campo>
          <Campo rotulo="Sincronização (min)" dica="em branco = padrão do agente">
            <Input
              type="number"
              name="sync_interval_minutes"
              min={5}
              max={720}
              defaultValue={intervaloSync ?? ""}
              disabled={somenteLeitura}
            />
          </Campo>
        </div>

        <dl className="grid grid-cols-2 gap-3 border-t border-borda pt-4 sm:grid-cols-4">
          <div>
            <dt className="text-xs text-slate-500">Plano</dt>
            <dd className="text-sm text-slate-200">{contexto.empresa.plano}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Situação</dt>
            <dd className="text-sm text-slate-200">{contexto.empresa.status}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Limite de estações</dt>
            <dd className="text-sm text-slate-200">{contexto.empresa.maxDispositivos}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Identificador</dt>
            <dd className="truncate font-mono text-xs text-slate-400">
              {contexto.empresa.slug}
            </dd>
          </div>
        </dl>

        {somenteLeitura ? (
          <p className="text-xs text-slate-500">
            Só o proprietário da conta altera estes dados.
          </p>
        ) : (
          <div className="flex items-center gap-3">
            <BotaoEnviar />
            <Mensagem estado={estado} />
          </div>
        )}
      </form>
    </Card>
    </div>
  );
}
