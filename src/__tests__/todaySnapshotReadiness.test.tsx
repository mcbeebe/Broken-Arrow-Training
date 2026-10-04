/**
 * Today's "Performance snapshot" and "Week readiness trend".
 *
 * Field request (2026-10-04): Settings listed both switches for Today with
 * no card behind either. The cards are Progress's own — extracted into
 * PerformanceSnapshot and ReadinessTrend so both screens render one
 * component — and each switch now controls its card on Today.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import PerformanceSnapshot from '../components/PerformanceSnapshot'
import ReadinessTrend from '../components/ReadinessTrend'
import { tsbZone, acwrZone, ACWR_BOUNDS, ACWR_IN_RANGE_RAMPING_NOTE } from '../utils/loadZones'
import type { PerformanceMetrics, ReadinessScore } from '../types'

afterEach(cleanup)

const latest: PerformanceMetrics = { date: '2026-10-04', ctl: 48.2, atl: 61.5, tsb: -13.3, acwr: 1.12 }

const score = (date: string, displayScore: number, status: ReadinessScore['status']): ReadinessScore => ({
  date, composite: 0, displayScore, status, trainingState: 'B' as ReadinessScore['trainingState'],
  components: { hrv: 0, rhr: 0, sleep: 0, trainingLoad: 0 }, message: '',
})

describe('PerformanceSnapshot', () => {
  it('shows Fitness, Fatigue, Recovery Balance and Load Ratio with their zones', () => {
    render(<PerformanceSnapshot latest={latest} />)
    expect(screen.getByText('48')).toBeTruthy()
    expect(screen.getByText('62')).toBeTruthy()
    expect(screen.getByText('-13')).toBeTruthy()
    expect(screen.getByText('1.12')).toBeTruthy()
    expect(screen.getByText(tsbZone(latest.tsb).label)).toBeTruthy()
    expect(screen.getByText(acwrZone(latest.acwr, ACWR_BOUNDS).label)).toBeTruthy()
    expect(screen.getByText('Recovery Balance')).toBeTruthy()
    expect(screen.getByText('Load Ratio')).toBeTruthy()
  })

  it('names itself only where it stands alone', () => {
    // Today passes a heading; Progress, where the tiles sit under the
    // chart, does not.
    const { container } = render(<PerformanceSnapshot latest={latest} />)
    expect(container.querySelector('section')).toBeNull()
    cleanup()
    render(<PerformanceSnapshot latest={latest} heading="Performance snapshot" />)
    const section = screen.getByRole('region', { name: 'Performance snapshot' })
    expect(within(section).getByText('Load Ratio')).toBeTruthy()
  })

  it('says the ratio is climbing fast when the ramp alert is live', () => {
    render(<PerformanceSnapshot latest={latest} rampAlert />)
    expect(screen.getByText(`${acwrZone(latest.acwr, ACWR_BOUNDS).label} · climbing fast`)).toBeTruthy()
    expect(screen.getByText(ACWR_IN_RANGE_RAMPING_NOTE)).toBeTruthy()
  })

  it('gives the zone colors a readable dark step', () => {
    render(<PerformanceSnapshot latest={{ ...latest, tsb: -35 }} />)
    expect(screen.getByText('-35').className).toMatch(/text-red-600 dark:text-red-400/)
  })
})

describe('ReadinessTrend', () => {
  it('draws nothing without readiness data', () => {
    const { container } = render(<ReadinessTrend weekScores={[]} />)
    expect(container.firstChild).toBeNull()
  })

  it('draws a bar per day, with its score and date', () => {
    render(<ReadinessTrend weekScores={[
      score('2026-10-02', 81, 'GREEN'), score('2026-10-03', 55, 'YELLOW'), score('2026-10-04', 34, 'RED'),
    ]} />)
    expect(screen.getByText('7-Day Readiness Trend')).toBeTruthy()
    for (const t of ['81', '55', '34', '10-02', '10-03', '10-04']) expect(screen.getByText(t)).toBeTruthy()
    const bar = screen.getByText('34').nextElementSibling as HTMLElement
    expect(bar.className).toContain('bg-red-500')
    expect(bar.style.height).toBe('22px')
  })
})

describe('Today mounts both cards behind their switches', () => {
  const SOURCES = import.meta.glob(
    ['../components/Summary.tsx', '../components/Settings.tsx', '../components/Dashboard.tsx', '../components/PerformanceChart.tsx', '../App.tsx'],
    { query: '?raw', import: 'default', eager: true },
  ) as Record<string, string>
  const raw = (path: string) => SOURCES[path] ?? (() => { throw new Error(`${path} not loaded`) })()
  const SUMMARY = raw('../components/Summary.tsx')
  const SETTINGS = raw('../components/Settings.tsx')
  const guard = (tag: string) => {
    const at = SUMMARY.indexOf(`<${tag}`)
    expect(at, `${tag} not mounted on Today`).toBeGreaterThan(-1)
    return SUMMARY.slice(SUMMARY.lastIndexOf('{', at), at)
  }

  it('guards each card by its switch and its data, never by a watch', () => {
    expect(guard('PerformanceSnapshot')).toContain("isSectionVisible('summary.perfSnapshot') && latestPerf")
    expect(guard('ReadinessTrend')).toContain("isSectionVisible('summary.readinessTrend') && weekScores.length > 0")
    for (const tag of ['PerformanceSnapshot', 'ReadinessTrend']) expect(guard(tag)).not.toMatch(/garmin/i)
  })

  it('places them below the 7-day load, snapshot first', () => {
    const load = SUMMARY.indexOf('<TRIMPBreakdown')
    const snap = SUMMARY.indexOf('<PerformanceSnapshot')
    const trend = SUMMARY.indexOf('<ReadinessTrend')
    expect(load).toBeGreaterThan(-1)
    expect(snap).toBeGreaterThan(load)
    expect(trend).toBeGreaterThan(snap)
  })

  it('gets the week’s readiness scores from the app', () => {
    const mount = raw('../App.tsx').slice(raw('../App.tsx').indexOf('<Summary'))
    expect(mount.slice(0, mount.indexOf('/>'))).toContain('weekScores={readiness.weekScores}')
  })

  it('leaves no Today switch in Settings without a card behind it', () => {
    // Three of these sat orphaned for months; this keeps it from recurring.
    const ids = [...SETTINGS.matchAll(/\{ id: '(summary\.[A-Za-z]+)'/g)].map(m => m[1])
    expect(ids.length).toBeGreaterThanOrEqual(4)
    for (const id of ids) expect(SUMMARY, `${id} has no card on Today`).toContain(`isSectionVisible('${id}')`)
  })

  it('keeps Progress on the same components', () => {
    expect(raw('../components/Dashboard.tsx')).toContain('<ReadinessTrend weekScores={weekScores} />')
    const chart = raw('../components/PerformanceChart.tsx')
    expect(chart).toContain('<PerformanceSnapshot latest={latest}')
    expect(chart.slice(chart.indexOf('<PerformanceSnapshot'))).not.toMatch(/^<PerformanceSnapshot[^>]*heading=/)
  })
})
