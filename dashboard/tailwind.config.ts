import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Fundo profundo slate/zinc + acentos néon (cyan/sky/purple).
        fundo: {
          DEFAULT: "#090d16",
          suave: "#0d121e",
          cartao: "#0f1524",
        },
        borda: "#1e293b",
        neon: {
          ciano: "#22d3ee",
          ceu: "#38bdf8",
          roxo: "#a78bfa",
          verde: "#34d399",
          ambar: "#fbbf24",
          vermelho: "#fb7185",
        },
      },
      fontFamily: {
        sans: ["var(--fonte-sans)", "system-ui", "sans-serif"],
        mono: ["var(--fonte-mono)", "ui-monospace", "monospace"],
      },
      borderRadius: {
        xl2: "1.25rem",
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(34,211,238,0.08), 0 8px 40px -12px rgba(34,211,238,0.25)",
        "glow-roxo": "0 0 0 1px rgba(167,139,250,0.10), 0 8px 40px -12px rgba(167,139,250,0.30)",
      },
      keyframes: {
        "borda-girar": {
          "0%": { "--angulo": "0deg" },
          "100%": { "--angulo": "360deg" },
        },
        "pulso-led": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.35" },
        },
        "brilho-flutuante": {
          "0%, 100%": { transform: "translateY(0) scale(1)", opacity: "0.5" },
          "50%": { transform: "translateY(-12px) scale(1.05)", opacity: "0.8" },
        },
        "entrada-suave": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "borda-girar": "borda-girar 4s linear infinite",
        "pulso-led": "pulso-led 1.8s ease-in-out infinite",
        "brilho-flutuante": "brilho-flutuante 9s ease-in-out infinite",
        "entrada-suave": "entrada-suave 0.4s ease-out both",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
