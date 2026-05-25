import { useCallback, useEffect, useState } from 'react'
import {
  DEFAULT_PALETTE_ID,
  PALETTE_STORAGE_KEY,
  getPalette,
  type PaletteId,
  type PaletteVars,
} from '../palettes'

// Global color-palette preference (mirrors useTheme's global `ba_theme` key).
// Applies the active palette's CSS custom properties to the root element,
// re-applying whenever the resolved light/dark theme flips.

function readInitial(): PaletteId {
  try {
    const raw = localStorage.getItem(PALETTE_STORAGE_KEY)
    if (raw) return getPalette(raw).id
  } catch {
    // ignore
  }
  return DEFAULT_PALETTE_ID
}

function applyPalette(id: PaletteId, resolved: 'light' | 'dark') {
  const palette = getPalette(id)
  const vars: PaletteVars = resolved === 'dark' ? palette.dark : palette.light
  const root = document.documentElement.style
  root.setProperty('--color-accent', vars.accent)
  root.setProperty('--color-accent-strong', vars.accentStrong)
  root.setProperty('--color-accent-soft', vars.accentSoft)
  root.setProperty('--color-on-accent', vars.onAccent)
  root.setProperty('--chart-1', vars.chart1)
  root.setProperty('--chart-2', vars.chart2)
  root.setProperty('--chart-3', vars.chart3)
  root.setProperty('--chart-4', vars.chart4)
}

export function usePalette(resolved: 'light' | 'dark') {
  const [paletteId, setPaletteIdState] = useState<PaletteId>(() => readInitial())

  useEffect(() => {
    applyPalette(paletteId, resolved)
  }, [paletteId, resolved])

  const setPalette = useCallback((id: PaletteId) => {
    try {
      localStorage.setItem(PALETTE_STORAGE_KEY, id)
    } catch {
      // localStorage may be unavailable; the applied vars still update.
    }
    setPaletteIdState(id)
  }, [])

  return { paletteId, setPalette }
}
