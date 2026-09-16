"use client";

import { useFormState, useFormStatus } from "react-dom";
import { Check, Loader2, TriangleAlert } from "lucide-react";
import { SINCRONIZACAO_PADRAO_MINUTOS } from "@/lib/agente";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Campo, Input } from "@/components/ui/input";
import { salvarConfiguracaoAgente, type ResultadoAcao } from "./acoes";
import type { ConfiguracaoAgente } from "@/lib/tipos";

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
      className={`flex items-center gap-1.5 text-xs ${
        estado.ok ? "text-emerald-700" : "text-rose-700"
      }`}
    >
      {estado.ok ? <Check className="h-3.5 w-3.5" /> : <TriangleAlert className="h-3.5 w-3.5" />}
      {estado.mensagem}
    </p>
  );
}

function Opcao({
  nome,
  titulo,
  explicacao,
  marcado,
  desabilitado,
}: {
  nome: string;
  titulo: string;
  explicacao: string;
  marcado: boolean;
  desabilitado: boolean;
}) {
  return (
    <label className="flex items-start gap-2.5 text-sm text-slate-700">
      <input
        type="checkbox"
        name={nome}
        defaultChecked={marcado}
        disabled={desabilitado}
        className="mt-0.5 h-4 w-4 rounded border-borda bg-fundo-suave accent-cyan-700"
      />
      <span>
        {titulo}
        <span className="block text-xs leading-relaxed text-slate-500">{explicacao}</span>
      </span>
    </label>
  );
}

/**
 * Configuração que a frota inteira recebe na próxima sincronização.
 *
 * É a resposta ao problema de ter 30 estações instaladas e precisar mudar como
 * elas coletam: aqui muda uma vez, e as máquinas obedecem sozinhas. Não troca a
 * versão do programa — isso continua sendo trabalho de instalador.
 */
export function PainelAgente({
  config,
  somenteLeitura,
}: {
  config: ConfiguracaoAgente | null;
  somenteLeitura: boolean;
}) {
  const [estado, enviar] = useFormState(salvarConfiguracaoAgente, null);

  if (!config) {
    return (
      <Card className="p-8 text-center text-sm text-slate-500">
        Não foi possível carregar a configuração do agente.
      </Card>
    );
  }

  const intervalo = config.sync_interval_minutes ?? SINCRONIZACAO_PADRAO_MINUTOS;

  return (
    <div className="space-y-4">
      <Card className="border-cyan-500/20 p-5">
        <h3 className="text-sm font-medium text-slate-800">Como isto chega nas máquinas</h3>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">
          O que você salvar aqui é entregue às estações na próxima sincronização — sem
          reinstalar nada e sem ninguém tocar nos computadores. Serve para ajustar{" "}
          <strong>como</strong> o agente coleta e envia. Trocar a versão do programa é outra
          coisa e continua exigindo o instalador.
        </p>
      </Card>

      <Card className="p-5">
        <form action={enviar} className="space-y-5">
          <section>
            <h3 className="text-sm font-medium text-slate-800">Coleta</h3>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">
              O agente coleta o tempo todo em que a máquina está ligada. Quem define o que é
              expediente é a escala, em Administração &rsaquo; Escalas — e é contra ela que o
              tempo produtivo e a cobertura são calculados.
            </p>
            <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Campo rotulo="Ocioso após (segundos)" dica="sem teclado nem mouse">
                <Input
                  type="number"
                  name="agente_segundos_ocioso"
                  min={30}
                  max={3600}
                  step={30}
                  defaultValue={config.agente_segundos_ocioso}
                  disabled={somenteLeitura}
                />
              </Campo>
              <Campo
                rotulo="Sincronizar a cada (min)"
                dica={`vazio = padrão do agente (${SINCRONIZACAO_PADRAO_MINUTOS} min)`}
              >
                <Input
                  type="number"
                  name="sync_interval_minutes"
                  min={5}
                  max={720}
                  defaultValue={config.sync_interval_minutes ?? ""}
                  disabled={somenteLeitura}
                />
              </Campo>
            </div>
          </section>

          <section className="border-t border-borda pt-4">
            <h3 className="text-sm font-medium text-slate-800">Privacidade</h3>
            <div className="mt-3 space-y-3">
              <Opcao
                nome="agente_mostrar_bandeja"
                titulo="Mostrar ícone na bandeja"
                explicacao="Avisa o colaborador de que a estação é monitorada. Desligar enfraquece a transparência exigida pela LGPD — mantenha ligado salvo orientação jurídica do cliente."
                marcado={config.agente_mostrar_bandeja}
                desabilitado={somenteLeitura}
              />
              <Opcao
                nome="agente_redigir_numeros"
                titulo="Ocultar números longos no título da janela"
                explicacao="Substitui sequências de 6 dígitos ou mais — evita gravar CPF, contrato ou número de cartão que apareça no título."
                marcado={config.agente_redigir_numeros}
                desabilitado={somenteLeitura}
              />
              <Opcao
                nome="agente_extrair_dominio"
                titulo="Identificar o site aberto no navegador"
                explicacao="Registra só o domínio, nunca o endereço completo. É a parte mais pesada da coleta: desligue em máquinas fracas e o painel passa a mostrar só o navegador, sem o site."
                marcado={config.agente_extrair_dominio}
                desabilitado={somenteLeitura}
              />
            </div>

            <div className="mt-4">
              <Campo
                rotulo="Aplicativos sem título registrado"
                dica="um por linha — mensageria e cofres de senha"
              >
                <textarea
                  name="agente_processos_sigilosos"
                  rows={4}
                  disabled={somenteLeitura}
                  defaultValue={config.agente_processos_sigilosos.join("\n")}
                  className="w-full rounded-lg border border-borda bg-fundo-suave px-3 py-2 font-mono text-xs text-slate-800 outline-none transition-colors hover:border-slate-300 focus:border-cyan-500/60 focus:ring-2 focus:ring-cyan-500/20 disabled:opacity-50"
                />
              </Campo>
            </div>
          </section>

          <section className="border-t border-borda pt-4">
            <h3 className="text-sm font-medium text-slate-800">Envio</h3>
            <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Campo rotulo="Registros por envio" dica="entre 10 e 500">
                <Input
                  type="number"
                  name="agente_tamanho_lote"
                  min={10}
                  max={500}
                  defaultValue={config.agente_tamanho_lote}
                  disabled={somenteLeitura}
                />
              </Campo>
              <Campo
                rotulo="Buffer local (dias)"
                dica="quanto tempo a estação guarda se ficar sem internet"
              >
                <Input
                  type="number"
                  name="agente_dias_buffer"
                  min={1}
                  max={90}
                  defaultValue={config.agente_dias_buffer}
                  disabled={somenteLeitura}
                />
              </Campo>
            </div>
          </section>

          {somenteLeitura ? (
            <p className="border-t border-borda pt-4 text-xs text-slate-500">
              Apenas proprietário e gestor alteram a configuração do agente.
            </p>
          ) : (
            <div className="flex flex-wrap items-center gap-3 border-t border-borda pt-4">
              <BotaoEnviar>Salvar e aplicar na frota</BotaoEnviar>
              <Mensagem estado={estado} />
              <span className="text-xs text-slate-500">
                chega nas estações em até {intervalo} minutos
              </span>
            </div>
          )}
        </form>
      </Card>
    </div>
  );
}
