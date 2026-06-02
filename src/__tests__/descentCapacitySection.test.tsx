import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import DescentCapacitySection from '../components/DescentCapacitySection'
import type { WeekCompliance } from '../hooks/useCompliance'
import type { RaceInfo } from '../types'

/** Build a minimal WeekCompliance row — only the fields the section reads
 *  matter. The rest can stay at zero/empty. */
function wk(num: number, actualFt: number, plannedFt = 0, plannedMiles = 0): WeekCompliance {
  return {
    weekNum: num,
    completed: 0,
    missed: 0,
    restDays: 0,
    totalWorkouts: 0,
    plannedMiles,
    actualMiles: 0,
    plannedElevation: plannedFt,
    actualElevation: actualFt,
    plannedDuration: 0,
    actualDuration: 0,
    hrCompliance: 0,
    hrCheckedWorkouts: 0,
    hrInZoneTotal: 0,
    days: [],
    distanceCompliancePct: 0,
    durationCompliancePct: 0,
    flaggedCount: 0,
  }
}

/** A date N days from today as YYYY-MM-DD, so taper-window behaviour is
 *  deterministic regardless of when the suite runs (the component reads the
 *  real clock via weeksUntilRace). */
function daysFromNow(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

// ~10 weeks out → no taper (band at full peak). Default for band-formula tests.
function brokenArrow18k(date = daysFromNow(70)): RaceInfo {
  return {
    name: 'Broken Arrow 18K',
    date,
    startTime: '08:00',
    distance: '18K',
    distanceMiles: 11.2,
    elevation: '3,850 ft',
    elevationRange: '6,200–9,000 ft',
    course: 'Palisades Tahoe',
    cutoff: '6h',
    landmarks: [],
    gear: [],
    nutrition: '',
  }
}

describe('<DescentCapacitySection>', () => {
  it('hides itself when no week has any logged climb', () => {
    const weeks = [wk(1, 0), wk(2, 0), wk(3, 0)]
    const { container } = render(
      <DescentCapacitySection weeks={weeks} race={brokenArrow18k()} />
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('surfaces the most recent week with logged climb as the headline', () => {
    const weeks = [wk(1, 1200), wk(2, 3400), wk(3, 0)] // wk 3 not yet logged
    render(<DescentCapacitySection weeks={weeks} race={brokenArrow18k()} />)
    expect(screen.getByText('3,400')).toBeInTheDocument()
    expect(screen.getByText(/hard climb/i)).toBeInTheDocument()
  })

  it('falls back to the race-demand band when no mileage is known', () => {
    // No plannedMiles → volume anchor disabled, no taper (race far out) →
    // band is the race cap 1.2–1.8× of 3,850 ft = 4,620–6,930 ft/wk.
    const weeks = [wk(1, 1500)]
    render(<DescentCapacitySection weeks={weeks} race={brokenArrow18k()} />)
    expect(screen.getByText(/Race climbs 3,850 ft · band 4,620.6,930 ft\/wk/)).toBeInTheDocument()
  })

  it('anchors the band to weekly mileage when volume is the binding limit', () => {
    // Peak 18 mi/wk → volume band 18×[110,175] = 1,980–3,150 ft, well under the
    // race cap, so the realistic target is the volume band — not 4,620–6,930.
    const weeks = [wk(1, 2000, 0, 18)]
    render(<DescentCapacitySection weeks={weeks} race={brokenArrow18k()} />)
    expect(screen.getByText(/band 1,980.3,150 ft\/wk/)).toBeInTheDocument()
  })

  it('tells a volume-bound athlete to build mileage, not add hills, when short', () => {
    const weeks = [wk(1, 1500, 0, 18)] // band 1,980–3,150; 1,500 is below
    render(<DescentCapacitySection weeks={weeks} race={brokenArrow18k()} />)
    expect(screen.getByText(/build weekly mileage/i)).toBeInTheDocument()
  })

  it('treats a hair under the band as in-band (tolerance), not a shortfall', () => {
    // 4,466 is ~3% under the 4,620 floor — within the ±10% slack.
    const weeks = [wk(1, 4466)]
    render(<DescentCapacitySection weeks={weeks} race={brokenArrow18k()} />)
    expect(screen.getByText(/squarely in/i)).toBeInTheDocument()
    expect(screen.queryByText(/add a hill session/i)).not.toBeInTheDocument()
  })

  it('eases the band and the advice during the taper', () => {
    // ~10 days out → weeksUntilRace = 2 → taper 0.7 on the 4,620–6,930 band
    // = 3,234–4,851 ft/wk, and below-band reads as on-plan, not a warning.
    const weeks = [wk(1, 1500)]
    render(<DescentCapacitySection weeks={weeks} race={brokenArrow18k(daysFromNow(10))} />)
    expect(screen.getByText(/band 3,234.4,851 ft\/wk/)).toBeInTheDocument()
    expect(screen.getByText(/taper/i)).toBeInTheDocument()
    expect(screen.queryByText(/add a hill session/i)).not.toBeInTheDocument()
  })

  it('falls back to a "pick a race" subtitle when no race is set', () => {
    const weeks = [wk(1, 1500)]
    render(<DescentCapacitySection weeks={weeks} />)
    expect(screen.getByText(/pick a target race/i)).toBeInTheDocument()
  })

  it('renders the chart heading "Weekly climb"', () => {
    const weeks = [wk(1, 1500)]
    render(<DescentCapacitySection weeks={weeks} race={brokenArrow18k()} />)
    expect(screen.getByText(/weekly climb/i)).toBeInTheDocument()
  })
})
