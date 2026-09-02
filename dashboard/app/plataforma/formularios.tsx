"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Check, Copy, Loader2, Plus, TriangleAlert } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Campo, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Tabela, type ColunaTabela } from "@/components/painel/tabela";
import { tempoRelativo } from "@/lib/formato";
import { atualizarEmpresa, criarEmpresa, type ResultadoAcao } from "./acoes";
import type { EmpresaCliente, StatusEmpresa } from "@/lib/tipos";

const PLANOS = [
  { valor: "ESSENCIAL", rotulo: "Essencial" },
  { valor: "PROFISSIONAL", rotulo: "Profissional" },
  { valor: "CORPORATIVO", rotulo: "Corporativo" },
];

const SITUACOES: { valor: StatusEmpresa; rotulo: string }[] = [
  { valor: "TRIAL", rotulo: "Avaliação" },
  { valor: "ATIVA", rotulo: "Ativa" },
  { valor: "SUSPENSA", rotulo: "Suspensa" },
  { valor: "CANCELADA", rotulo: "Cancelada" },
];

const VARIANTE_STATUS: Record<StatusEmpresa, "ativo" | "ciano" | "ocioso" | "offline"> = {
  ATIVA: "ativo",
  TRIAL: "ciano",
  SUSPENSA: "ocioso",
  CANCELADA: "offline",
};

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

// ----------------------------------------------------------------------------
//  Provisionamento de uma empresa cliente
// ----------------------------------------------------------------------------

export function FormularioNovaEmpresa() {
  const [estado, enviar] = useFormState(criarEmpresa, null);
  const [plano, setPlano] = useState("ESSENCIAL");
  const [copiada, setCopiada] = useState(false);

  async function copiarChave() {
    if (!estado?.chaveMatricula) return;
    try {
      await navigator.clipboard.writeText(estado.chaveMatricula);
      setCopiada(true);
      setTimeout(() => setCopiada(false), 2000);
    } catch {
      // Navegador sem permissão de área de transferência: a chave segue visível.
    }
  }

  return (
    <Card className="p-5">
      <h3 className="flex items-center gap-2 text-sm font-medium text-slate-200">
        <Plus className="h-4 w-4 text-cyan-400" />
        Nova empresa cliente
      </h3>
      <p className="mt-1 text-xs leading-relaxed text-slate-500">
        A conta entra em avaliação por 14 dias. Se você informar o e-mail do gestor, ele recebe
        um convite para definir a senha e já cai como proprietário da conta.
      </p>

      <form action={enviar} className="mt-4 space-y-4">
        <input type="hidden" name="plano" value={plano} />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Campo rotulo="Nome da empresa">
            <Input name="nome" required maxLength={80} placeholder="Acme Indústria" />
          </Campo>
          <Campo rotulo="E-mail do gestor" dica="recebe o convite de acesso">
            <Input type="email" name="email_gestor" placeholder="gestor@acme.com.br" />
          </Campo>
          <Campo rotulo="E-mail de contato">
            <Input type="email" name="contato_email" placeholder="financeiro@acme.com.br" />
          </Campo>
          <Campo rotulo="Plano">
            <Select aria-label="Plano" valor={plano} aoMudar={setPlano} opcoes={PLANOS} />
          </Campo>
          <Campo rotulo="Limite de estações">
            <Input type="number" name="max_dispositivos" min={1} max={10000} defaultValue={25} />
          </Campo>
          <Campo rotulo="Retenção (dias)">
            <Input type="number" name="retencao_dias" min={7} max={3650} defaultValue={90} />
          </Campo>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <BotaoEnviar>Provisionar empresa</BotaoEnviar>
          <Mensagem estado={estado} />
        </div>

        {estado?.chaveMatricula && (
          <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-3">
            <p className="text-xs text-slate-400">
              Chave de matrícula — vai no appsettings.json do agente nas estações do cliente:
            </p>
            <div className="mt-2 flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded bg-fundo-suave px-2 py-1.5 font-mono text-xs text-cyan-200">
                {estado.chaveMatricula}
              </code>
              <Button type="button" variante="contorno" tamanho="sm" onClick={copiarChave}>
                {copiada ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copiada ? "Copiada" : "Copiar"}
              </Button>
            </div>
          </div>
        )}
      </form>
    </Card>
  );
}

// ----------------------------------------------------------------------------
//  Carteira de clientes
// ----------------------------------------------------------------------------

