import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: "#1F1A17",
        clay: "#9A6C44",
        sand: "#F8EFE2",
        mint: "#8FC7AE",
        ember: "#D8602B",
      },
      boxShadow: {
        card: "0 20px 40px rgba(31, 26, 23, 0.12)",
      },
      keyframes: {
        rise: {
          "0%": { opacity: "0", transform: "translateY(18px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        pulseRing: {
          "0%, 100%": { transform: "scale(1)", opacity: "0.65" },
          "50%": { transform: "scale(1.04)", opacity: "1" },
        },
      },
      animation: {
        rise: "rise 500ms ease-out both",
        pulseRing: "pulseRing 1.5s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
