/**
 * Field bug (2026-09-24): on the Ocean theme the Fitness line drew purple,
 * Fatigue amber and 7d Load teal, under blue / red / green / amber legend
 * chips and stat cards. One table now feeds the line, the chip and the
 * card; these tests fail if any of the three stops agreeing.
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import colors from 'tailwindcss/colors'
import PerformanceChart from '../components/PerformanceChart'
import { LOAD_SERIES_COLORS, seriesHex, type LoadSeries } from '../utils/loadSeriesColors'
import type { PerformanceMetrics } from '../types'

afterEach(cleanup)
beforeEach(() => localStorage.clear())

const SERIES: LoadSeries[] = ['ctl', 'atl', 'tsb', 'load']

describe('the series color table', () => {
  it.each(SERIES)('%s: each hex is the Tailwind step its chip and swatch classes name', key => {
    const c = LOAD_SERIES_COLORS[key]
    const hue = colors[c.hue] as Record<number, string>
    expect(c.light.hex).toBe(hue[c.light.step])
    expect(c.dark.hex).toBe(hue[c.dark.step])
    for (const cls of [c.chipOn, c.swatch]) {
      expect(cls).toContain(`bg-${c.hue}-${c.light.step}`)
      if (c.dark.step !== c.light.step) expect(cls).toContain(`dark:bg-${c.hue}-${c.dark.step}`)
    }
  })

  it('the line color does not follow the theme palette', () => {
    localStorage.setItem('ba_palette', 'ocean')
    expect(seriesHex('ctl', false)).toBe('#2563eb')
    expect(seriesHex('atl', false)).toBe('#dc2626')
    expect(seriesHex('tsb', false)).toBe('#0d9488')
    expect(seriesHex('load', false)).toBe('#d97706')
  })

  it('the four identities are distinct in both modes', () => {
    expect(new Set(SERIES.map(k => seriesHex(k, false))).size).toBe(4)
    expect(new Set(SERIES.map(k => seriesHex(k, true))).size).toBe(4)
  })
})

function perf(n: number): PerformanceMetrics[] {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(2026, 7, 1 + i)
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    return { date: iso, ctl: 54.8, atl: 84.8, tsb: -30.1, acwr: 1.55 } as PerformanceMetrics
  })
}

describe('PerformanceChart legend and cards read the same table', () => {
  it('chips and stat cards wear the series colors, and cards carry a swatch', () => {
    localStorage.setItem('ba_display_prefs_v1:mike', JSON.stringify({ detailLevel: 'detailed' }))
    render(<PerformanceChart performance={perf(30)} recommendations={[]} raceDate="2026-12-05" athleteId="mike" />)
    const chip = (name: RegExp) => screen.getByRole('button', { name })
    expect(chip(/^✓ Fitness$/).className).toContain(LOAD_SERIES_COLORS.ctl.chipOn)
    expect(chip(/^✓ Fatigue$/).className).toContain(LOAD_SERIES_COLORS.atl.chipOn)
    expect(chip(/^✓ Recovery$/).className).toContain(LOAD_SERIES_COLORS.tsb.chipOn)
    expect(chip(/^✓ 7d Load$/).className).toContain(LOAD_SERIES_COLORS.load.chipOn)

    // Fitness and Fatigue values are the line's color.
    expect(screen.getByText('54.8').className).toContain(LOAD_SERIES_COLORS.ctl.text)
    expect(screen.getByText('84.8').className).toContain(LOAD_SERIES_COLORS.atl.text)
    // Recovery Balance keeps its zone color (overreaching = red) but is
    // tied to its teal line by the swatch.
    expect(screen.getByText('-30.1').className).toContain('text-red-600')
    for (const key of ['ctl', 'atl', 'tsb'] as const) {
      expect(document.querySelector(`span.${LOAD_SERIES_COLORS[key].swatch.split(' ')[0]}`)).not.toBeNull()
    }
  })
})
