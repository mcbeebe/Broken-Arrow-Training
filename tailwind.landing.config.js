/**
 * Tailwind config for the landing page only (initiative 003). The landing CSS
 * loads it with `@config`, so the page ships only the utilities it uses, not
 * the app's.
 *
 * Colors come from src/landing/tokens.ts. Each `landing-*` color is a CSS
 * custom property: the light palette by default, the dark one when the device
 * prefers dark (unless the visitor picked light) or when they picked dark.
 * The pick is `data-theme` on <html>, set by index.html before first paint
 * and by the header toggle (src/landing/theme.ts).
 *
 * @type {import('tailwindcss').Config}
 */
import plugin from 'tailwindcss/plugin'
import { SIGNAL, SIGNAL_DARK, tokenVar } from './src/landing/tokens.ts'

const kebab = s => s.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`)

const SHADOW_SEGMENT = {
  light: '0 1px 2px rgba(15,23,42,0.15)',
  dark: '0 1px 2px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.06)',
}

const SHADOW_FLOAT = {
  light: '0 30px 60px -30px rgba(18,50,46,0.45), 0 0 0 1px rgba(15,23,42,0.06)',
  // A dark shadow vanishes on a dark ground; a faint light hairline keeps the card's edge.
  dark: '0 30px 60px -30px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.07)',
}

/** The custom properties for one palette. `only light` stops browsers darkening the light page themselves. */
const vars = (palette, mode) => ({
  colorScheme: mode === 'dark' ? 'dark' : 'only light',
  '--landing-shadow-float': SHADOW_FLOAT[mode],
  '--landing-shadow-segment': SHADOW_SEGMENT[mode],
  ...Object.fromEntries(Object.entries(palette).map(([k, v]) => [tokenVar(k), v])),
})

export default {
  content: ['./index.html', './src/landing/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        landing: Object.fromEntries(Object.keys(SIGNAL).map(k => [kebab(k), `var(${tokenVar(k)})`])),
      },
      fontFamily: {
        landing: ['"Schibsted Grotesk"', 'system-ui', 'sans-serif'],
      },
      maxWidth: {
        landing: '1180px',
      },
      boxShadow: {
        'landing-float': 'var(--landing-shadow-float)',
        'landing-segment': 'var(--landing-shadow-segment)',
      },
    },
  },
  plugins: [
    plugin(({ addBase }) => {
      addBase({
        ':root': vars(SIGNAL, 'light'),
        '@media (prefers-color-scheme: dark)': {
          ':root:not([data-theme="light"])': vars(SIGNAL_DARK, 'dark'),
        },
        ':root[data-theme="dark"]': vars(SIGNAL_DARK, 'dark'),
      })
    }),
  ],
}
