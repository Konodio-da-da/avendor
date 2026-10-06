import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Plus Jakarta Sans', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      colors: {
        emerald: { 400: '#4edea3', 500: '#10b981' },
        sapphire: '#3b82f6',
        violet: '#8b5cf6',
        amber: '#f59e0b',
      },
    },
  },
  plugins: [],
} satisfies Config
