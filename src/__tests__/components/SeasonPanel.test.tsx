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

  it('role is letter-encoded and editable per race (K key race / T tune-up)', () => {
    render(<Harness />)
    fireEvent.click(screen.getByText('+ Add another race'))
    fireEvent.change(screen.getByPlaceholderText(/Race name/), { target: { value: 'Tune-up 10K' } })
    fireEvent.change(document.querySelector('input[type="date"]')!, { target: { value: '2026-09-12' } })
    fireEvent.click(screen.getByText('Add race'))

    const group = screen.getByRole('radiogroup', { name: /Tune-up 10K role/ })
    const tButton = Array.from(group.querySelectorAll('button')).find(b => b.textContent === 'T')!
    fireEvent.click(tButton)
    expect(tButton.getAttribute('aria-checked')).toBe('true')
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

describe('layered-integration controls', () => {
  it('a Hyrox-named race in the add form shows the integration ask and stores the choice', () => {
    render(<Harness />)
    fireEvent.click(screen.getByText('+ Add another race'))
    fireEvent.change(screen.getByPlaceholderText(/Race name/), { target: { value: 'Hyrox Anaheim' } })
    fireEvent.change(document.querySelector('input[type="date"]')!, { target: { value: '2026-12-12' } })
    // The ask appears once the name reads as Hyrox.
    expect(screen.getByText(/layer into my build now/i)).toBeInTheDocument()
    fireEvent.click(screen.getByText('Add race'))
    // Confirmed at add time → no pending confirm chip.
    expect(screen.queryByTestId('integration-confirm')).toBeNull()
  })

  it('a pre-existing Hyrox race with no integration gets the one-time confirm — never a silent change', () => {
    function SeededHarness() {
      const seasonState = useSeason(planRace, 'testathlete', [
        { name: 'Hyrox LA', date: '2026-11-07', priority: 'A', distanceMiles: 8 }, // no integration (pre-feature)
      ])
      return <SeasonPanel seasonState={seasonState} />
    }
    render(<SeededHarness />)
    const confirm = screen.getByTestId('integration-confirm')
    expect(confirm.textContent).toContain('Layer Hyrox LA prep into your current build?')
    fireEvent.click(screen.getByText('Layer it in'))
    // Answered → the chip is gone for good (stored on the race).
    expect(screen.queryByTestId('integration-confirm')).toBeNull()
  })

  it('GUARD: non-Hyrox races see no integration ask and no confirm chip', () => {
    render(<Harness />)
    fireEvent.click(screen.getByText('+ Add another race'))
    fireEvent.change(screen.getByPlaceholderText(/Race name/), { target: { value: 'CIM Marathon' } })
    fireEvent.change(document.querySelector('input[type="date"]')!, { target: { value: '2026-12-06' } })
    expect(screen.queryByText(/layer into my build now/i)).toBeNull()
    fireEvent.click(screen.getByText('Add race'))
    expect(screen.queryByTestId('integration-confirm')).toBeNull()
  })
})

describe('main-goal star control', () => {
  function addRace(name: string, date: string) {
    fireEvent.click(screen.getByText('+ Add another race'))
    fireEvent.change(screen.getByPlaceholderText(/Race name/), { target: { value: name } })
    const dateInput = document.querySelector('input[type="date"]')!
    fireEvent.change(dateInput, { target: { value: date } })
    fireEvent.click(screen.getByText('Add race'))
  }

  it('the anchor starts as the main goal; starring another race moves it and demotes the anchor', () => {
    render(<Harness />)
    addRace('Hyrox LA', '2026-10-03')
    // Anchor holds the star.
    expect(screen.getByLabelText('Broken Arrow 18K is your main goal')).toBeInTheDocument()
    // Star the added race.
    fireEvent.click(screen.getByLabelText('Make Hyrox LA your main goal'))
    expect(screen.getByLabelText('Hyrox LA is your main goal')).toBeInTheDocument()
    // The anchor is a key race now — its role radios render (K selected).
    expect(screen.getByLabelText('Make Broken Arrow 18K your main goal')).toBeInTheDocument()
    const anchorRole = screen.getByRole('radiogroup', { name: 'Broken Arrow 18K role' })
    expect(anchorRole).toBeInTheDocument()
  })

  it('the main goal row hides the role radios (it is always the full build)', () => {
    render(<Harness />)
    addRace('Hyrox LA', '2026-10-03')
    expect(screen.queryByRole('radiogroup', { name: 'Broken Arrow 18K role' })).toBeNull()
    expect(screen.getByRole('radiogroup', { name: 'Hyrox LA role' })).toBeInTheDocument()
  })
})
