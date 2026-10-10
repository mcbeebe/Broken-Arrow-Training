/**
 * Fitness you can see improve, and how the key metrics have tracked.
 *
 * Field request (2026-10-10): on Today's 30-day Training Load chart
 * Fitness was only the faint in-range band, on a load axis running to
 * 600, so a 64 → 75 gain was invisible; and the Performance snapshot
 * tiles showed today's number with no history. The chart now draws
 * Fitness on its own right-hand axis with its change over the range, and
 * each tile draws its last 14 days with the change vs 7 days ago.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import { cloneElement, isValidElement, type ReactElement } from 'react'

// jsdom has no layout, so ResponsiveContainer measures 0×0 and draws
// nothing. A fixed size lets Recharts render the real SVG.
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

import PerformanceSnapshot from '../components/PerformanceSnapshot'
import PerformanceChart from '../components/PerformanceChart'
import TRIMPBreakdown from '../components/TRIMPBreakdown'
import { LOAD_SERIES_COLORS } from '../utils/loadSeriesColors'
import { localDateStr } from '../utils/format'
import type { PerformanceMetrics } from '../types'

afterEach(() => {
  cleanup()
  document.documentElement.classList.remove('dark')
})
beforeEach(() => localStorage.clear())

/** `n` days ending today: Fitness 64 → 75 (linear), Fatigue 60 → 125. */
function timeline(n: number): PerformanceMetrics[] {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - (n - 1 - i))
    const t = n === 1 ? 1 : i / (n - 1)
    const ctl = Math.round((64 + 11 * t) * 10) / 10
    const atl = Math.round((60 + 65 * t) * 10) / 10
    return { date: localDateStr(d), ctl, atl, tsb: Math.round((ctl - atl) * 10) / 10, acwr: Math.round(atl / ctl * 100) / 100 }
  })
}
const last = <T,>(xs: T[]) => xs[xs.length - 1]

describe('Performance snapshot: a 14-day sparkline in each tile', () => {
  it('draws one per tile, named for screen readers', () => {
    const history = timeline(30)
    render(<PerformanceSnapshot latest={last(history)} history={history} />)
    const lines = screen.getAllByTestId('metric-sparkline')
    expect(lines).toHaveLength(4)
    for (const name of ['Fitness', 'Fatigue', 'Recovery Balance', 'Load Ratio']) {
      expect(screen.getByRole('img', { name: new RegExp(`^${name}, last 14 days:`) })).toBeTruthy()
    }
  })

  it('covers the last 14 days only, ending on the value the tile shows', () => {
    const history = timeline(30)
    render(<PerformanceSnapshot latest={last(history)} history={history} />)
    // Day 17 of 30 (14 days ago) to today, at the tile's precision.
    const from = Math.round(history[16].ctl)
    expect(screen.getByRole('img', { name: `Fitness, last 14 days: ${from} to 75` })).toBeTruthy()
    expect(screen.getByText('75')).toBeTruthy()
  })

  it('says the change vs 7 days ago, green for a Fitness gain, amber for rising Fatigue', () => {
    const history = timeline(30)
    render(<PerformanceSnapshot latest={last(history)} history={history} />)
    const fitGain = Math.round(last(history).ctl - history[22].ctl)
    const fitness = screen.getByText(`▲ +${fitGain}`, { exact: false })
    expect(fitness.className).toContain('text-green-700')
    expect(fitness.textContent).toContain('vs 7d ago')
    const fatGain = Math.round(last(history).atl - history[22].atl)
    expect(screen.getByText(`▲ +${fatGain}`, { exact: false }).className).toContain('text-amber-700')
  })

  it('draws the zero line on Recovery Balance and the in-range band on Load Ratio', () => {
    const history = timeline(30)
    render(<PerformanceSnapshot latest={last(history)} history={history} />)
    const rb = screen.getByRole('img', { name: /^Recovery Balance/ })
    expect(within(rb as unknown as HTMLElement).getByTestId('sparkline-baseline')).toBeTruthy()
    expect(within(rb as unknown as HTMLElement).queryByTestId('sparkline-band')).toBeNull()
    const lr = screen.getByRole('img', { name: /^Load Ratio/ })
    expect(within(lr as unknown as HTMLElement).getByTestId('sparkline-band')).toBeTruthy()
  })

  it('the lines wear their series colours (the dark steps in dark mode)', () => {
    document.documentElement.classList.add('dark')
    const history = timeline(30)
    render(<PerformanceSnapshot latest={last(history)} history={history} />)
    const stroke = (name: RegExp) => screen.getByRole('img', { name }).querySelector('path')?.getAttribute('stroke')
    expect(stroke(/^Fitness/)).toBe(LOAD_SERIES_COLORS.ctl.dark.hex)
    expect(stroke(/^Fatigue/)).toBe(LOAD_SERIES_COLORS.atl.dark.hex)
    expect(stroke(/^Recovery Balance/)).toBe(LOAD_SERIES_COLORS.tsb.dark.hex)
  })

  it('a week of history draws the line but no 7-day change it cannot know', () => {
    const history = timeline(7)
    render(<PerformanceSnapshot latest={last(history)} history={history} />)
    expect(screen.getAllByTestId('metric-sparkline')).toHaveLength(4)
    expect(screen.queryByText(/vs 7d ago/)).toBeNull()
  })

  it('no history, or a single day, leaves the tiles as they were', () => {
    const one = timeline(1)
    render(<PerformanceSnapshot latest={one[0]} />)
    expect(screen.queryAllByTestId('metric-sparkline')).toHaveLength(0)
    cleanup()
    render(<PerformanceSnapshot latest={one[0]} history={one} />)
    expect(screen.queryAllByTestId('metric-sparkline')).toHaveLength(0)
    expect(screen.getByText('Load Ratio')).toBeTruthy()
  })
})

