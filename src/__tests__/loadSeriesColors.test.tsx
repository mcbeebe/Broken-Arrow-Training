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
