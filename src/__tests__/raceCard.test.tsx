import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import RaceCard from '../components/RaceCard'
import type { RaceInfo } from '../types'
import type { RaceReadinessSummary } from '../utils/raceReadiness'

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

function readiness(overrides: Partial<RaceReadinessSummary> = {}): RaceReadinessSummary {
  return {
    pct: 80,
    headline: '5 weeks out — fitness on track, vert is the gap.',
    gap: 'vert',
    nextAction: 'Fri hill day → ~633 ft total climb.',
    weeksLeft: 5,
    daysLeft: 35,
    ...overrides,
  }
}

describe('<RaceCard>', () => {
  it('is collapsed by default — header only, no distance/vertical/peak grid', () => {
    render(<RaceCard race={brokenArrow()} readiness={readiness()} />)
    expect(screen.getByText('Broken Arrow 18K')).toBeInTheDocument()
    expect(screen.getByText(/80%/)).toBeInTheDocument()
    expect(screen.getByText(/vert gap/i)).toBeInTheDocument()
    expect(screen.queryByText(/3,850 ft/)).not.toBeInTheDocument()
    expect(screen.queryByText(/9,000 ft/)).not.toBeInTheDocument()
  })

  it('shows the readiness headline in the collapsed header', () => {
    render(<RaceCard race={brokenArrow()} readiness={readiness()} />)
    expect(screen.getByText(/fitness on track, vert is the gap/i)).toBeInTheDocument()
  })

  it('expands to reveal date, location and distance/vertical/peak stats', () => {
    render(<RaceCard race={brokenArrow()} readiness={readiness()} />)
    fireEvent.click(screen.getByRole('button', { expanded: false }))
    expect(screen.getByText(/palisades tahoe/i)).toBeInTheDocument()
    expect(screen.getByText('3,850 ft')).toBeInTheDocument()
    expect(screen.getByText('9,000 ft')).toBeInTheDocument()
  })

  it('fires onOpenReadiness when the "tap for breakdown" CTA is pressed', () => {
    const onOpen = vi.fn()
    render(
      <RaceCard
        race={brokenArrow()}
        readiness={readiness()}
        onOpenReadiness={onOpen}
      />,
    )
    fireEvent.click(screen.getAllByRole('button', { expanded: false })[0])
    fireEvent.click(screen.getByRole('button', { name: /open race readiness details/i }))
    expect(onOpen).toHaveBeenCalledTimes(1)
  })

  it('renders an estimated card for races outside the curated catalog', () => {
    // Generic synthesis (P2 completion): every named race with a distance
    // gets a card now — estimated stub until the athlete uploads a GPX.
    render(
      <RaceCard race={brokenArrow({ name: 'Boston Marathon', distanceMiles: 26.2 })} readiness={null} />,
    )
    expect(screen.getByText('Boston Marathon')).toBeInTheDocument()
  })

  it('renders nothing for Hyrox races', () => {
    const { container } = render(
      <RaceCard race={brokenArrow({ name: 'Hyrox Anaheim', format: 'hyrox', distanceMiles: 5 })} readiness={null} />,
    )
    expect(container).toBeEmptyDOMElement()
  })
})
