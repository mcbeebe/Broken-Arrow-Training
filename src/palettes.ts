// Selectable color palettes. Each palette is a small set of semantic color
// tokens (the accent family) expressed as CSS custom properties, with
// separate light/dark values. usePalette applies the active set to the root
// element; Tailwind maps `accent`/`accent-strong`/… utilities to the vars.
//
// Scope note: this themes accent/brand surfaces only — chart series are
// identities with fixed colors (utils/loadSeriesColors.ts) — and the
// bulk of the app still uses its slate/teal utilities, which the default
// "Classic Teal" palette matches. Full tokenization is a follow-up.

export type PaletteId = 'classic' | 'forest' | 'sunset' | 'ocean' | 'contrast'

export interface PaletteVars {
  accent: string
  accentStrong: string
  accentSoft: string
  onAccent: string
}

export interface Palette {
  id: PaletteId
  name: string
  /** Short hint shown under the swatch. */
  desc: string
  light: PaletteVars
  dark: PaletteVars
}

export const DEFAULT_PALETTE_ID: PaletteId = 'classic'

export const PALETTE_STORAGE_KEY = 'ba_palette'

export const PALETTES: ReadonlyArray<Palette> = [
  {
    id: 'classic',
    name: 'Classic Teal',
    desc: "The original look.",
    light: { accent: '#0d9488', accentStrong: '#0f766e', accentSoft: '#f0fdfa', onAccent: '#ffffff' },
    dark: { accent: '#2dd4bf', accentStrong: '#5eead4', accentSoft: '#134e4a', onAccent: '#042f2e' },
  },
  {
    id: 'forest',
    name: 'Forest',
    desc: 'Earthy greens.',
    light: { accent: '#16a34a', accentStrong: '#15803d', accentSoft: '#f0fdf4', onAccent: '#ffffff' },
    dark: { accent: '#4ade80', accentStrong: '#86efac', accentSoft: '#14532d', onAccent: '#052e16' },
  },
  {
    id: 'sunset',
    name: 'Sunset',
    desc: 'Warm oranges.',
    light: { accent: '#ea580c', accentStrong: '#c2410c', accentSoft: '#fff7ed', onAccent: '#ffffff' },
    dark: { accent: '#fb923c', accentStrong: '#fdba74', accentSoft: '#7c2d12', onAccent: '#431407' },
  },
  {
    id: 'ocean',
    name: 'Ocean',
    desc: 'Cool blues.',
    light: { accent: '#2563eb', accentStrong: '#1d4ed8', accentSoft: '#eff6ff', onAccent: '#ffffff' },
    dark: { accent: '#60a5fa', accentStrong: '#93c5fd', accentSoft: '#1e3a8a', onAccent: '#0a1f44' },
  },
  {
    id: 'contrast',
    name: 'High Contrast',
    desc: 'Bold and accessible.',
    light: { accent: '#0f172a', accentStrong: '#020617', accentSoft: '#f1f5f9', onAccent: '#ffffff' },
    dark: { accent: '#f8fafc', accentStrong: '#ffffff', accentSoft: '#1e293b', onAccent: '#020617' },
  },
] as const

export function getPalette(id: PaletteId | string | null | undefined): Palette {
  return PALETTES.find(p => p.id === id) ?? PALETTES[0]
}
