/**
 * Today's snapshot opens the Performance tab, where the same four metrics
 * are full-width cards.
 *
 * Field request (2026-10-10): "When clicked each metric and graph they
 * should go to the Performance page and they should be full width there
 * not the same miniature version." Each Today tile is now a button to
 * Progress → Performance, scrolled to that metric's card; the Training
 * Load chart links to its full-size twin there. Performance draws the
 * metrics as full-width cards with a real chart over the chosen window.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, within, fireEvent } from '@testing-library/react'
import { cloneElement, isValidElement, type ReactElement } from 'react'

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
import TRIMPBreakdown from '../components/TRIMPBreakdown'
import Dashboard from '../components/Dashboard'
import { LOAD_SERIES_COLORS } from '../utils/loadSeriesColors'
import { localDateStr } from '../utils/format'
import { performanceTargetId } from '../utils/metricTrend'
import type { PerformanceMetrics } from '../types'

afterEach(() => {
  cleanup()
  document.documentElement.classList.remove('dark')
})
beforeEach(() => {
  localStorage.clear()
  // jsdom has no layout, so no scrollIntoView; the Performance tab calls it.
  Element.prototype.scrollIntoView = vi.fn()
})

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
const NAMES = ['Fitness', 'Fatigue', 'Recovery Balance', 'Load Ratio']

describe('Today: each snapshot tile opens its card', () => {
  it('every tile is a button naming where it goes, and says which metric', () => {
    const history = timeline(30)
    const onOpen = vi.fn()
    render(<PerformanceSnapshot latest={last(history)} history={history} onOpen={onOpen} />)
    const metrics = ['ctl', 'atl', 'tsb', 'acwr']
    NAMES.forEach((name, i) => {
      fireEvent.click(screen.getByRole('button', { name: `Open ${name} on Performance` }))
      expect(onOpen).toHaveBeenLastCalledWith(metrics[i])
    })
    expect(onOpen).toHaveBeenCalledTimes(4)
  })

  it('the glossary term on a tile still opens its definition, not the card', () => {
    const history = timeline(30)
    const onOpen = vi.fn()
    render(<PerformanceSnapshot latest={last(history)} history={history} onOpen={onOpen} />)
    const open = screen.getByRole('button', { name: 'Open Load Ratio on Performance' })
    const tile = open.parentElement!
    // The term is its own button, outside the tile button (no nesting).
    const term = within(tile).getAllByRole('button').find(b => b !== open)!
    expect(open.contains(term)).toBe(false)
    fireEvent.click(term)
    expect(onOpen).not.toHaveBeenCalled()
  })

  it('without a handler the tiles are not links', () => {
    const history = timeline(30)
    render(<PerformanceSnapshot latest={last(history)} history={history} />)
    expect(screen.queryByRole('button', { name: /on Performance$/ })).toBeNull()
  })

  it('the Training Load chart links to its full-size twin only when asked', () => {
    const perf = timeline(30)
    const daily = perf.map(p => ({ date: p.date, total: 90, records: [{ sportType: 'running', adjustedTRIMP: 90 }] }))
    const onOpenFull = vi.fn()
    render(<TRIMPBreakdown dailyTrimp={daily as never} performance={perf} athleteId="mike" onOpenFull={onOpenFull} />)
    fireEvent.click(screen.getByRole('button', { name: 'See full chart on Performance ›' }))
    expect(onOpenFull).toHaveBeenCalledTimes(1)
    cleanup()
    render(<TRIMPBreakdown dailyTrimp={daily as never} performance={perf} athleteId="mike" />)
    expect(screen.queryByRole('button', { name: /See full chart/ })).toBeNull()
  })
})

describe('Performance: four full-width cards', () => {
  it('one card per metric, each with an id to scroll to and a real chart in its colour', () => {
    const history = timeline(30)
    const { container } = render(<PerformanceSnapshot latest={last(history)} history={history} layout="cards" />)
    expect(screen.queryAllByTestId('metric-sparkline')).toHaveLength(0)
    const ids = ['ctl', 'atl', 'tsb', 'acwr'] as const
    NAMES.forEach((name, i) => {
      const card = screen.getByRole('region', { name })
      expect(card.id).toBe(performanceTargetId(ids[i]))
      expect(card.querySelector('.recharts-xAxis')).toBeTruthy()
      expect(card.querySelector('.recharts-yAxis')).toBeTruthy()
    })
    const stroke = (name: string) => screen.getByRole('region', { name }).querySelector('.metric-trend-line .recharts-line-curve')?.getAttribute('stroke')
    expect(stroke('Fitness')).toBe(LOAD_SERIES_COLORS.ctl.light.hex)
    expect(stroke('Fatigue')).toBe(LOAD_SERIES_COLORS.atl.light.hex)
    expect(stroke('Recovery Balance')).toBe(LOAD_SERIES_COLORS.tsb.light.hex)
    expect(container.querySelectorAll('section')).toHaveLength(4)
  })

  it('the same number, zone, note and change as the tile', () => {
    const history = timeline(30)
    render(<PerformanceSnapshot latest={last(history)} history={history} layout="cards" />)
    const rb = screen.getByRole('region', { name: 'Recovery Balance' })
    expect(within(rb).getByText(`${Math.round(last(history).tsb)}`)).toBeTruthy()
    expect(within(rb).getByText('Overreaching')).toBeTruthy()
    const fit = screen.getByRole('region', { name: 'Fitness' })
    expect(within(fit).getByText('High fitness — protect with smart recovery')).toBeTruthy()
    expect(within(fit).getByText(/vs 7d ago/).parentElement!.textContent).toMatch(/^▲ \+\d+ vs 7d ago$/)
  })

  it('Recovery Balance draws its zero line; Load Ratio its in-range band', () => {
    const history = timeline(30)
    render(<PerformanceSnapshot latest={last(history)} history={history} layout="cards" />)
    expect(screen.getByRole('region', { name: 'Recovery Balance' }).querySelector('.recharts-reference-line')).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Load Ratio' }).querySelector('.recharts-reference-area')).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Fitness' }).querySelector('.recharts-reference-line, .recharts-reference-area')).toBeNull()
  })

  it('the chart covers the chosen window, not the whole history', () => {
    const history = timeline(60)
    const window = history.slice(-30)
    render(<PerformanceSnapshot latest={last(history)} history={history} layout="cards" series={window} />)
    expect(screen.getByRole('img', { name: new RegExp(`^Fitness from ${window[0].date} .* to ${last(window).date}`) })).toBeTruthy()
  })

  it('a window with one day says so instead of drawing a dot', () => {
    const history = timeline(30)
    render(<PerformanceSnapshot latest={last(history)} history={history} layout="cards" series={history.slice(-1)} />)
    expect(screen.getAllByText('Not enough history in this window yet.')).toHaveLength(4)
  })
})

describe('Progress → Performance lands on the tapped card', () => {
  function renderDashboard(extra: Record<string, unknown>) {
    const performance = timeline(30)
    const dailyTrimp = performance.map(p => ({ date: p.date, total: 90, records: [{ sportType: 'running', adjustedTRIMP: 90 }] }))
    return render(
      <Dashboard
        weeks={[]}
        compliance={{ overallPct: 0, weeks: [] } as never}
        raceDate="2026-12-05"
        dailyTrimp={dailyTrimp as never}
        performance={performance}
        garminConnected
        athleteId="mike"
        {...extra}
      />,
    )
  }

  it('opens the Performance tab and scrolls to the card, then clears both requests', () => {
    const scrolled: string[] = []
    const spy = vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(function (this: Element) { scrolled.push(this.id) })
    const tabHandled = vi.fn()
    const focusHandled = vi.fn()
    try {
      renderDashboard({ subTabRequest: 'performance', onSubTabRequestHandled: tabHandled, performanceFocus: 'atl', onPerformanceFocusHandled: focusHandled })
      expect(screen.getByRole('region', { name: 'Fatigue' })).toBeTruthy()
      expect(scrolled).toEqual(['perf-atl'])
      expect(tabHandled).toHaveBeenCalled()
      expect(focusHandled).toHaveBeenCalled()
    } finally {
      spy.mockRestore()
    }
  })

  it('the Training Load link scrolls to the chart', () => {
    const scrolled: string[] = []
    const spy = vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(function (this: Element) { scrolled.push(this.id) })
    try {
      renderDashboard({ subTabRequest: 'performance', performanceFocus: 'load', onPerformanceFocusHandled: () => {} })
      expect(scrolled).toEqual(['perf-load'])
    } finally {
      spy.mockRestore()
    }
  })

  it('with the Performance tab hidden, the focus request is dropped, not left for later', () => {
    localStorage.setItem('ba_display_prefs_v1:mike', JSON.stringify({ detailLevel: 'balanced', sectionOverrides: { 'dash.tabPerformance': false } }))
    const focusHandled = vi.fn()
    renderDashboard({ subTabRequest: 'performance', performanceFocus: 'ctl', onPerformanceFocusHandled: focusHandled })
    expect(focusHandled).toHaveBeenCalled()
    expect(screen.queryByRole('region', { name: 'Fitness' })).toBeNull()
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled()
  })
})

describe('Today offers the links only where they land', () => {
  const SUMMARY = Object.values(import.meta.glob('../components/Summary.tsx', { query: '?raw', import: 'default', eager: true }))[0] as string
  it('tiles need the Performance tab and its chart; the load link needs the tab and the load chart', () => {
    expect(SUMMARY).toMatch(/performanceShown = !!onOpenPerformance && isSectionVisible\('dash\.tabPerformance'\)/)
    expect(SUMMARY).toMatch(/openMetric = performanceShown && isSectionVisible\('dash\.performanceChart'\)/)
    expect(SUMMARY).toMatch(/openLoadChart = performanceShown && isSectionVisible\('dash\.trimpBreakdown'\)/)
    expect(SUMMARY).toContain('onOpen={openMetric}')
    expect(SUMMARY).toContain('onOpenFull={openLoadChart}')
  })
})

describe('Today → Progress wiring (App)', () => {
  const APP = Object.values(import.meta.glob('../App.tsx', { query: '?raw', import: 'default', eager: true }))[0] as string
  it('a tap sets the focus, asks for the Performance sub-tab and switches to Progress', () => {
    const line = APP.split('\n').find(l => l.includes('onOpenPerformance='))!
    expect(line).toContain('setPerformanceFocus(target)')
    expect(line).toContain("setDashSubTabRequest('performance')")
    expect(line).toContain("setView('progress')")
    expect(APP).toContain('performanceFocus={performanceFocus}')
    expect(APP).toContain('onPerformanceFocusHandled={() => setPerformanceFocus(null)}')
  })
})
