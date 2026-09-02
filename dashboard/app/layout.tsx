import * as React from "react";
import type { Metadata } from "next";
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
