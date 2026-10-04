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
import { readinessIsCurrent } from '../utils/readinessRecency'
import { SECTION_GROUPS } from '../utils/sectionGroups'

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

describe('readinessIsCurrent', () => {
  const at = (date: string) => [score(date, 70, 'GREEN')]
  it('is current when the newest score is today or yesterday', () => {
    expect(readinessIsCurrent(at('2026-10-04'), '2026-10-04')).toBe(true)
    expect(readinessIsCurrent(at('2026-10-03'), '2026-10-04')).toBe(true)
    expect(readinessIsCurrent(at('2026-09-30'), '2026-10-01')).toBe(true)
  })

  it('is stale from two days back, and with no scores at all', () => {
    // A watch unsynced for twelve days still yields seven bars, all old.
    expect(readinessIsCurrent(at('2026-10-02'), '2026-10-04')).toBe(false)
    expect(readinessIsCurrent([score('2026-09-20', 70, 'GREEN'), score('2026-09-22', 64, 'YELLOW')], '2026-10-04')).toBe(false)
    expect(readinessIsCurrent([], '2026-10-04')).toBe(false)
  })
})

describe('Today mounts both cards behind their switches', () => {
  const SOURCES = import.meta.glob(
    ['../components/Summary.tsx', '../components/Dashboard.tsx', '../components/PerformanceChart.tsx', '../App.tsx'],
    { query: '?raw', import: 'default', eager: true },
  ) as Record<string, string>
  const raw = (path: string) => SOURCES[path] ?? (() => { throw new Error(`${path} not loaded`) })()
  const SUMMARY = raw('../components/Summary.tsx')
  const guard = (tag: string) => {
    const at = SUMMARY.indexOf(`<${tag}`)
    expect(at, `${tag} not mounted on Today`).toBeGreaterThan(-1)
    return SUMMARY.slice(SUMMARY.lastIndexOf('{', at), at)
  }
  /** The `<Tag … />` element as written in a file. */
  const element = (src: string, tag: string) => {
    const at = src.indexOf(`<${tag}`)
    expect(at, `${tag} not mounted`).toBeGreaterThan(-1)
    return src.slice(at, src.indexOf('/>', at) + 2)
  }
  const TODAY_IDS = SECTION_GROUPS.find(g => g.group === 'Summary')!.items.map(i => i.id)
  /** Where the card a switch guards is mounted: the `{… isSectionVisible(id) … && (` expression opening a JSX element. */
  const mountOf = (id: string) => {
    const m = new RegExp(`\\{[^{}\\n]*isSectionVisible\\('${id.replace('.', '\\.')}'\\)[^{}\\n]*&& \\(\\s*<[A-Z]`).exec(SUMMARY)
    return m ? m.index : -1
  }

  it('shows the snapshot whenever there is a load reading, watch or not', () => {
    expect(guard('PerformanceSnapshot')).toContain("isSectionVisible('summary.perfSnapshot') && latestPerf")
    expect(guard('PerformanceSnapshot')).not.toMatch(/garmin/i)
  })

  it('shows the readiness trend only with a live watch and a current score', () => {
    // An expired Garmin session keeps its cached scores; the trend sat
    // under "Connect a watch". The readiness sheet already waits for a
    // live watch.
    expect(guard('ReadinessTrend')).toContain(
      "isSectionVisible('summary.readinessTrend') && garminConnected && readinessIsCurrent(weekScores, localDateStr())",
    )
  })

  it('places them below the 7-day load, snapshot first', () => {
    const load = SUMMARY.indexOf('<TRIMPBreakdown')
    const snap = SUMMARY.indexOf('<PerformanceSnapshot')
    const trend = SUMMARY.indexOf('<ReadinessTrend')
    expect(load).toBeGreaterThan(-1)
    expect(snap).toBeGreaterThan(load)
    expect(trend).toBeGreaterThan(snap)
  })

  it('gets the readiness scores and the tuned Load Ratio bounds from the app', () => {
    const mount = element(raw('../App.tsx'), 'Summary')
    expect(mount).toContain('weekScores={readiness.weekScores}')
    expect(mount).toContain('acwrBounds={acwrBoundsFrom(readinessTuning)}')
  })

  it('mounts a card behind every Today switch in Settings', () => {
    // Three of these sat orphaned for months. A bare mention of the id
    // isn't enough: it must guard a mounted element.
    expect(TODAY_IDS.length).toBeGreaterThanOrEqual(4)
    for (const id of TODAY_IDS) expect(mountOf(id), `${id} guards no card on Today`).toBeGreaterThan(-1)
  })

  it('lists the Today switches in the order Today shows the cards', () => {
    const positions = TODAY_IDS.map(mountOf)
    expect(positions).toEqual([...positions].sort((a, b) => a - b))
  })

  it('keeps Progress on the same components, untitled', () => {
    expect(raw('../components/Dashboard.tsx')).toContain('<ReadinessTrend weekScores={weekScores} />')
    const tiles = element(raw('../components/PerformanceChart.tsx'), 'PerformanceSnapshot')
    expect(tiles).toContain('latest={latest}')
    expect(tiles).not.toContain('heading=')
  })
})
