import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import DescentCapacitySection from '../components/DescentCapacitySection'
import type { WeekCompliance } from '../hooks/useCompliance'
import type { RaceInfo } from '../types'

/** Build a minimal WeekCompliance row — only the fields the section reads
 *  matter. The rest can stay at zero/empty. */
function wk(num: number, actualFt: number, plannedFt = 0): WeekCompliance {
  return {
    weekNum: num,
    completed: 0,
    missed: 0,
    restDays: 0,
    totalWorkouts: 0,
    plannedMiles: 0,
    actualMiles: 0,
    plannedElevation: plannedFt,
    actualElevation: actualFt,
    hrCompliance: 0,
    hrCheckedWorkouts: 0,
    hrInZoneTotal: 0,
    days: [],
    distanceCompliancePct: 0,
    durationCompliancePct: 0,
    flaggedCount: 0,
  }
}

function brokenArrow18k(): RaceInfo {
  return {
    name: 'Broken Arrow 18K',
    date: '2026-06-21',
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
    // 3,400 ft → "3,400"
    expect(screen.getByText('3,400')).toBeInTheDocument()
    expect(screen.getByText(/hard climb/i)).toBeInTheDocument()
  })

  it('shows the race-ready band derived from the course gain', () => {
    const weeks = [wk(1, 1500)]
    render(<DescentCapacitySection weeks={weeks} race={brokenArrow18k()} />)
    // Course gain ~3,850 ft → band ~4,620-6,930 ft/wk (1.2-1.8×).
    expect(screen.getByText(/Race climbs 3,850 ft · band 4,620.6,930 ft\/wk/)).toBeInTheDocument()
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
