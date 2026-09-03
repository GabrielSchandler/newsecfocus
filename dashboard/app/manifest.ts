import type { MetadataRoute } from "next";

/**
 * Manifesto do app instalável.
 *
 * display "standalone" é o que faz diferença: aberto pela tela de início, o
 * painel roda sem barra de endereço nem abas, como aplicativo. Combinado com a
 * navegação inferior, é o que dá a sensação de app nativo — e é como o gestor
 * vai abrir isso no dia a dia, do celular, sem digitar URL.
 *
 * start_url aponta para o painel, não para a raiz: quem instalou já tem conta,
 * e o middleware manda para o login se a sessão tiver expirado.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "NewSec Focus",
    short_name: "Focus",
    description:
      "Painel de produtividade da equipe — jornada, foco e uso de ferramentas em tempo real.",
    start_url: "/painel",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#090d16",
    theme_color: "#090d16",
    lang: "pt-BR",
    dir: "ltr",
    categories: ["business", "productivity"],
    icons: [
      { src: "/icone-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icone-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // O Android recorta este em círculo ou squircle conforme o aparelho.
      { src: "/icone-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Visão geral", url: "/painel" },
      { name: "Pessoas", url: "/painel/pessoas" },
      { name: "Horas extras", url: "/painel/horas-extras" },
    ],
  };
}
