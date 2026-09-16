/**
 * Marca NewSec, com o descritor do produto.
 *
 * O símbolo é o mesmo traçado do site da NewSec (grsplataforms,
 * src/components/site/logo.tsx) — copiado, não redesenhado, para as duas
 * peças não divergirem. As formas escuras usam currentColor: sobre a barra
 * lateral azul-marinho a marca sai branca, sobre fundo claro sai escura, e o
 * vermelho da fita não muda nunca.
 */
export function SimboloNewSec({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 95.24 100" className={className} role="img" aria-hidden="true" focusable="false">
      <g fill="currentColor">
        <path d="M 94.86,0 L 95.24,0 L 95.24,68.76 L 72.76,53.9 L 72.95,15.62 L 74.67,13.33 L 94.67,0.19 Z" />
        <path d="M 0,32.57 L 22.29,47.62 L 22.1,80.19 L 19.24,83.05 L 0.19,95.81 L 0,32.76 Z" />
        <path d="M 28.57,52 L 68.19,79.05 L 71.05,83.62 L 72.57,89.52 L 72.38,94.1 L 70.67,99.43 L 58.48,91.43 L 29.71,71.24 L 28.38,68.19 L 28.38,52.19 Z" />
      </g>
      <path
        fill="#E31B23"
        d="M 23.81,2.67 L 25.71,2.86 L 64.95,29.33 L 66.86,33.33 L 66.86,49.14 L 65.9,49.14 L 27.24,23.24 L 25.71,23.24 L 24.76,24 L 24.38,24.95 L 24.76,26.29 L 90.48,70.48 L 93.14,72.76 L 94.48,75.24 L 94.86,79.24 L 94.29,81.33 L 92.95,83.62 L 71.43,100 L 70.67,99.62 L 72.57,94.48 L 72.76,88.76 L 71.05,83.05 L 68.57,79.43 L 69.71,80 L 71.43,79.81 L 71.62,77.52 L 71.24,76.57 L 4.19,30.48 L 2.29,27.81 L 1.9,24.76 L 2.48,22.67 L 3.62,20.95 L 20.57,7.43 L 22.86,4.95 L 23.81,2.86 Z"
      />
    </svg>
  );
}

/** Assinatura completa: símbolo, nome e o produto embaixo. */
export function MarcaFocus({
  className = "",
  tomProduto = "text-cyan-300",
}: {
  className?: string;
  /** Cor do "FOCUS": clara na barra escura, escura sobre fundo branco. */
  tomProduto?: string;
}) {
  return (
    <span className={`flex items-center gap-2.5 ${className}`}>
      <SimboloNewSec className="h-8 w-auto shrink-0" />
      <span className="flex flex-col leading-none">
        <span className="text-[17px] font-extrabold uppercase tracking-[0.02em]">NewSec</span>
        <span className={`mt-1 text-[10px] font-semibold uppercase tracking-[0.28em] ${tomProduto}`}>
          Focus
        </span>
      </span>
    </span>
  );
}
