import type { Config } from "tailwindcss"

const config: Config = {
  content: [
    "./pages/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./app/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
    "*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ["var(--font-display)"],
        text: ["var(--font-text)"],
        sans: ["var(--font-text)"],
        silkscreen: ["var(--font-silkscreen)", "monospace"],
      },
    },
  },
  plugins: [],
}

export default config
