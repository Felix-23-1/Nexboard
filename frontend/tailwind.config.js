/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        sans: ["'Outfit'", "system-ui", "sans-serif"],
        mono: ["'JetBrains Mono'", "'Fira Code'", "monospace"],
      },
      colors: {
        accent: {
          DEFAULT: "#F59E0B",
          hover:   "#D97706",
          light:   "#FCD34D",
          glow:    "rgba(245,158,11,0.35)",
          dim:     "rgba(245,158,11,0.12)",
          border:  "rgba(245,158,11,0.22)",
        },
        surface: {
          DEFAULT: "rgba(255,255,255,0.048)",
          hover:   "rgba(255,255,255,0.08)",
          deep:    "rgba(0,0,0,0.28)",
        },
        nb: {
          border: "rgba(255,255,255,0.07)",
          "border-hover": "rgba(255,255,255,0.14)",
        },
      },
      backdropBlur: {
        glass:   "16px",
        sidebar: "22px",
      },
    },
  },
  plugins: [],
};
