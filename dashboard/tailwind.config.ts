import type { Config } from "tailwindcss";
import animacoes from "tailwindcss-animate";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Tema claro corporativo (set./2026). O painel era escuro com acentos
        // néon e passava a impressão de protótipo; o cliente é gestor de
        // empresa, que lê relatório em fundo claro. Os nomes dos tokens ficaram
        // os mesmos para não reescrever cada tela — só o valor mudou.
        fundo: {
          DEFAULT: "#f3f5f8",
          suave: "#ffffff",
          cartao: "#ffffff",
        },
        borda: "#e2e7ee",
        // Barra lateral: o único bloco escuro da tela, que ancora a navegação.
        marinho: {
          DEFAULT: "#13233a",
          ativo: "#1d3a57",
          borda: "#243752",
          texto: "#c3cedb",
        },
        tinta: "#12213a",
        // Cor de dado: tempo produtivo e barras de progresso.
        marca: {
          DEFAULT: "#1f9fb2",
          escuro: "#16808f",
          suave: "#e4f4f6",
        },
        // Cor de ação: botão principal, link e item selecionado.
        acao: {
          DEFAULT: "#1b5e8f",
          escuro: "#154b73",
          suave: "#e9f1f8",
        },
      },
      fontFamily: {
        sans: ["var(--fonte-sans)", "system-ui", "sans-serif"],
        mono: ["var(--fonte-mono)", "ui-monospace", "monospace"],
      },
      borderRadius: {
        // Cantos contidos: arredondado demais lia como app de consumo.
        xl2: "0.625rem",
      },
      boxShadow: {
        // Os nomes vêm do tema escuro; no claro viraram sombras discretas.
        glow: "0 1px 2px rgba(16, 24, 40, 0.05), 0 1px 3px rgba(16, 24, 40, 0.04)",
        "glow-roxo": "0 1px 2px rgba(16, 24, 40, 0.05), 0 1px 3px rgba(16, 24, 40, 0.04)",
        menu: "0 12px 32px -8px rgba(16, 24, 40, 0.18), 0 2px 6px rgba(16, 24, 40, 0.06)",
      },
      keyframes: {
        "pulso-led": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.35" },
        },
        "entrada-suave": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "pulso-led": "pulso-led 1.8s ease-in-out infinite",
        "entrada-suave": "entrada-suave 0.4s ease-out both",
      },
    },
  },
  // import e não require(): o Node 24 abre este .ts como módulo ES, onde
  // require não existe, e a compilação do CSS caía no next dev.
  plugins: [animacoes],
};

export default config;
