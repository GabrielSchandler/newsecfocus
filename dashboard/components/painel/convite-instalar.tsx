"use client";

import { useEffect, useState } from "react";
import { Download, Share, SquarePlus, X } from "lucide-react";

const CHAVE_DISPENSA = "focus:convite-instalar-dispensado";

/** O evento não está no lib.dom padrão: o Chrome expõe, o resto ignora. */
interface EventoInstalacao extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/**
 * Convite para instalar o painel como app.
 *
 * Um PWA instalável que ninguém sabe que dá para instalar continua sendo um
 * site. Este é o empurrão — e ele se comporta diferente conforme a plataforma,
 * porque as plataformas são diferentes:
 *
 *   • Android/Chrome guarda o evento beforeinstallprompt e instala num toque;
 *   • iOS não tem esse evento e nunca terá: lá só existe o caminho manual
 *     pelo menu Compartilhar, então mostramos a instrução em vez de um botão
 *     que não faria nada.
 *
 * Some sozinho quando o app JÁ está instalado (display-mode: standalone) e
 * fica dispensado para sempre se a pessoa fechar — insistir num convite
 * recusado é o tipo de coisa que faz desinstalar.
 */
export function ConviteInstalar() {
  const [evento, setEvento] = useState<EventoInstalacao | null>(null);
  const [ehIos, setEhIos] = useState(false);
  const [visivel, setVisivel] = useState(false);

  useEffect(() => {
    // Já instalado: nada a convidar.
    const instalado =
      window.matchMedia("(display-mode: standalone)").matches ||
      // Safari no iOS não implementa display-mode e usa esta propriedade.
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    if (instalado) return;

    try {
      if (localStorage.getItem(CHAVE_DISPENSA)) return;
    } catch {
      // Navegador com armazenamento bloqueado: segue e mostra o convite.
    }

    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const safari = /^((?!chrome|android|crios|fxios).)*safari/i.test(navigator.userAgent);
    if (ios && safari) {
      setEhIos(true);
      setVisivel(true);
      return;
    }

    function aoPoderInstalar(e: Event) {
      // Sem isto o Chrome mostra o próprio banner, e ficariam dois convites.
      e.preventDefault();
      setEvento(e as EventoInstalacao);
      setVisivel(true);
    }

    window.addEventListener("beforeinstallprompt", aoPoderInstalar);
    return () => window.removeEventListener("beforeinstallprompt", aoPoderInstalar);
  }, []);

  function dispensar() {
    setVisivel(false);
    try {
      localStorage.setItem(CHAVE_DISPENSA, "1");
    } catch {
      // Sem armazenamento o convite volta na próxima visita. Aceitável.
    }
  }

  async function instalar() {
    if (!evento) return;
    await evento.prompt();
    await evento.userChoice;
    // O evento serve uma vez só; aceito ou recusado, o convite sai da tela.
    setEvento(null);
    dispensar();
  }

  if (!visivel) return null;

  return (
    <div className="flex items-start gap-3 rounded-xl2 border border-cyan-500/25 bg-cyan-500/[0.07] px-4 py-3 lg:hidden">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400 to-violet-500">
        <Download className="h-4 w-4 text-slate-950" />
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-slate-100">Instalar o Focus no celular</p>
        {ehIos ? (
          <p className="mt-1 flex flex-wrap items-center gap-1 text-xs leading-relaxed text-slate-400">
            Toque em <Share className="inline h-3.5 w-3.5 text-cyan-300" /> e depois em
            <span className="inline-flex items-center gap-1 text-slate-300">
              <SquarePlus className="h-3.5 w-3.5" /> Adicionar à Tela de Início
            </span>
          </p>
        ) : (
          <>
            <p className="mt-0.5 text-xs text-slate-400">
              Abre sem barra de navegador, direto da tela inicial.
            </p>
            <button
              type="button"
              onClick={instalar}
              className="toque-afunda mt-2 rounded-lg bg-cyan-500 px-3 py-1.5 text-xs font-semibold text-slate-950"
            >
              Instalar
            </button>
          </>
        )}
      </div>

      <button
        type="button"
        onClick={dispensar}
        aria-label="Dispensar"
        className="toque-afunda shrink-0 rounded-md p-1 text-slate-500 active:bg-slate-800/60"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
