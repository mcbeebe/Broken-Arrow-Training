import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { Season, SeasonRace, RaceInfo } from '../../types'
import SeasonRacesCard from '../../components/SeasonRacesCard'

function race(name: string, date: string, over: Partial<RaceInfo> = {}): RaceInfo {
  return {
    name, date, startTime: '', distance: '', distanceMiles: 13.1,
    elevation: '', elevationRange: '', course: '', cutoff: '',
    landmarks: [], gear: [], nutrition: '', ...over,
  }
}

function sr(id: string, name: string, date: string, over: Partial<SeasonRace> = {}): SeasonRace {
  return { id, priority: 'B', status: 'upcoming', raceInfo: race(name, date), ...over }
}

const futureIso = (days: number) => {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

describe('<SeasonRacesCard />', () => {
  it('lists every race chronologically with countdowns, the ★ main goal, and roles', () => {
    const season: Season = {
      races: [
        sr('hyrox', 'Hyrox Anaheim', futureIso(140), { isPrimary: true, priority: 'A' }),
        sr('half', 'Oakland Hills Half', futureIso(100)),
        sr('trot', 'Turkey Trot', futureIso(130), { priority: 'C' }),
      ],
      blocks: [],
    }
    render(<SeasonRacesCard season={season} primaryGoalText="sub-90 Hyrox" />)
    expect(screen.getByText('Your races')).toBeInTheDocument()
    // Chronological: the half (soonest) renders before the Hyrox.
    const names = screen.getAllByText(/Oakland Hills Half|Turkey Trot|Hyrox Anaheim/).map(e => e.textContent)
    expect(names[0]).toContain('Oakland Hills Half')
    expect(screen.getByText('★ Main goal')).toBeInTheDocument()
    expect(screen.getByText('Tune-up')).toBeInTheDocument()
    expect(screen.getByText('Key race')).toBeInTheDocument()
    // The athlete's own goal words show on the main goal.
    expect(screen.getByText('sub-90 Hyrox')).toBeInTheDocument()
    // Countdowns render (weeks for far-out races).
    expect(screen.getAllByText(/weeks|days|today!|tomorrow/).length).toBeGreaterThanOrEqual(3)
  })

  it('renders nothing for a single-race season (RaceCard owns that)', () => {
    const season: Season = { races: [sr('solo', 'Only Race', futureIso(60), { isPrimary: true })], blocks: [] }
    const { container } = render(<SeasonRacesCard season={season} />)
    expect(container.firstChild).toBeNull()
  })

  it('a free-text unparseable date renders without a countdown and never crashes', () => {
    const season: Season = {
      races: [
        sr('a', 'Race A', futureIso(30)),
        sr('b', 'Race B', 'sometime next year'),
      ],
      blocks: [],
    }
    render(<SeasonRacesCard season={season} />)
    expect(screen.getByText('Race B')).toBeInTheDocument()
    expect(screen.getByText('sometime next year')).toBeInTheDocument()
  })
})
