/** @type {import('tailwindcss').Config} */

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: {
          deep: "#070B14",
          panel: "#1E293B",
          panel2: "#0F172A",
        },
        border: {
          subtle: "#1E293B",
          glow: "#22D3EE",
        },
        accent: {
          cyan: "#22D3EE",
          amber: "#F59E0B",
          emerald: "#34D399",
          rose: "#FB7185",
        },
        mono: {
          100: "#F8FAFC",
          200: "#E2E8F0",
          300: "#94A3B8",
          400: "#64748B",
          500: "#334155",
          600: "#1E293B",
          700: "#0F172A",
          800: "#070B14",
        },
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', "ui-monospace", "SFMono-Regular", "monospace"],
        display: ['"Sora"', "system-ui", "sans-serif"],
      },
      boxShadow: {
        "glow-cyan": "0 0 20px rgba(34, 211, 238, 0.35)",
        "glow-amber": "0 0 20px rgba(245, 158, 11, 0.35)",
        "glow-emerald": "0 0 20px rgba(52, 211, 153, 0.35)",
      },
      backgroundImage: {
        "grid-pattern":
          "linear-gradient(rgba(148,163,184,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.06) 1px, transparent 1px)",
      },
    },
  },
  plugins: [],
};
