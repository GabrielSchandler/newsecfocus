"use client";

import { Fragment, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Check, ChevronDown, Loader2, Mail, Search, TriangleAlert, UserPlus, UsersRound } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Campo, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { convidarUsuario, salvarAcesso, type ResultadoAcao } from "./acoes-usuarios";
import { ROTULO_PAPEL } from "@/lib/sessao";
import { cn } from "@/lib/utils";
import type { Equipe, PapelUsuario, UsuarioAcesso } from "@/lib/tipos";

const PAPEIS: { valor: PapelUsuario; rotulo: string; explicacao: string }[] = [
  { valor: "OWNER", rotulo: "Proprietário", explicacao: "Tudo, inclusive dados da empresa" },
  { valor: "MANAGER", rotulo: "Gestor", explicacao: "Empresa inteira e administração" },
  { valor: "TEAM_LEAD", rotulo: "Líder de equipe", explicacao: "Somente a equipe dele" },
  { valor: "VIEWER", rotulo: "Visualização", explicacao: "Só consulta, sem administrar" },
];

function BotaoEnviar({ children }: { children: React.ReactNode }) {
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
    <p role="status" className={`flex items-center gap-1.5 text-xs ${estado.ok ? "text-emerald-700" : "text-rose-700"}`}>
      {estado.ok ? <Check className="h-3.5 w-3.5" /> : <TriangleAlert className="h-3.5 w-3.5" />}
      {estado.mensagem}
    </p>
  );
}

/**
 * Quem entra no painel e com qual alcance.
 *
 * Antes disso, incluir um gestor exigia rodar SQL no banco — ou seja, só quem
 * tinha a senha do Postgres conseguia dar acesso a alguém.
 *
 * Cuidado importante: aqui se cadastra quem VÊ o painel. Quem é MONITORADO são
 * as pessoas, na aba ao lado. São listas diferentes e confundir as duas é o
 * erro mais fácil de cometer nesta tela.
 */
