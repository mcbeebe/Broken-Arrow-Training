import { DEFAULT_PALETTE_ID, PALETTE_STORAGE_KEY, getPalette, type PaletteId } from '../palettes'

// Recharts series take JS color values (SVG stroke/fill can't use Tailwind
// classes), so charts read brand series colors from here instead of hardcoding
// hexes. Reads the active palette directly (race-free vs. getComputedStyle).
// Semantic status colors (on-target green / missed red) stay hardcoded in the
// charts — those are meaning, not brand.

function activePaletteId(): PaletteId {
  try {
    const raw = localStorage.getItem(PALETTE_STORAGE_KEY)
    if (raw) return getPalette(raw).id
  } catch {
    // ignore
  }
  return DEFAULT_PALETTE_ID
}

export interface ChartColors {
  accent: string
  chart1: string
  chart2: string
  chart3: string
  chart4: string
}

export function getChartColors(isDark: boolean): ChartColors {
  const palette = getPalette(activePaletteId())
  const v = isDark ? palette.dark : palette.light
  return { accent: v.accent, chart1: v.chart1, chart2: v.chart2, chart3: v.chart3, chart4: v.chart4 }
}
