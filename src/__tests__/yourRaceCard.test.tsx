import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import YourRaceCard from '../components/YourRaceCard'
import type { RaceInfo } from '../types'

function brokenArrow(overrides: Partial<RaceInfo> = {}): RaceInfo {
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
    ...overrides,
  }
}

describe('<YourRaceCard>', () => {
  it('renders curated course info (Broken Arrow 18K)', () => {
    render(<YourRaceCard race={brokenArrow()} />)
    expect(screen.getByText(/your race/i)).toBeInTheDocument()
    expect(screen.getByText('Broken Arrow 18K')).toBeInTheDocument()
    expect(screen.getByText(/palisades tahoe/i)).toBeInTheDocument()
    expect(screen.getByText(/vertical/i)).toBeInTheDocument()
  })

  it('expands to show named segments when toggled', () => {
    render(<YourRaceCard race={brokenArrow()} />)
    const toggle = screen.getByRole('button', { name: /named segments/i })
    expect(screen.queryByText('Stairway to Heaven')).not.toBeInTheDocument()
    fireEvent.click(toggle)
    expect(screen.getByText('Stairway to Heaven')).toBeInTheDocument()
    expect(screen.getByText('Siberia Descent')).toBeInTheDocument()
  })

  it('shows aid stations when expanded', () => {
    render(<YourRaceCard race={brokenArrow()} />)
    fireEvent.click(screen.getByRole('button', { name: /named segments/i }))
    expect(screen.getByText(/aid stations/i)).toBeInTheDocument()
    expect(screen.getByText(/siberia aid/i)).toBeInTheDocument()
    expect(screen.getByText(/julia's/i)).toBeInTheDocument()
  })

  it('renders an estimated card with a GPX-upload affordance for non-curated races', () => {
    render(<YourRaceCard race={brokenArrow({ name: 'Boston Marathon', distanceMiles: 26.2 })} />)
    expect(screen.getByText('Boston Marathon')).toBeInTheDocument()
    expect(screen.getByText('estimated')).toBeInTheDocument()
    expect(screen.getByText(/26\.2 mi/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /upload gpx/i })).toBeInTheDocument()
  })

  it('renders nothing for Hyrox races (no course to show)', () => {
    const { container } = render(
      <YourRaceCard race={brokenArrow({ name: 'Hyrox Anaheim', format: 'hyrox', distanceMiles: 5 })} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when race is null', () => {
    const { container } = render(<YourRaceCard race={null} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('formats a human-readable race date without producing "Invalid Date"', () => {
    render(<YourRaceCard race={brokenArrow({ date: 'Friday, June 19, 2026' })} />)
    expect(screen.queryByText(/invalid date/i)).not.toBeInTheDocument()
    expect(screen.getByText(/jun 19, 2026/i)).toBeInTheDocument()
  })

  it('falls back gracefully when the date string is unparseable', () => {
    render(<YourRaceCard race={brokenArrow({ date: 'TBD' })} />)
    expect(screen.queryByText(/invalid date/i)).not.toBeInTheDocument()
  })
})