export function PainelUsuarios({
  usuarios,
  equipes,
  papelAtual,
  usuarioAtual,
}: {
  usuarios: UsuarioAcesso[];
  equipes: Equipe[];
  papelAtual: PapelUsuario;
  usuarioAtual: string;
}) {
  const [estadoConvite, convidar] = useFormState(convidarUsuario, null);
  const [papel, setPapel] = useState<string>("VIEWER");
  const [equipe, setEquipe] = useState("");
  const [busca, setBusca] = useState("");
  const [aberto, setAberto] = useState<string | null>(null);

  const ehProprietario = papelAtual === "OWNER";
  const papeisDisponiveis = ehProprietario ? PAPEIS : PAPEIS.filter((p) => p.valor !== "OWNER");
  const termo = busca.trim().toLowerCase();
  const visiveis = usuarios.filter(
    (u) => !termo || [u.nome, u.email, u.equipeNome].some((v) => v?.toLowerCase().includes(termo)),
  );

  return (
    <div className="space-y-4">
      <Card className="p-5 sm:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <UsersRound className="mt-0.5 h-6 w-6 shrink-0 text-acao" strokeWidth={1.75} />
            <div>
              <h2 className="text-[17px] font-semibold text-slate-900">Usuários com acesso ({usuarios.length})</h2>
              <p className="mt-0.5 text-sm text-slate-500">
                Quem entra no painel. Quem é acompanhado pelo agente fica em Pessoas — são cadastros diferentes.
              </p>
            </div>
          </div>
          <label className="relative block w-full sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por nome…"
              aria-label="Buscar usuário"
              className="h-10 w-full rounded-lg border border-borda bg-white pl-9 pr-3 text-sm outline-none placeholder:text-slate-400 focus:border-acao/60 focus:ring-2 focus:ring-acao/15"
            />
          </label>
        </div>

        <div className="mt-4 overflow-x-auto rounded-lg border border-borda">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="bg-slate-50 text-left text-[13px] text-slate-600">
                <th className="px-3 py-2.5 font-medium">Nome</th>
                <th className="px-3 py-2.5 font-medium">Papel</th>
                <th className="px-3 py-2.5 font-medium">Equipe</th>
                <th className="px-3 py-2.5 font-medium">Situação</th>
                <th className="px-3 py-2.5 text-right font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {visiveis.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-slate-500">
                    {usuarios.length === 0 ? "Nenhum acesso cadastrado além do seu." : "Ninguém com esse nome."}
                  </td>
                </tr>
              )}
              {visiveis.map((u) => {
                const souEu = u.id === usuarioAtual;
                const expandido = aberto === u.id;
                return (
                  <Fragment key={u.id}>
                    <tr className={cn("border-t border-borda", expandido && "bg-slate-50")}>
                      <td className="px-3 py-3">
                        <span className="font-medium text-slate-900">{u.nome ?? u.email ?? "(sem nome)"}</span>
                        {souEu && <span className="ml-2 rounded-full bg-acao-suave px-2 py-0.5 text-xs text-acao">você</span>}
                        {u.email && u.nome && <span className="block text-xs text-slate-500">{u.email}</span>}
                      </td>
                      <td className="px-3 py-3 text-slate-800">{ROTULO_PAPEL[u.papel]}</td>
                      <td className="px-3 py-3 text-slate-700">{u.papel === "TEAM_LEAD" ? (u.equipeNome ?? "—") : "—"}</td>
                      <td className="px-3 py-3">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
                            u.ativo ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-600",
                          )}
                        >
                          <span className={cn("h-1.5 w-1.5 rounded-full", u.ativo ? "bg-emerald-500" : "bg-slate-400")} />
                          {u.ativo ? "Ativo" : "Desativado"}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => setAberto(expandido ? null : u.id)}
                          aria-expanded={expandido}
                          className="inline-flex items-center gap-1 text-sm font-medium text-acao hover:underline"
                        >
                          {expandido ? "Fechar" : "Editar"}
                          <ChevronDown className={cn("h-4 w-4 transition-transform", expandido && "rotate-180")} />
                        </button>
                      </td>
                    </tr>
                    {expandido && (
                      <tr className="bg-slate-50">
                        <td colSpan={5} className="px-3 pb-4">
                          <FormularioAcesso usuario={u} equipes={equipes} ehProprietario={ehProprietario} souEu={souEu} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          O papel é conferido no servidor e no banco a cada ação: líder de equipe só vê a própria equipe; visualização não altera nada.
        </p>
      </Card>

      <Card id="convite" className="scroll-mt-24 p-5 sm:px-6">
        <h2 className="flex items-center gap-2 text-[17px] font-semibold text-slate-900">
          <UserPlus className="h-5 w-5 text-acao" strokeWidth={1.75} />
          Convidar usuário
        </h2>
        <p className="mt-1 text-sm leading-relaxed text-slate-500">
          Defina uma senha e entregue o acesso na hora — no primeiro login a pessoa escolhe trocá-la ou mantê-la.
          Deixando a senha em branco, ela recebe um e-mail para criar a própria.
        </p>

        <form action={convidar} className="mt-4 space-y-4">
          <input type="hidden" name="papel" value={papel} />
          <input type="hidden" name="equipe_id" value={papel === "TEAM_LEAD" ? equipe : ""} />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Campo rotulo="E-mail">
              <Input type="email" name="email" required placeholder="gestor@empresa.com.br" />
            </Campo>
            <Campo rotulo="Nome">
              <Input name="nome" maxLength={80} placeholder="Como aparece no painel" />
            </Campo>
            <Campo rotulo="Senha" dica="mínimo 8 caracteres · vazio = convite por e-mail">
              <Input type="text" name="senha" minLength={8} maxLength={72} autoComplete="off" placeholder="Defina uma senha" />
            </Campo>
            <Campo rotulo="Papel" dica={papeisDisponiveis.find((p) => p.valor === papel)?.explicacao}>
              <Select
                aria-label="Papel"
                valor={papel}
                aoMudar={setPapel}
                opcoes={papeisDisponiveis.map((p) => ({ valor: p.valor, rotulo: p.rotulo }))}
              />
            </Campo>
            {papel === "TEAM_LEAD" && (
              <Campo rotulo="Equipe" dica="obrigatória para líder">
                <Select
                  aria-label="Equipe do líder"
                  valor={equipe}
                  aoMudar={setEquipe}
                  opcoes={[{ valor: "", rotulo: "Escolha a equipe" }, ...equipes.map((e) => ({ valor: e.id, rotulo: e.nome }))]}
                />
              </Campo>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <BotaoEnviar>
              <Mail className="h-3.5 w-3.5" />
              Enviar convite
            </BotaoEnviar>
            <Mensagem estado={estadoConvite} />
          </div>
        </form>
      </Card>
    </div>
  );
}

function FormularioAcesso({
  usuario,
  equipes,
  ehProprietario,
  souEu,
}: {
  usuario: UsuarioAcesso;
  equipes: Equipe[];
  ehProprietario: boolean;
  souEu: boolean;
}) {
  const [estado, enviar] = useFormState(salvarAcesso, null);
  const [papel, setPapel] = useState<string>(usuario.papel);
  const [equipe, setEquipe] = useState(usuario.equipeId ?? "");

  const papeisDisponiveis = ehProprietario ? PAPEIS : PAPEIS.filter((p) => p.valor !== "OWNER");

  return (
    <form action={enviar} className="space-y-3 rounded-lg border border-borda bg-white p-4">
      <input type="hidden" name="id" value={usuario.id} />
      <input type="hidden" name="papel" value={papel} />
      <input type="hidden" name="equipe_id" value={papel === "TEAM_LEAD" ? equipe : ""} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Campo rotulo="Nome">
          <Input name="nome" defaultValue={usuario.nome ?? ""} maxLength={80} />
        </Campo>
        <Campo rotulo="Papel">
          <Select
            aria-label="Papel do usuário"
            valor={papel}
            aoMudar={setPapel}
            opcoes={papeisDisponiveis.map((p) => ({ valor: p.valor, rotulo: p.rotulo }))}
          />
        </Campo>
        {papel === "TEAM_LEAD" && (
          <Campo rotulo="Equipe">
            <Select
              aria-label="Equipe"
              valor={equipe}
              aoMudar={setEquipe}
              opcoes={[{ valor: "", rotulo: "Escolha a equipe" }, ...equipes.map((e) => ({ valor: e.id, rotulo: e.nome }))]}
            />
          </Campo>
        )}
        <div className="flex items-end">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              name="ativo"
              defaultChecked={usuario.ativo}
              disabled={souEu}
              className="h-4 w-4 rounded border-borda accent-cyan-700"
            />
            Acesso ativo
          </label>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <BotaoEnviar>Salvar</BotaoEnviar>
        <Mensagem estado={estado} />
        {souEu && (
          // Sem isso, o gestor consegue se rebaixar ou se desativar e ficar
          // trancado do lado de fora da própria conta.
          <span className="text-xs text-slate-500">você não pode desativar o próprio acesso</span>
        )}
      </div>
    </form>
  );
}
