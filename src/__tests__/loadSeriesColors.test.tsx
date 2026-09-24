/**
 * Field bug (2026-09-24): on the Ocean theme the Fitness line drew purple,
 * Fatigue amber and 7d Load teal, under blue / red / green / amber legend
 * chips and stat cards. One table now feeds the line, the chip and the
 * card; these tests render the real chart lines and fail if any of the
 * three stops agreeing.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { cloneElement, isValidElement, type ReactElement } from 'react'
import colors from 'tailwindcss/colors'

// jsdom has no layout, so ResponsiveContainer measures 0×0 and draws
// nothing. A fixed size lets Recharts render the real SVG lines.
vi.mock('recharts', async importOriginal => {
  const actual = await importOriginal<typeof import('recharts')>()
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: ReactElement }) =>
      isValidElement(children)
        ? cloneElement(children as ReactElement<{ width: number; height: number }>, { width: 400, height: 220 })
        : null,
  }
})

import PerformanceChart from '../components/PerformanceChart'
import TRIMPBreakdown from '../components/TRIMPBreakdown'
import { LOAD_SERIES_COLORS, type LoadSeries } from '../utils/loadSeriesColors'
import type { PerformanceMetrics } from '../types'

afterEach(() => {
  cleanup()
  document.documentElement.classList.remove('dark')
})
beforeEach(() => localStorage.clear())

const SERIES: LoadSeries[] = ['ctl', 'atl', 'tsb', 'load']

function perf(n: number, m: Partial<PerformanceMetrics> = {}): PerformanceMetrics[] {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(2026, 7, 1 + i)
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    return { date: iso, ctl: 54.8, atl: 84.8, tsb: -30.1, acwr: 1.55, ...m }
  })
}

function renderChart(performance = perf(30)) {
  localStorage.setItem('ba_display_prefs_v1:mike', JSON.stringify({ detailLevel: 'detailed' }))
  const dailyTrimp = performance.map(p => ({ date: p.date, total: 80 }))
  return render(
    <PerformanceChart performance={performance} dailyTrimp={dailyTrimp as never} recommendations={[]} raceDate="2026-12-05" athleteId="mike" />,
  )
}

/** Stroke of the drawn line(s) for a series, read off the rendered SVG. */
function strokes(container: HTMLElement, cls: string): string[] {
  return [...container.querySelectorAll(`.${cls} .recharts-area-curve`)].map(e => e.getAttribute('stroke') ?? '')
}

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
})

/** WCAG contrast ratio between two hex colors. */
function contrast(a: string, b: string): number {
  const lum = (h: string) => {
    const [r, g, bl] = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255)
      .map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl
  }
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m)
  return (x + 0.05) / (y + 0.05)
}

/** The hex behind a `text-white` / `text-slate-950` class. */
function textHex(cls: string): string {
  if (cls === 'text-white') return '#ffffff'
  const [, hue, step] = cls.match(/^text-([a-z]+)-(\d+)$/)!
  return (colors as unknown as Record<string, Record<string, string>>)[hue][step]
}

describe('legend chip labels are readable', () => {
  it.each(SERIES)('%s: the label clears 4.5:1 on its fill, light and dark', key => {
    const c = LOAD_SERIES_COLORS[key]
    const classes = c.chipOn.split(' ')
    const light = classes.find(k => /^text-/.test(k))!
    const dark = classes.find(k => /^dark:text-/.test(k))?.slice(5) ?? light
    expect(contrast(textHex(light), c.light.hex)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(textHex(dark), c.dark.hex)).toBeGreaterThanOrEqual(4.5)
  })
})

