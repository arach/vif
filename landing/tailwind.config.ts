import type { Config } from "tailwindcss"

const config: Config = {
  content: [
    "./pages/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./app/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
    "*.{js,ts,jsx,tsx,mdx}",
    "./node_modules/@arach/dewey/dist/**/*.js",
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ["var(--font-display)"],
        text: ["var(--font-text)"],
        sans: ["var(--font-text)"],
        fraunces: ["var(--font-fraunces)", "Georgia", "serif"],
      },
    },
  },
  plugins: [],
}

export default config