describe('Progress: the sparklines read the whole timeline, not the chart window', () => {
  it('a 7-day chart window still gets 14-day sparklines', () => {
    const history = timeline(30)
    const week = history.slice(-7)
    render(
      <PerformanceChart performance={week} history={history} dailyTrimp={[]} recommendations={[]} raceDate="2026-12-05" athleteId="mike" />,
    )
    expect(screen.getByRole('img', { name: new RegExp(`^Fitness, last 14 days: ${Math.round(history[16].ctl)} to`) })).toBeTruthy()
  })
})

describe('Training Load chart: Fitness on its own axis', () => {
  function load(perf: PerformanceMetrics[]) {
    return perf.map(p => ({ date: p.date, total: 90, records: [{ sportType: 'running', adjustedTRIMP: 90 }] }))
  }

  it('draws a Fitness line in Fitness blue on a right-hand axis zoomed to its range', () => {
    const perf = timeline(30)
    const { container } = render(<TRIMPBreakdown dailyTrimp={load(perf) as never} performance={perf} range="30d" athleteId="mike" />)
    const line = container.querySelector('.series-ctl .recharts-line-curve')
    expect(line?.getAttribute('stroke')).toBe(LOAD_SERIES_COLORS.ctl.light.hex)
    expect(container.querySelector('.series-ctl-halo .recharts-line-curve')?.getAttribute('stroke')).toBe('#ffffff')
    expect(container.querySelectorAll('.recharts-yAxis')).toHaveLength(2)
    // jsdom draws no tick labels, so read the scale off the line itself:
    // on its own 60–80 axis, 64 → 75 climbs over half the plot. On the
    // load axis (0 to ~100+) the same gain was a sliver.
    const ys = [...(line?.getAttribute('d') ?? '').matchAll(/[-\d.]+,([-\d.]+)/g)].map(m => Number(m[1]))
    const plotHeight = 180
    expect(ys[0] - ys[ys.length - 1]).toBeGreaterThan(plotHeight * 0.45)
    expect(screen.getByText('Fitness (right axis)')).toBeTruthy()
  })

  it('says how far Fitness moved across the range, and since when', () => {
    const perf = timeline(30)
    render(<TRIMPBreakdown dailyTrimp={load(perf) as never} performance={perf} range="30d" athleteId="mike" />)
    const chip = screen.getByTestId('fitness-change')
    expect(chip.textContent).toContain('Fitness 75')
    expect(chip.textContent).toContain('▲ +11 (+17%)')
    expect(chip.textContent).toContain(`since ${perf[0].date.slice(5)}`)
    expect(within(chip).getByText('▲ +11 (+17%)').className).toContain('text-green-700')
  })

  it('the range sets the window: 7d measures the last week', () => {
    const perf = timeline(30)
    render(<TRIMPBreakdown dailyTrimp={load(perf) as never} performance={perf} range="7d" athleteId="mike" />)
    const gain = Math.round(last(perf).ctl - perf[23].ctl)
    expect(screen.getByTestId('fitness-change').textContent).toContain(`▲ +${gain}`)
  })

  it('a falling Fitness reads amber', () => {
    const perf = timeline(30).map((p, i) => ({ ...p, ctl: 80 - i * 0.5 }))
    render(<TRIMPBreakdown dailyTrimp={load(perf) as never} performance={perf} range="30d" athleteId="mike" />)
    const chip = screen.getByTestId('fitness-change')
    expect(chip.textContent).toContain('▼ −15')
    expect(within(chip).getByText(/▼/).className).toContain('text-amber-700')
  })

  it('stays in the simple view, where the Fatigue overlay is hidden', () => {
    localStorage.setItem('ba_display_prefs_v1:mike', JSON.stringify({ detailLevel: 'simple' }))
    const perf = timeline(30)
    const { container } = render(<TRIMPBreakdown dailyTrimp={load(perf) as never} performance={perf} range="30d" athleteId="mike" />)
    expect(container.querySelector('.series-ctl .recharts-line-curve')).toBeTruthy()
    expect(container.querySelector('.series-atl')).toBeNull()
  })

  it('dark mode: the dark step, on a halo in the card colour', () => {
    document.documentElement.classList.add('dark')
    const perf = timeline(30)
    const { container } = render(<TRIMPBreakdown dailyTrimp={load(perf) as never} performance={perf} range="30d" athleteId="mike" />)
    expect(container.querySelector('.series-ctl .recharts-line-curve')?.getAttribute('stroke')).toBe(LOAD_SERIES_COLORS.ctl.dark.hex)
    expect(container.querySelector('.series-ctl-halo .recharts-line-curve')?.getAttribute('stroke')).toBe('#1e293b')
  })

  it('without a load timeline: no Fitness line, axis or change', () => {
    const perf = timeline(30)
    const { container } = render(<TRIMPBreakdown dailyTrimp={load(perf) as never} range="30d" athleteId="mike" />)
    expect(container.querySelector('.series-ctl')).toBeNull()
    expect(container.querySelectorAll('.recharts-yAxis')).toHaveLength(1)
    expect(screen.queryByTestId('fitness-change')).toBeNull()
    expect(screen.queryByText('Fitness (right axis)')).toBeNull()
  })

  it('does not invent Fitness before the timeline starts', () => {
    // Only the last 3 days have readings: the chip measures from the first.
    const perf = timeline(3)
    render(<TRIMPBreakdown dailyTrimp={load(timeline(30)) as never} performance={perf} range="30d" athleteId="mike" />)
    expect(screen.getByTestId('fitness-change').textContent).toContain(`since ${perf[0].date.slice(5)}`)
  })
})

describe('both screens pass the whole timeline to the snapshot', () => {
  const RAW = import.meta.glob(['../components/Summary.tsx', '../components/Dashboard.tsx'], {
    query: '?raw', import: 'default', eager: true,
  }) as Record<string, string>
  const src = (file: string) => RAW[`../components/${file}`]

  it('Today', () => {
    const s = src('Summary.tsx')
    const el = s.slice(s.indexOf('<PerformanceSnapshot'), s.indexOf('/>', s.indexOf('<PerformanceSnapshot')))
    expect(el).toContain('history={performance}')
  })
  it('Progress', () => {
    const s = src('Dashboard.tsx')
    const el = s.slice(s.indexOf('<PerformanceChart'), s.indexOf('/>', s.indexOf('<PerformanceChart')))
    expect(el).toContain('history={performance}')
  })
})
