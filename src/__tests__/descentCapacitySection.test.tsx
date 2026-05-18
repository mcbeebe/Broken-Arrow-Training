import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import DescentCapacitySection from '../components/DescentCapacitySection'
import type { CachedEccentric } from '../utils/runEccentric'
import type { RaceInfo } from '../types'

function ecc(severe: number, moderate: number, mild = 0, totalKmScore = 1): CachedEccentric {
  return {
    averageScore: 2.5,
    totalKmScore,
    buckets: { mild, moderate, severe },
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
  it('hides itself when the eccentric cache has no descent data', () => {
    const { container } = render(
      <DescentCapacitySection eccentricByActivity={{}} race={brokenArrow18k()} />
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('renders the headline, race-demand card, and chart when cache has data', () => {
    const cache: Record<string, CachedEccentric> = {
      '2026-05-13|Trail Run': ecc(800, 1200),
    }
    render(<DescentCapacitySection eccentricByActivity={cache} race={brokenArrow18k()} />)
    expect(screen.getByText(/hard descent/i)).toBeInTheDocument()
    expect(screen.getByText(/race demand/i)).toBeInTheDocument()
    expect(screen.getByText(/weekly hard-descent volume/i)).toBeInTheDocument()
  })

  it('shows the race-ready band subtitle when a curated race is set', () => {
    const cache: Record<string, CachedEccentric> = {
      '2026-05-13|Trail Run': ecc(100, 100),
    }
    render(<DescentCapacitySection eccentricByActivity={cache} race={brokenArrow18k()} />)
    expect(screen.getByText(/race-ready band/i)).toBeInTheDocument()
  })

  it('still renders without a curated race (no band, no demand card value)', () => {
    const cache: Record<string, CachedEccentric> = {
      '2026-05-13|Trail Run': ecc(400, 400),
    }
    render(<DescentCapacitySection eccentricByActivity={cache} />)
    expect(screen.getByText(/hard descent/i)).toBeInTheDocument()
    expect(screen.getByText(/pick a target race/i)).toBeInTheDocument()
  })
})
