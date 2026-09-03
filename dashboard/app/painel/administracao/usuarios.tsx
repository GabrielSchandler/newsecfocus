"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Check, Loader2, Mail, TriangleAlert, UserPlus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Campo, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { convidarUsuario, salvarAcesso, type ResultadoAcao } from "./acoes-usuarios";
import { ROTULO_PAPEL } from "@/lib/sessao";
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
    <p
      role="status"
      className={`flex items-center gap-1.5 text-xs ${estado.ok ? "text-emerald-400" : "text-rose-400"}`}
    >
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
 * os colaboradores, na aba ao lado. São listas diferentes e confundir as duas é
 * o erro mais fácil de cometer nesta tela.
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

  const ehProprietario = papelAtual === "OWNER";
  const papeisDisponiveis = ehProprietario ? PAPEIS : PAPEIS.filter((p) => p.valor !== "OWNER");

  return (
    <div className="space-y-4">
      <Card className="border-cyan-500/20 p-5">
        <h3 className="text-sm font-medium text-slate-200">Acessos ao painel</h3>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">
          Esta lista é de quem <strong>entra no painel</strong>. Quem é acompanhado pelo agente
          são os colaboradores, na aba ao lado — são cadastros diferentes. Uma pessoa pode
          estar nas duas listas, em uma só, ou em nenhuma.
        </p>
      </Card>

      <Card className="p-5">
        <h3 className="flex items-center gap-2 text-sm font-medium text-slate-200">
          <UserPlus className="h-4 w-4 text-cyan-400" />
          Convidar alguém
        </h3>
        <p className="mt-1 text-xs text-slate-500">
          A pessoa recebe um e-mail para criar a senha e já entra com o papel escolhido.
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
            <Campo
              rotulo="Papel"
              dica={papeisDisponiveis.find((p) => p.valor === papel)?.explicacao}
            >
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
                  opcoes={[
                    { valor: "", rotulo: "Escolha a equipe" },
                    ...equipes.map((e) => ({ valor: e.id, rotulo: e.nome })),
                  ]}
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

      {usuarios.length === 0 ? (
        <Card className="p-8 text-center text-sm text-slate-500">
          Nenhum acesso cadastrado além do seu.
        </Card>
      ) : (
        <div className="space-y-3">
          {usuarios.map((u) => (
            <LinhaAcesso
              key={u.id}
              usuario={u}
              equipes={equipes}
              ehProprietario={ehProprietario}
              souEu={u.id === usuarioAtual}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function LinhaAcesso({
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
    <Card className="p-4">
      <form action={enviar} className="space-y-3">
        <input type="hidden" name="id" value={usuario.id} />
        <input type="hidden" name="papel" value={papel} />
        <input type="hidden" name="equipe_id" value={papel === "TEAM_LEAD" ? equipe : ""} />

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-slate-100">
            {usuario.nome ?? usuario.email ?? "(sem nome)"}
          </span>
          {usuario.email && <Badge variante="neutro">{usuario.email}</Badge>}
          <Badge variante={usuario.ativo ? "ativo" : "offline"}>
            {usuario.ativo ? ROTULO_PAPEL[usuario.papel] : "desativado"}
          </Badge>
          {souEu && <Badge variante="ciano">você</Badge>}
        </div>

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
                opcoes={[
                  { valor: "", rotulo: "Escolha a equipe" },
                  ...equipes.map((e) => ({ valor: e.id, rotulo: e.nome })),
                ]}
              />
            </Campo>
          )}
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-xs text-slate-400">
              <input
                type="checkbox"
                name="ativo"
                defaultChecked={usuario.ativo}
                disabled={souEu}
                className="h-4 w-4 rounded border-borda bg-fundo-suave accent-cyan-500"
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
            <span className="text-xs text-slate-600">
              você não pode desativar o próprio acesso
            </span>
          )}
        </div>
      </form>
    </Card>
  );
}
