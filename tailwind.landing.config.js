/**
 * Tailwind config for the landing page only (initiative 003). The landing CSS
 * loads it with `@config`, so the page ships only the utilities it uses, not
 * the app's. Colors come from src/landing/tokens.ts as `landing-*`.
 *
 * @type {import('tailwindcss').Config}
 */
import { SIGNAL } from './src/landing/tokens.ts'

const kebab = s => s.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`)

export default {
  content: ['./index.html', './src/landing/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        landing: Object.fromEntries(Object.entries(SIGNAL).map(([k, v]) => [kebab(k), v])),
      },
      fontFamily: {
        landing: ['"Schibsted Grotesk"', 'system-ui', 'sans-serif'],
      },
      maxWidth: {
        landing: '1180px',
      },
      boxShadow: {
        'landing-float': '0 30px 60px -30px rgba(18,50,46,0.45), 0 0 0 1px rgba(15,23,42,0.06)',
        'landing-segment': '0 1px 2px rgba(15,23,42,0.15)',
      },
    },
  },
  plugins: [],
}
