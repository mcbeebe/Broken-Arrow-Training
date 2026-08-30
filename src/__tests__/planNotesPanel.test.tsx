/**
 * P14 — the notes' new home renders, and behaves like a door rather than a wall.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { PlanAdvisory } from '../types'
import PlanNotesPanel from '../components/PlanNotesPanel'

const note = (id: string, severity: PlanAdvisory['severity'], title: string): PlanAdvisory => ({
  id, severity, title, detail: `why: ${title}`,
})

const SEVEN: PlanAdvisory[] = [
  note('experience_vs_mileage', 'caution', 'Experience vs. mileage'),
  note('tight_runway', 'caution', 'Tight runway'),
  note('under_race_ready_volume', 'critical', 'Arrives under race-ready volume'),
  note('workload_fit', 'caution', 'Workload does not fit'),
  note('one_extra_day', 'info', 'One more day than requested'),
  note('three_hard_days', 'caution', 'Three hard days in a row'),
  note('heavy_strength_before_hard', 'caution', 'Heavy strength before a hard run'),
]

beforeEach(() => { vi.restoreAllMocks() })

describe('PlanNotesPanel', () => {
  it('opens closed, so the plan itself opens the tab', () => {
    render(<PlanNotesPanel notes={SEVEN} />)
    expect(screen.queryByTestId('plan-notes-list')).toBeNull()
    expect(screen.getByTestId('plan-notes-toggle').textContent).toContain('7 notes')
  })

  it('names how many are serious, without shouting the detail', () => {
    expect(screen.queryByText(/why: Tight runway/)).toBeNull()
    render(<PlanNotesPanel notes={SEVEN} />)
    expect(screen.getByTestId('plan-notes-toggle').textContent).toContain('1 serious')
  })

  it('shows every note when opened — nothing was dropped in the move', () => {
    render(<PlanNotesPanel notes={SEVEN} />)
    fireEvent.click(screen.getByTestId('plan-notes-toggle'))
    for (const n of SEVEN) expect(screen.getByText(n.title), n.id).toBeTruthy()
  })

  it('leads with the serious one', () => {
    render(<PlanNotesPanel notes={SEVEN} />)
    fireEvent.click(screen.getByTestId('plan-notes-toggle'))
    const titles = [...screen.getByTestId('plan-notes-list').querySelectorAll('*')]
      .map(el => el.textContent ?? '')
    expect(titles[0]).toContain('Arrives under race-ready volume')
  })

  it('arrives open when Today sent you here to read them', () => {
    render(<PlanNotesPanel notes={SEVEN} openRequest={1} />)
    expect(screen.getByTestId('plan-notes-list')).toBeTruthy()
  })

  it('re-opens on a second visit, after you collapsed it', () => {
    const { rerender } = render(<PlanNotesPanel notes={SEVEN} openRequest={1} />)
    fireEvent.click(screen.getByTestId('plan-notes-toggle'))
    expect(screen.queryByTestId('plan-notes-list')).toBeNull()
    rerender(<PlanNotesPanel notes={SEVEN} openRequest={2} />)
    expect(screen.getByTestId('plan-notes-list')).toBeTruthy()
  })

  it('renders nothing at all when the plan has no notes', () => {
    const { container } = render(<PlanNotesPanel notes={[]} openRequest={3} />)
    expect(container.textContent).toBe('')
  })

  it('says whether it is open, for anyone not using their eyes', () => {
    render(<PlanNotesPanel notes={SEVEN} />)
    const toggle = screen.getByTestId('plan-notes-toggle')
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
  })
})
