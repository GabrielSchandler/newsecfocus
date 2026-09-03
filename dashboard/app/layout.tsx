import * as React from "react";
import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--fonte-sans",
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--fonte-mono",
  display: "swap",
});

export const metadata: Metadata = {
  // O nome é sempre o composto: "Focus" sozinho não é distintivo em busca.
  title: "NewSec Focus",
  description:
    "Painel empresarial de produtividade — coleta de metadados em conformidade com a LGPD.",
  applicationName: "NewSec Focus",
  icons: {
    icon: [{ url: "/icone.svg", type: "image/svg+xml" }, { url: "/icone-192.png", sizes: "192x192" }],
    // O iOS ignora o manifesto e usa esta tag ao adicionar à tela de início.
    apple: "/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    title: "Focus",
    // "default" mantém o texto do relógio claro sobre o fundo escuro do painel.
    statusBarStyle: "black-translucent",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#090d16",
  // viewport-fit=cover: sem isso o app instalado no iPhone ganha faixas
  // brancas em cima e embaixo, e a navegação inferior fica atrás do
  // indicador de home. As áreas seguras são tratadas no globals.css.
  viewportFit: "cover",
  width: "device-width",
  initialScale: 1,
  // Deixa o usuário ampliar: é um painel com tabela e gráfico, e travar o
  // zoom aqui seria barreira de acessibilidade, não refinamento.
  maximumScale: 5,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${inter.variable} ${jetbrains.variable} dark`}>
      <body className="min-h-screen bg-fundo font-sans antialiased">
        <div className="fundo-aurora" />
        {children}
      </body>
    </html>
  );
}
