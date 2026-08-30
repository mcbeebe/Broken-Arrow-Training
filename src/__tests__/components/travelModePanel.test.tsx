/**
 * Travel mode panel — the onboarding note becomes a prompt, the prompt
 * becomes a declaration, and an active trip offers a one-tap Undo.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import TravelModePanel from '../../components/TravelModePanel'
import type { PlannedDay, TrainingWeek } from '../../types'
import type { TravelWindow } from '../../engines/planGenerator/travelMode'

const TODAY = '2026-05-01'

function day(label: string, type: PlannedDay['type'], zone = '—'): PlannedDay {
  return { day: label, type, workout: type, detail: 'd', zone, route: 'Home', time: '45 min' }
}
// Two weeks spanning the "May 15–22" trip so a declaration has days to adapt.
const WEEKS: TrainingWeek[] = [
  {
    num: 1, dates: 'May 11–17', miles: 10, focus: 'Build', startIso: '2026-05-11',
    days: [day('Mon', 'rest'), day('Tue', 'run', '5 mi'), day('Wed', 'run', '5 mi'), day('Thu', 'rest'),
      day('Fri', 'run', '5 mi'), day('Sat', 'long', '10 mi'), day('Sun', 'rest')],
  },
  {
    num: 2, dates: 'May 18–24', miles: 10, focus: 'Build', startIso: '2026-05-18',
    days: [day('Mon', 'run', '5 mi'), day('Tue', 'run', '5 mi'), day('Wed', 'rest'), day('Thu', 'run', '5 mi'),
      day('Fri', 'strength'), day('Sat', 'long', '10 mi'), day('Sun', 'rest')],
  },
]

describe('TravelModePanel', () => {
  it('surfaces the onboarding-note prompt and prefills the form from it', () => {
    const onActivate = vi.fn()
    render(
      <TravelModePanel
        weeks={WEEKS} note="Travel May 15–22, no equipment" windows={[]} todayIso={TODAY}
        onActivate={onActivate} onDeactivate={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByTestId('travel-note-hint'))
    expect((screen.getByTestId('travel-start') as HTMLInputElement).value).toBe('2026-05-15')
    expect((screen.getByTestId('travel-end') as HTMLInputElement).value).toBe('2026-05-22')
    // "no equipment" preselected the bodyweight kit.
    expect(screen.getByTestId('travel-kit-bodyweight').getAttribute('aria-pressed')).toBe('true')

    fireEvent.click(screen.getByTestId('travel-activate'))
    expect(onActivate).toHaveBeenCalledWith({ startIso: '2026-05-15', endIso: '2026-05-22', kit: 'bodyweight' })
  })

  it('renders an active trip with an Undo that calls back', () => {
    const onDeactivate = vi.fn()
    const win: TravelWindow = {
      id: 'w1', batchId: 'b1', appliedAt: 1, summary: '4 days adapted — bodyweight swaps',
      affectedDays: 4, startIso: '2026-05-15', endIso: '2026-05-22', kit: 'bodyweight',
    }
    render(
      <TravelModePanel
        weeks={WEEKS} note={undefined} windows={[win]} todayIso={TODAY}
        onActivate={vi.fn()} onDeactivate={onDeactivate}
      />,
    )
    expect(screen.getByTestId('travel-active')).toBeTruthy()
    fireEvent.click(screen.getByTestId('travel-undo'))
    expect(onDeactivate).toHaveBeenCalledWith(win)
  })

  it('shows the subtle entry point when there is no travel note', () => {
    render(
      <TravelModePanel
        weeks={WEEKS} note="work crunch in June" windows={[]} todayIso={TODAY}
        onActivate={vi.fn()} onDeactivate={vi.fn()}
      />,
    )
    expect(screen.queryByTestId('travel-note-hint')).toBeNull()
    expect(screen.getByTestId('travel-open')).toBeTruthy()
  })
})
