import { Download, MonitorDown } from "lucide-react";

const BASE_PACOTE =
  "https://auwotdrgxjrrhhhmmekc.supabase.co/storage/v1/object/public/agente/instalador";

interface Pacote {
  versao: string;
  bytes: number;
  publicado_em: string;
}

/**
 * Download do agente, na tela de login.
 *
 * Fica ANTES do acesso de propósito: quem instala nas estações costuma ser o
 * TI do cliente, que muitas vezes não tem conta no painel — se o download
 * exigisse login, ele teria de pedir o arquivo a outra pessoa a cada máquina.
 *
 * São dois caminhos, e a ordem importa:
 *
 *   • O botão principal entrega UM arquivo de 3 KB. Ele baixa o agente
 *     sozinho e instala. A primeira versão desta tela oferecia o zip completo
 *     e o Gabriel reclamou na hora: o cliente extraía uma pasta com mais de
 *     500 DLLs e tinha de caçar o instalador no meio.
 *
 *   • O zip completo continua ali embaixo, discreto, porque resolve o caso
 *     que o arquivo pequeno não resolve: instalar em dezenas de máquinas sem
 *     baixar 97 MB em cada uma.
 */
export async function BaixarAgente() {
  let pacote: Pacote | null = null;

  try {
    // revalidate: o arquivo muda poucas vezes por mês; buscar a cada visita
    // seria uma ida à rede no caminho crítico do login, sem ganho nenhum.
    const r = await fetch(`${BASE_PACOTE}/atual.json`, { next: { revalidate: 3600 } });
    if (r.ok) pacote = await r.json();
  } catch {
    // Storage fora do ar ou build sem rede: o cartão aparece sem os detalhes e
    // os links continuam funcionando. Some com o detalhe, não com o download.
  }

  const tamanho = pacote ? `${Math.round(pacote.bytes / 1048576)} MB` : null;

  return (
    <div className="mt-6 rounded-xl2 border border-borda vidro p-5">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-800/60">
          <MonitorDown className="h-5 w-5 text-cyan-400" />
        </span>

        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-medium text-slate-200">Instalar nas estações</h2>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">
            Baixe e clique duas vezes no arquivo, na máquina que vai ser
            acompanhada. Ele pede o código de instalação da empresa — está em
            Administração &rsaquo; Empresa — e pergunta o nome e o departamento
            que a estação vai ter no painel.
          </p>

          <a
            href={`${BASE_PACOTE}/Instalar.bat`}
            className="toque-afunda mt-3 inline-flex items-center gap-2 rounded-lg bg-cyan-500 px-3.5 py-2 text-sm font-medium text-slate-950 transition-colors hover:bg-cyan-400"
          >
            <Download className="h-4 w-4" />
            Baixar o instalador
          </a>

          <p className="mt-2 text-[11px] leading-relaxed text-slate-600">
            Windows 10 ou 11 · requer permissão de administrador
            {pacote ? ` · versão ${pacote.versao}` : ""}
          </p>
          {/* Vale dizer: senão o TI acha que precisa repetir o download a cada
              correção, que é justamente o trabalho que a atualização automática
              elimina. */}
          <p className="mt-1 text-[11px] leading-relaxed text-slate-600">
            Depois de instalado, o agente se atualiza sozinho — não é preciso
            baixar de novo a cada versão.
          </p>

          <p className="mt-3 border-t border-borda pt-3 text-[11px] leading-relaxed text-slate-600">
            Vai instalar em várias máquinas?{" "}
            <a
              href={`${BASE_PACOTE}/NewSecFocus-Instalador.zip`}
              className="text-slate-400 underline underline-offset-2 transition-colors hover:text-cyan-300"
            >
              Baixe o pacote completo
            </a>{" "}
            {tamanho ? `(${tamanho})` : ""} uma vez, coloque numa pasta de rede e
            rode o <strong>Instalar.bat</strong> de dentro dele em cada estação.
          </p>
        </div>
      </div>
    </div>
  );
}
