// ============================================================================
//  Gera os ícones do app a partir de um SVG único.
//
//  Existe como script, e não como PNGs soltos no repositório, para a marca ter
//  uma fonte só: mudou o SVG aqui, roda `node scripts/gerar-icones.mjs` e os
//  quatro arquivos saem coerentes.
//
//  Por que quatro:
//    • 192 e 512  — o que o Android pede no manifesto;
//    • 512 maskable — o Android recorta em círculo/squircle conforme o
//      aparelho, então o desenho precisa caber nos 80% centrais ou vira um
//      logo decapitado;
//    • apple-touch-icon 180 — o iOS ignora o manifesto e usa esta tag; sem
//      ela, "Adicionar à Tela de Início" salva um print da página.
//
//  Usa o sharp que já vem com o Next (otimização de imagem), sem dependência
//  nova.
// ============================================================================

import { mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";

const SAIDA = "public";
mkdirSync(SAIDA, { recursive: true });

/** Marca: quadrado com gradiente ciano→violeta e a linha de pulso. */
function svg({ tamanho, raio, escala }) {
  const centro = tamanho / 2;
  // Traço do pulso desenhado num sistema de 100x100 e reposicionado.
  const t = tamanho * escala;
  const inicio = centro - t / 2;
  const p = (x, y) => `${inicio + (x / 100) * t},${inicio + (y / 100) * t}`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${tamanho}" height="${tamanho}" viewBox="0 0 ${tamanho} ${tamanho}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#22d3ee"/>
      <stop offset="100%" stop-color="#a78bfa"/>
    </linearGradient>
  </defs>
  <rect width="${tamanho}" height="${tamanho}" rx="${raio}" fill="#090d16"/>
  <rect x="${tamanho * 0.06}" y="${tamanho * 0.06}" width="${tamanho * 0.88}" height="${tamanho * 0.88}" rx="${raio * 0.9}" fill="url(#g)"/>
  <polyline
    points="${p(6, 50)} ${p(28, 50)} ${p(40, 20)} ${p(58, 80)} ${p(70, 50)} ${p(94, 50)}"
    fill="none" stroke="#090d16" stroke-width="${tamanho * 0.075}"
    stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
}

const arquivos = [
  // Ícone comum: desenho ocupando bem o quadrado.
  { nome: "icone-192.png", tamanho: 192, raio: 42, escala: 0.62 },
  { nome: "icone-512.png", tamanho: 512, raio: 112, escala: 0.62 },
  // Maskable: desenho menor, porque o sistema recorta as bordas.
  { nome: "icone-maskable-512.png", tamanho: 512, raio: 0, escala: 0.44 },
  { nome: "apple-touch-icon.png", tamanho: 180, raio: 40, escala: 0.62 },
];

for (const { nome, tamanho, raio, escala } of arquivos) {
  const png = await sharp(Buffer.from(svg({ tamanho, raio, escala }))).png().toBuffer();
  writeFileSync(`${SAIDA}/${nome}`, png);
  console.log(`  ${nome.padEnd(26)} ${tamanho}x${tamanho}  ${(png.length / 1024).toFixed(1)} KB`);
}

// Favicon do navegador, no mesmo desenho.
writeFileSync(`${SAIDA}/icone.svg`, svg({ tamanho: 64, raio: 14, escala: 0.62 }));
console.log("  icone.svg                  vetorial");
