import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { RaceInfo } from '../../types'
import RaceConditionsForecast from '../../components/RaceConditionsForecast'

// The forecast itself is network-backed and not what this file is about.
vi.mock('../../utils/weather', () => ({
  getDailyForecast: vi.fn(async () => null),
  getTypicalClimate: vi.fn(async () => null),
}))

/**
 * The race-day countdown.
 *
 * It used to read `Date.now()` mid-render, which made the component
 * non-idempotent: identical props could render "T-1 days" or "race day or
 * past" depending purely on which side of midnight a re-render happened to
 * land on — and nothing could test it, because the answer changed with the
 * wall clock. Today now arrives as a prop, so the boundary is pinnable.
 */

const race = (over: Partial<RaceInfo> = {}): RaceInfo => ({
  name: 'Broken Arrow 23k',
  date: 'Friday, June 19, 2026',
  startTime: '7:00 AM',
  distance: '23k',
  elevation: '4,000 ft',
  elevationRange: '6,200–8,700 ft',
  course: 'Loop',
  cutoff: '8 hours',
  landmarks: [],
  coordinates: { latitude: 39.19, longitude: -120.23, label: 'Palisades Tahoe, CA' },
  ...over,
} as RaceInfo)

beforeEach(() => vi.clearAllMocks())

describe('race-day countdown', () => {
  it('counts down the days to the race', () => {
    render(<RaceConditionsForecast race={race()} todayIso="2026-06-09" />)
    expect(screen.getByText(/T-10 days/)).toBeInTheDocument()
  })

  it('is the same answer for the same props, whenever it renders', () => {
    // The whole point: two renders with identical props agree. Under the old
    // Date.now() version this could only be true by luck of the clock.
    const { unmount } = render(<RaceConditionsForecast race={race()} todayIso="2026-06-09" />)
    const first = screen.getByText(/T-\d+ days/).textContent
    unmount()
    render(<RaceConditionsForecast race={race()} todayIso="2026-06-09" />)
    expect(screen.getByText(/T-\d+ days/).textContent).toBe(first)
  })

  it('flips to "race day or past" exactly on the race date, not a day early', () => {
    const { unmount } = render(<RaceConditionsForecast race={race()} todayIso="2026-06-18" />)
    expect(screen.getByText(/T-1 days/)).toBeInTheDocument()
    unmount()

    render(<RaceConditionsForecast race={race()} todayIso="2026-06-19" />)
    expect(screen.getByText(/race day or past/)).toBeInTheDocument()
  })

  it('stays "race day or past" once the race is behind the athlete', () => {
    render(<RaceConditionsForecast race={race()} todayIso="2026-06-25" />)
    expect(screen.getByText(/race day or past/)).toBeInTheDocument()
  })
})
