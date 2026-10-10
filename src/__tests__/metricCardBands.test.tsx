/**
 * The Performance cards: a healthy band on each, a Smooth toggle and
 * tap-to-expand.
 *
 * Field request (2026-10-10): "they all should be expandable when clicked.
 * I also want to see the band/zone that represents appropriate, expected
 * and healthy range for each. I also want to be able to toggle a Smooth
 * option that is essentially a 3-day rolling average."
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react'
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
import { localDateStr } from '../utils/format'
import type { PerformanceMetrics } from '../types'

afterEach(cleanup)
beforeEach(() => localStorage.clear())

/** `n` days ending today with a saw-tooth Fatigue, so smoothing shows. */
function timeline(n: number): PerformanceMetrics[] {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - (n - 1 - i))
    const ctl = 60 + i * 0.5
    const atl = i % 2 === 0 ? 50 : 80
    return { date: localDateStr(d), ctl, atl, tsb: ctl - atl, acwr: Math.round(atl / ctl * 100) / 100 }
  })
}
const last = <T,>(xs: T[]) => xs[xs.length - 1]
const linePath = (name: string) =>
  screen.getByRole('region', { name }).querySelector('.metric-trend-line .recharts-line-curve')!.getAttribute('d')

describe('healthy bands', () => {
  it('each card says what its band means', () => {
    const h = timeline(30)
    render(<PerformanceSnapshot latest={last(h)} history={h} layout="cards" />)
    expect(within(screen.getByRole('region', { name: 'Fitness' })).getByText(/safe build, up to \+8 a week/)).toBeTruthy()
    expect(within(screen.getByRole('region', { name: 'Fatigue' })).getByText(/0\.8–1\.3× your Fitness/)).toBeTruthy()
    expect(within(screen.getByRole('region', { name: 'Recovery Balance' })).getByText(/−30 to \+15/)).toBeTruthy()
    expect(within(screen.getByRole('region', { name: 'Load Ratio' })).getByText(/0\.8–1\.3, the lowest-injury range/)).toBeTruthy()
  })

  it('the Load Ratio band follows the athlete’s tuned bounds', () => {
    const h = timeline(30)
    render(<PerformanceSnapshot latest={last(h)} history={h} layout="cards" acwrBounds={{ low: 0.8, sweetTop: 1.2, danger: 1.4 }} />)
    expect(within(screen.getByRole('region', { name: 'Load Ratio' })).getByText(/0\.8–1\.2/)).toBeTruthy()
  })

  it('a 7-day window still has a Fitness band from the week before it', () => {
    const h = timeline(30)
    const { container } = render(<PerformanceSnapshot latest={last(h)} history={h} series={h.slice(-7)} layout="cards" />)
    const fitness = container.querySelector('#perf-ctl')!
    expect(fitness.querySelector('.metric-healthy-band .recharts-area-area')).toBeTruthy()
  })
})

describe('Smooth (3-day average)', () => {
  it('is off by default; on, it averages the line and says so', () => {
    const h = timeline(30)
    render(<PerformanceSnapshot latest={last(h)} history={h} layout="cards" />)
    const toggle = screen.getByRole('switch', { name: /Smooth \(3-day avg\)/ })
    expect(toggle.getAttribute('aria-checked')).toBe('false')
    const raw = linePath('Fatigue')
    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-checked')).toBe('true')
    expect(linePath('Fatigue')).not.toBe(raw)
    expect(screen.getByRole('img', { name: /^Fatigue \(3-day avg\) from/ })).toBeTruthy()
  })

  it('leaves the headline number and the change raw', () => {
    const h = timeline(30)
    render(<PerformanceSnapshot latest={last(h)} history={h} layout="cards" />)
    const fatigue = () => screen.getByRole('region', { name: 'Fatigue' })
    const before = within(fatigue()).getByText(/vs 7d ago/).parentElement!.textContent
    fireEvent.click(screen.getByRole('switch', { name: /Smooth/ }))
    expect(within(fatigue()).getByText(`${Math.round(last(h).atl)}`, { selector: 'p' })).toBeTruthy()
    expect(within(fatigue()).getByText(/vs 7d ago/).parentElement!.textContent).toBe(before)
  })

  it('is remembered on this device', () => {
    const h = timeline(30)
    render(<PerformanceSnapshot latest={last(h)} history={h} layout="cards" />)
    fireEvent.click(screen.getByRole('switch', { name: /Smooth/ }))
    cleanup()
    render(<PerformanceSnapshot latest={last(h)} history={h} layout="cards" />)
    expect(screen.getByRole('switch', { name: /Smooth/ }).getAttribute('aria-checked')).toBe('true')
  })

  it('still works when storage is blocked', () => {
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
    try {
      const h = timeline(30)
      render(<PerformanceSnapshot latest={last(h)} history={h} layout="cards" />)
      const toggle = screen.getByRole('switch', { name: /Smooth/ })
      expect(toggle.getAttribute('aria-checked')).toBe('false')
      fireEvent.click(toggle)
      expect(toggle.getAttribute('aria-checked')).toBe('true')
    } finally {
      get.mockRestore()
      set.mockRestore()
    }
  })
})

describe('tap to expand', () => {
  it('each card’s chart opens full screen and closes again', () => {
    const h = timeline(30)
    render(<PerformanceSnapshot latest={last(h)} history={h} layout="cards" />)
    for (const name of ['Fitness', 'Fatigue', 'Recovery Balance', 'Load Ratio']) {
      fireEvent.click(screen.getByRole('button', { name: `Expand ${name} chart` }))
      const close = screen.getByRole('button', { name: 'Close' })
      // The full-screen copy is a second chart for the same metric.
      expect(screen.getAllByRole('img', { name: new RegExp(`^${name} from`) })).toHaveLength(2)
      fireEvent.click(close)
      expect(screen.queryByRole('button', { name: 'Close' })).toBeNull()
    }
  })

  it('the expanded chart keeps the band and the smoothing', () => {
    const h = timeline(30)
    render(<PerformanceSnapshot latest={last(h)} history={h} layout="cards" />)
    fireEvent.click(screen.getByRole('switch', { name: /Smooth/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Expand Fatigue (3-day avg) chart' }))
    const charts = screen.getAllByRole('img', { name: /^Fatigue \(3-day avg\) from/ })
    expect(charts).toHaveLength(2)
    expect(charts[1].querySelector('.metric-healthy-band .recharts-area-area')).toBeTruthy()
  })
})