describe('PerformanceChart: every line matches its chip, on any theme', () => {
  it('Ocean theme, light: each line and its chip are the same color', () => {
    localStorage.setItem('ba_palette', 'ocean')
    const { container } = renderChart()
    const chip = (name: RegExp) => screen.getByRole('button', { name }).className
    const cases: [LoadSeries, RegExp][] = [['ctl', /^✓ Fitness$/], ['atl', /^✓ Fatigue$/], ['tsb', /^✓ Recovery$/], ['load', /^✓ 7d Load$/]]
    for (const [key, name] of cases) {
      expect(strokes(container, `series-${key}`)).toEqual([LOAD_SERIES_COLORS[key].light.hex])
      expect(chip(name)).toContain(LOAD_SERIES_COLORS[key].chipOn)
    }
    // The dashed guide lines belong to Fitness.
    expect(strokes(container, 'series-ctl-guide')).toEqual([LOAD_SERIES_COLORS.ctl.light.hex, LOAD_SERIES_COLORS.ctl.light.hex])
  })

  it('dark mode draws the dark step of each series', () => {
    localStorage.setItem('ba_palette', 'sunset')
    document.documentElement.classList.add('dark')
    const { container } = renderChart()
    for (const key of SERIES) {
      expect(strokes(container, `series-${key}`)).toEqual([LOAD_SERIES_COLORS[key].dark.hex])
    }
  })

  it('Fitness and Fatigue values wear their line color; each of the three cards carries its swatch', () => {
    renderChart()
    expect(screen.getByText('54.8').className).toContain(LOAD_SERIES_COLORS.ctl.text)
    expect(screen.getByText('84.8').className).toContain(LOAD_SERIES_COLORS.atl.text)
    // Recovery Balance keeps its zone color (overreaching = red).
    expect(screen.getByText('-30.1').className).toContain('text-red-600')
    for (const key of ['ctl', 'atl', 'tsb'] as const) {
      const swatchCls = LOAD_SERIES_COLORS[key].swatch.split(' ')[0]
      expect(document.querySelectorAll(`span.${swatchCls}`).length).toBe(1)
    }
  })

  it('a build-week Recovery Balance reads neutral, not Fitness blue', () => {
    renderChart(perf(30, { tsb: -20.0 }))
    const value = screen.getByText('-20.0').className
    expect(value).toContain('text-slate-700')
    expect(value).not.toMatch(/text-blue-/)
  })

  it('a short history (5 days) still draws the Recovery line in the collapsed chart', () => {
    const { container } = renderChart(perf(5))
    const curve = container.querySelector('.series-tsb .recharts-area-curve')
    expect(curve?.getAttribute('d')).toBeTruthy()
  })
})

describe('TRIMPBreakdown: the Fatigue trend and the in-range band wear the same colors', () => {
  function trimpDays(n: number) {
    return Array.from({ length: n }, (_, i) => {
      const d = new Date()
      d.setDate(d.getDate() - (n - 1 - i))
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      return {
        daily: { date: iso, total: 90, records: [{ sportType: 'hiit', adjustedTRIMP: 90 }] },
        perf: { date: iso, ctl: 55, atl: 70, tsb: -15, acwr: 1.27 },
      }
    })
  }

  it('the acute-load line is Fatigue red on a white halo; the band is Fitness blue; the legend says so', () => {
    const days = trimpDays(7)
    const { container } = render(
      <TRIMPBreakdown dailyTrimp={days.map(d => d.daily) as never} performance={days.map(d => d.perf)} athleteId="mike" />,
    )
    const line = (cls: string) => container.querySelector(`.${cls} .recharts-line-curve`)?.getAttribute('stroke')
    expect(line('series-atl')).toBe(LOAD_SERIES_COLORS.atl.light.hex)
    expect(line('series-atl-halo')).toBe('#ffffff')
    const band = strokes(container, 'series-ctl-guide')
    expect(band.length).toBeGreaterThan(0)
    expect(band.every(c => c === LOAD_SERIES_COLORS.ctl.light.hex)).toBe(true)
    expect(screen.getAllByText('Fatigue (acute load)').length).toBeGreaterThan(0)
    expect(screen.getByText('in range (from Fitness)')).toBeTruthy()
  })
})
