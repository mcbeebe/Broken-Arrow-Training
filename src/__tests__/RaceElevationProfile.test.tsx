import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import RaceElevationProfile from '../components/RaceElevationProfile'
import type { RaceInfo } from '../types'

beforeEach(() => {
  cleanup()
})

function makeRace(overrides: Partial<RaceInfo> = {}): RaceInfo {
  return {
    name: 'Broken Arrow Skyrace 18K',
    date: '2026-06-19',
    startTime: '12PM',
    distance: '18K',
    distanceMiles: 11,
    elevation: '+3,800 ft',
    elevationRange: '6,200–9,000 ft',
    course: 'Palisades Tahoe',
    cutoff: '',
    landmarks: [],
    gear: [],
    nutrition: '',
    ...overrides,
  }
}

describe('RaceElevationProfile — Broken Arrow only', () => {
  it('renders the profile for a Broken Arrow race', () => {
    render(<RaceElevationProfile race={makeRace()} />)
    expect(screen.getByText('Elevation Profile')).toBeInTheDocument()
    expect(screen.getByText(/Segment Grades/i)).toBeInTheDocument()
  })

  it('renders nothing for a generated, non-Broken-Arrow race', () => {
    const { container } = render(
      <RaceElevationProfile race={makeRace({ name: 'Slow half', distance: 'Half Marathon', distanceMiles: 13.1, elevation: '', elevationRange: '' })} />,
    )
    expect(screen.queryByText('Elevation Profile')).not.toBeInTheDocument()
    expect(container).toBeEmptyDOMElement()
  })
})
