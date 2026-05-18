import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import DescentCapacitySection from '../components/DescentCapacitySection'
import type { CachedEccentric } from '../utils/runEccentric'
import type { RaceInfo } from '../types'

function ecc(opts: { ascentM?: number; descentM?: number }): CachedEccentric {
  return {
    averageScore: 2.5,
    totalKmScore: 1,
    buckets: { mild: 0, moderate: 0, severe: 0 },
    hardAscentVerticalMeters: opts.ascentM ?? 0,
    hardDescentVerticalMeters: opts.descentM ?? 0,
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
  it('hides itself when the eccentric cache has no vertical data', () => {
    const { container } = render(
      <DescentCapacitySection eccentricByActivity={{}} race={brokenArrow18k()} />
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('renders the climb + descent headlines and the stacked chart', () => {
    const cache: Record<string, CachedEccentric> = {
      '2026-05-13|Trail Run': ecc({ ascentM: 600, descentM: 800 }),
    }
    render(<DescentCapacitySection eccentricByActivity={cache} race={brokenArrow18k()} />)
    expect(screen.getByText(/hard climb/i)).toBeInTheDocument()
    expect(screen.getByText(/hard descent/i)).toBeInTheDocument()
    expect(screen.getByText(/weekly vertical workload/i)).toBeInTheDocument()
  })

  it('shows race-scaled band subtitles in feet when a curated race is set', () => {
    const cache: Record<string, CachedEccentric> = {
      '2026-05-13|Trail Run': ecc({ ascentM: 100, descentM: 100 }),
    }
    render(<DescentCapacitySection eccentricByActivity={cache} race={brokenArrow18k()} />)
    expect(screen.getByText(/race descends/i)).toBeInTheDocument()
    expect(screen.getByText(/race climbs/i)).toBeInTheDocument()
    // Subtitles report the race-ready band in ft, not m.
    expect(screen.getAllByText(/ft\/wk/i).length).toBeGreaterThan(0)
  })

  it('still renders without a curated race (subtitles say no target)', () => {
    const cache: Record<string, CachedEccentric> = {
      '2026-05-13|Trail Run': ecc({ ascentM: 400, descentM: 400 }),
    }
    render(<DescentCapacitySection eccentricByActivity={cache} />)
    expect(screen.getByText(/hard descent/i)).toBeInTheDocument()
    expect(screen.getAllByText(/no race target/i).length).toBeGreaterThan(0)
  })
})
