// Selectable color palettes. Each palette is a small set of semantic color
// tokens (accent + chart series) expressed as CSS custom properties, with
// separate light/dark values. usePalette applies the active set to the root
// element; Tailwind maps `accent`/`accent-strong`/… utilities to the vars.
//
// Scope note: this themes accent/brand surfaces and chart series only — the
// bulk of the app still uses its slate/teal utilities, which the default
// "Classic Teal" palette matches. Full tokenization is a follow-up.

export type PaletteId = 'classic' | 'forest' | 'sunset' | 'ocean' | 'contrast'

export interface PaletteVars {
  accent: string
  accentStrong: string
  accentSoft: string
  onAccent: string
  chart1: string
  chart2: string
  chart3: string
  chart4: string
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
    light: { accent: '#0d9488', accentStrong: '#0f766e', accentSoft: '#f0fdfa', onAccent: '#ffffff', chart1: '#0d9488', chart2: '#d97706', chart3: '#3b82f6', chart4: '#ef4444' },
    dark: { accent: '#2dd4bf', accentStrong: '#5eead4', accentSoft: '#134e4a', onAccent: '#042f2e', chart1: '#2dd4bf', chart2: '#fbbf24', chart3: '#60a5fa', chart4: '#f87171' },
  },
  {
    id: 'forest',
    name: 'Forest',
    desc: 'Earthy greens.',
    light: { accent: '#16a34a', accentStrong: '#15803d', accentSoft: '#f0fdf4', onAccent: '#ffffff', chart1: '#16a34a', chart2: '#ca8a04', chart3: '#0891b2', chart4: '#dc2626' },
    dark: { accent: '#4ade80', accentStrong: '#86efac', accentSoft: '#14532d', onAccent: '#052e16', chart1: '#4ade80', chart2: '#facc15', chart3: '#22d3ee', chart4: '#f87171' },
  },
  {
    id: 'sunset',
    name: 'Sunset',
    desc: 'Warm oranges.',
    light: { accent: '#ea580c', accentStrong: '#c2410c', accentSoft: '#fff7ed', onAccent: '#ffffff', chart1: '#ea580c', chart2: '#db2777', chart3: '#7c3aed', chart4: '#0d9488' },
    dark: { accent: '#fb923c', accentStrong: '#fdba74', accentSoft: '#7c2d12', onAccent: '#431407', chart1: '#fb923c', chart2: '#f472b6', chart3: '#a78bfa', chart4: '#2dd4bf' },
  },
  {
    id: 'ocean',
    name: 'Ocean',
    desc: 'Cool blues.',
    light: { accent: '#2563eb', accentStrong: '#1d4ed8', accentSoft: '#eff6ff', onAccent: '#ffffff', chart1: '#2563eb', chart2: '#0891b2', chart3: '#7c3aed', chart4: '#f59e0b' },
    dark: { accent: '#60a5fa', accentStrong: '#93c5fd', accentSoft: '#1e3a8a', onAccent: '#0a1f44', chart1: '#60a5fa', chart2: '#22d3ee', chart3: '#a78bfa', chart4: '#fbbf24' },
  },
  {
    id: 'contrast',
    name: 'High Contrast',
    desc: 'Bold and accessible.',
    light: { accent: '#0f172a', accentStrong: '#020617', accentSoft: '#f1f5f9', onAccent: '#ffffff', chart1: '#0f172a', chart2: '#b45309', chart3: '#1d4ed8', chart4: '#b91c1c' },
    dark: { accent: '#f8fafc', accentStrong: '#ffffff', accentSoft: '#1e293b', onAccent: '#020617', chart1: '#f8fafc', chart2: '#fbbf24', chart3: '#93c5fd', chart4: '#fca5a5' },
  },
] as const

export function getPalette(id: PaletteId | string | null | undefined): Palette {
  return PALETTES.find(p => p.id === id) ?? PALETTES[0]
}
