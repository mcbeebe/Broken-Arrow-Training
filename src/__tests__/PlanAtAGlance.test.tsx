import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import PlanAtAGlance from '../components/PlanAtAGlance'
import type { TrainingWeek, PlannedDay } from '../types'

afterEach(cleanup)

const day = (label: string, type: PlannedDay['type'], workout: string, time = ''): PlannedDay => ({
  day: label, type, workout, detail: '', zone: '—', route: '', time,
})

const weeks: TrainingWeek[] = [
  {
    num: 5, dates: 'Mon 7/13 – Sun 7/19', miles: 14, focus: 'Build',
    days: [
      day('Mon 7/13', 'cross', 'Cross-train · Cycling'),
      day('Tue 7/14', 'quality', 'Tempo', '40 min'),
      day('Wed 7/15', 'strength', 'Strength'),
      day('Thu 7/16', 'run', 'Easy (RWR)', '30 min'),
      day('Fri 7/17', 'rest', 'Rest'),
      day('Sat 7/18', 'rest', 'Rest'),
      day('Sun 7/19', 'long', 'Long (RWR)', '110-130 min'),
    ],
  },
  {
    num: 6, dates: 'Mon 7/20 – Sun 7/26', miles: 9, focus: 'Cutback',
    days: [day('Sun 7/26', 'long', 'Long (RWR)', '70-85 min')],
  },
]

describe('PlanAtAGlance', () => {
  it('renders the week position, focus, mileage and a phase coach note', () => {
    const { container } = render(<PlanAtAGlance weeks={weeks} currentWeekNum={5} todayPlannedWorkout={weeks[0].days[3]} />)
    expect(screen.getByText('This week')).toBeInTheDocument()
    expect(screen.getByText('Week 5 of 2')).toBeInTheDocument() // N of weeks.length
    expect(container.textContent).toContain('Build')
    expect(container.textContent).toContain('14 mi planned')
    // Build-phase coach note
    expect(screen.getByText(/quality sessions sharpen/i)).toBeInTheDocument()
  })

  it('surfaces the next key session (long/quality) after today', () => {
    // Today = Thu (easy); next key session should be Sun's long run.
    render(<PlanAtAGlance weeks={weeks} currentWeekNum={5} todayPlannedWorkout={weeks[0].days[3]} />)
    expect(screen.getByText(/Next key session:/)).toBeInTheDocument()
    expect(screen.getByText(/Long \(RWR\)/)).toBeInTheDocument()
  })

  it('returns null with no plan data', () => {
    const { container } = render(<PlanAtAGlance weeks={[]} currentWeekNum={1} />)
    expect(container.firstChild).toBeNull()
  })
})