export function TabelaEmpresas({ empresas }: { empresas: EmpresaCliente[] }) {
  const [editando, setEditando] = useState<EmpresaCliente | null>(null);

  const colunas: ColunaTabela<EmpresaCliente>[] = [
    {
      chave: "nome",
      rotulo: "Empresa",
      principal: true,
      valorOrdenacao: (e) => e.nome,
      render: (e) => (
        <span className="block min-w-0">
          <span className="block truncate font-medium text-slate-100">{e.nome}</span>
          <span className="block truncate font-mono text-xs text-slate-600">{e.slug}</span>
        </span>
      ),
    },
    {
      chave: "status",
      rotulo: "Situação",
      valorOrdenacao: (e) => e.status,
      render: (e) => <Badge variante={VARIANTE_STATUS[e.status]}>{e.status}</Badge>,
    },
    {
      chave: "plano",
      rotulo: "Plano",
      ocultarMobile: true,
      valorOrdenacao: (e) => e.plano,
      render: (e) => <span className="text-slate-400">{e.plano}</span>,
    },
    {
      chave: "estacoes",
      rotulo: "Estações",
      alinhar: "direita",
      valorOrdenacao: (e) => e.dispositivos,
      render: (e) => {
        const cheio = e.maxDispositivos > 0 && e.dispositivos >= e.maxDispositivos;
        return (
          <span className={`tabular-nums ${cheio ? "text-rose-400" : "text-slate-300"}`}>
            {e.dispositivos}/{e.maxDispositivos}
            <span className="ml-1.5 text-xs text-slate-600">{e.dispositivosOnline} on</span>
          </span>
        );
      },
    },
    {
      chave: "usuarios",
      rotulo: "Usuários",
      alinhar: "direita",
      ocultarMobile: true,
      valorOrdenacao: (e) => e.usuarios,
      render: (e) => <span className="tabular-nums text-slate-400">{e.usuarios}</span>,
    },
    {
      chave: "sync",
      rotulo: "Última sync",
      alinhar: "direita",
      valorOrdenacao: (e) => e.ultimaSincronizacao ?? "",
      render: (e) => (
        <span className="text-slate-400">{tempoRelativo(e.ultimaSincronizacao)}</span>
      ),
    },
    {
      chave: "acoes",
      rotulo: "",
      alinhar: "direita",
      render: (e) => (
        <button
          type="button"
          onClick={() => setEditando(e)}
          className="rounded-md border border-borda px-2 py-1 text-xs text-slate-300 transition-colors hover:bg-slate-800/60"
        >
          Gerenciar
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      {editando && (
        <FormularioConta empresa={editando} aoFechar={() => setEditando(null)} />
      )}

      <Tabela
        colunas={colunas}
        linhas={empresas}
        chave={(e) => e.id}
        ordenacaoInicial={{ coluna: "nome", direcao: "asc" }}
        vazio="Nenhuma empresa provisionada ainda."
      />
    </div>
  );
}

function FormularioConta({
  empresa,
  aoFechar,
}: {
  empresa: EmpresaCliente;
  aoFechar: () => void;
}) {
  const [estado, enviar] = useFormState(atualizarEmpresa, null);
  const [status, setStatus] = useState<string>(empresa.status);
  const [plano, setPlano] = useState(empresa.plano);

  return (
    <Card className="border-cyan-500/20 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium text-slate-100">{empresa.nome}</h3>
          <p className="text-xs text-slate-500">
            {empresa.dispositivos} estações · {empresa.usuarios} usuários
          </p>
        </div>
        <Button variante="fantasma" tamanho="sm" onClick={aoFechar}>
          Fechar
        </Button>
      </div>

      <form action={enviar} className="mt-4 space-y-4">
        <input type="hidden" name="id" value={empresa.id} />
        <input type="hidden" name="status" value={status} />
        <input type="hidden" name="plano" value={plano} />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Campo rotulo="Situação">
            <Select aria-label="Situação" valor={status} aoMudar={setStatus} opcoes={SITUACOES} />
          </Campo>
          <Campo rotulo="Plano">
            <Select aria-label="Plano" valor={plano} aoMudar={setPlano} opcoes={PLANOS} />
          </Campo>
          <Campo rotulo="Limite de estações">
            <Input
              type="number"
              name="max_dispositivos"
              min={1}
              max={10000}
              defaultValue={empresa.maxDispositivos}
            />
          </Campo>
        </div>

        {(status === "SUSPENSA" || status === "CANCELADA") && (
          <p className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-200/90">
            Nessa situação os agentes param de coletar na próxima sincronização. Os dados já
            recebidos continuam visíveis para o cliente.
          </p>
        )}

        <div className="flex items-center gap-3">
          <BotaoEnviar>Salvar</BotaoEnviar>
          <Mensagem estado={estado} />
        </div>
      </form>
    </Card>
  );
}
