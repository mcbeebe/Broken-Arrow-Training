import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { TrainingWeek, PlannedDay } from '../../types'
import WeeklyPlan from '../../components/WeeklyPlan'

/**
 * Field bug: the workout modal derived its week from the week PAGER, not
 * the tapped day — a November day opened from the Calendar rendered as
 * "Wk 3" with an August drills tip and the wrong (non-Hyrox) coaching.
 * The modal must resolve the tapped day's OWNING week.
 */

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function isoShift(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00`)
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function labelFor(iso: string): string {
  const d = new Date(`${iso}T12:00:00`)
  return `${DOW[d.getDay()]} ${d.getMonth() + 1}/${d.getDate()}`
}

function weekAt(num: number, mondayIso: string, tag: string): TrainingWeek {
  const days: PlannedDay[] = Array.from({ length: 7 }, (_, i) => ({
    day: labelFor(isoShift(mondayIso, i)),
    type: 'run' as const,
    workout: `${tag} run ${i + 1}`,
    detail: 'Easy.',
    zone: 'Z2',
    route: 'Any',
    time: '30 min',
  }))
  return { num, dates: '', miles: 15, focus: 'Build', days, startIso: mondayIso }
}

// The first Monday of the CURRENT month — weeks 1 and 2 land fully inside
// the month the calendar opens on, whatever today is.
function firstMondayOfCurrentMonth(): string {
  const now = new Date()
  for (let d = 1; d <= 7; d++) {
    const c = new Date(now.getFullYear(), now.getMonth(), d, 12)
    if (c.getDay() === 1) return `${c.getFullYear()}-${String(c.getMonth() + 1).padStart(2, '0')}-${String(c.getDate()).padStart(2, '0')}`
  }
  throw new Error('unreachable')
}

beforeEach(() => {
  localStorage.clear()
  Element.prototype.scrollIntoView = () => {}
})

describe('calendar tap resolves the owning week', () => {
  it('a day tapped from week 2 opens the modal as Wk 2 (pager still on week 1)', () => {
    const monday1 = firstMondayOfCurrentMonth()
    const weeks = [weekAt(1, monday1, 'Alpha'), weekAt(2, isoShift(monday1, 7), 'Beta')]
    render(<WeeklyPlan weeks={weeks} />)

    fireEvent.click(screen.getByText('Calendar'))
    // Tap a week-2 day straight off the calendar grid.
    fireEvent.click(screen.getByText('Beta run 3'))
    expect(screen.getByText(/Wk 2/)).toBeInTheDocument()
    expect(screen.queryByText(/Wk 1/)).toBeNull()
  })
})
