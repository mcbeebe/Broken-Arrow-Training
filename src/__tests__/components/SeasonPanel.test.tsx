import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import SeasonPanel from '../../components/SeasonPanel'
import { useSeason } from '../../hooks/useSeason'
import type { RaceInfo } from '../../types'

/**
 * G1b acceptance: adding a second race turns the panel into the season
 * calendar with the DERIVED block timeline; a single-race athlete sees only
 * the add-race affordance (the no-phantom-season guard).
 */

const planRace: RaceInfo = {
  name: 'Broken Arrow 18K', date: 'Sunday, June 21, 2026', startTime: '8:00 AM',
  distance: '18K', distanceMiles: 11.2, elevation: '', elevationRange: '',
  course: '', cutoff: '', landmarks: [], gear: [], nutrition: '',
}

function Harness() {
  const seasonState = useSeason(planRace, 'testathlete')
  return <SeasonPanel seasonState={seasonState} />
}

beforeEach(() => {
  localStorage.clear()
})

describe('<SeasonPanel />', () => {
  it('GUARD: single-race athletes see the affordance, not season UI', () => {
    render(<Harness />)
    expect(screen.getByText('+ Add another race')).toBeInTheDocument()
    expect(screen.queryByTestId('season-timeline')).toBeNull()
    expect(screen.queryByText('Your season')).toBeNull()
  })

  it('adding a race derives and renders the block timeline', () => {
    render(<Harness />)
    fireEvent.click(screen.getByText('+ Add another race'))
    fireEvent.change(screen.getByPlaceholderText(/Race name/), { target: { value: 'Hyrox LA' } })
    const dateInput = document.querySelector('input[type="date"]')!
    fireEvent.change(dateInput, { target: { value: '2026-10-03' } })
    fireEvent.click(screen.getByText('Add race'))

    expect(screen.getByText('Your season')).toBeInTheDocument()
    expect(screen.getByText('Hyrox LA')).toBeInTheDocument()
    const timeline = screen.getByTestId('season-timeline')
    // The derived chain renders as labeled block chips (non-color encoding).
    // The anchor race (June 2026) is already past at test time, so the
    // derived machine stamps it and chains BUILD→TAPER→RACE from today —
    // exactly the cannot-wedge behavior (no phantom RECOVER for a race
    // recovered from long ago).
    expect(timeline.textContent).toContain('Build')
    expect(timeline.textContent).toContain('Taper')
    expect(timeline.textContent).toContain('Race')
  })

  it('priority is letter-encoded and editable per race', () => {
    render(<Harness />)
    fireEvent.click(screen.getByText('+ Add another race'))
    fireEvent.change(screen.getByPlaceholderText(/Race name/), { target: { value: 'Tune-up 10K' } })
    fireEvent.change(document.querySelector('input[type="date"]')!, { target: { value: '2026-09-12' } })
    fireEvent.click(screen.getByText('Add race'))

    const group = screen.getByRole('radiogroup', { name: /Tune-up 10K priority/ })
    const cButton = Array.from(group.querySelectorAll('button')).find(b => b.textContent === 'C')!
    fireEvent.click(cButton)
    expect(cButton.getAttribute('aria-checked')).toBe('true')
  })

  it('seeds onboarding-captured races exactly once (removal survives re-mounts)', () => {
    function SeededHarness() {
      const seasonState = useSeason(planRace, 'testathlete', [
        { name: 'Hyrox LA', date: '2026-11-07', priority: 'A', distanceMiles: 8 },
      ])
      return <SeasonPanel seasonState={seasonState} />
    }
    const first = render(<SeededHarness />)
    // Seeded on first mount → the season UI appears with the captured race.
    expect(screen.getByText('Hyrox LA')).toBeInTheDocument()
    // Athlete removes it…
    fireEvent.click(screen.getByLabelText('Remove Hyrox LA'))
    expect(screen.queryByText('Hyrox LA')).toBeNull()
    first.unmount()
    // …and a re-mount with the same config does NOT re-seed (the stamp).
    render(<SeededHarness />)
    expect(screen.queryByText('Hyrox LA')).toBeNull()
  })

  it('the anchor (plan) race cannot be removed; added races can', () => {
    render(<Harness />)
    fireEvent.click(screen.getByText('+ Add another race'))
    fireEvent.change(screen.getByPlaceholderText(/Race name/), { target: { value: 'Extra Race' } })
    fireEvent.change(document.querySelector('input[type="date"]')!, { target: { value: '2026-11-07' } })
    fireEvent.click(screen.getByText('Add race'))

    expect(screen.queryByLabelText('Remove Broken Arrow 18K')).toBeNull()
    fireEvent.click(screen.getByLabelText('Remove Extra Race'))
    // Back to the single-race guard state.
    expect(screen.queryByTestId('season-timeline')).toBeNull()
  })
})
