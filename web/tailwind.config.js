/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        vif: {
          bg: '#09090b',
          surface: '#18181b',
          'surface-bright': '#27272a',
          border: '#27272a',
          'border-bright': '#3f3f46',
          accent: '#6366f1',
          'accent-bright': '#818cf8',
          success: '#22c55e',
          warning: '#eab308',
          danger: '#ef4444',
        }
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'glow': 'radial-gradient(ellipse at center, var(--tw-gradient-stops))',
      },
      boxShadow: {
        'glow-sm': '0 0 15px -3px rgb(99 102 241 / 0.3)',
        'glow': '0 0 30px -5px rgb(99 102 241 / 0.4)',
        'glow-lg': '0 0 50px -10px rgb(99 102 241 / 0.5)',
        'inner-glow': 'inset 0 1px 0 0 rgb(255 255 255 / 0.05)',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'glow-pulse': 'glow-pulse 2s ease-in-out infinite',
      },
      keyframes: {
        'glow-pulse': {
          '0%, 100%': { opacity: 0.4 },
          '50%': { opacity: 0.8 },
        }
      }
    },
  },
  plugins: [],
}
