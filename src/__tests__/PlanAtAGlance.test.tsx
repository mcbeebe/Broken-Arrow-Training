import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import PlanAtAGlance from '../components/PlanAtAGlance'
import { getDarkBg, getWorkoutStyle } from '../utils/styles'

const hexToRgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16)
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`
}
import type { TrainingWeek, PlannedDay, ActualWorkout } from '../types'

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

  it('ticks planned sessions with a logged activity, never a rest day', () => {
    const logged = (name: string): ActualWorkout => ({
      stravaId: 0, garminId: 1, distance: 0, movingTime: 1800, elapsedTime: 1800,
      elevationGain: 0, type: 'Run', name, startDate: '2026-07-14T07:00:00Z', source: 'garmin',
    })
    const done: TrainingWeek[] = [{
      ...weeks[0],
      days: weeks[0].days.map((d, i) =>
        i === 1 ? { ...d, actual: logged('Tempo') }            // Tue session done
        : i === 4 ? { ...d, actual: logged('Oakland eBiking') } // Fri rest, a commute
        : d),
    }, weeks[1]]
    render(<PlanAtAGlance weeks={done} currentWeekNum={5} todayPlannedWorkout={done[0].days[3]} />)
    const ticks = screen.getAllByTestId('day-done')
    expect(ticks).toHaveLength(1)
    expect(within(ticks[0]).getByText('Tue done')).toBeInTheDocument()
    expect(screen.getByTitle('Tue 7/14: Tempo — done')).toBeInTheDocument()
    expect(screen.getByTitle('Fri 7/17: Rest')).toBeInTheDocument()
  })

  it('shows no ticks before anything is logged', () => {
    render(<PlanAtAGlance weeks={weeks} currentWeekNum={5} todayPlannedWorkout={weeks[0].days[3]} />)
    expect(screen.queryByTestId('day-done')).toBeNull()
  })

  it('gives the day chips their dark surface in dark mode', () => {
    // The light pastel chips stayed light on the dark card.
    document.documentElement.classList.add('dark')
    try {
      render(<PlanAtAGlance weeks={weeks} currentWeekNum={5} todayPlannedWorkout={weeks[0].days[3]} />)
      const chip = screen.getByTitle('Tue 7/14: Tempo') as HTMLElement
      expect(chip.style.backgroundColor).toBe(hexToRgb(getDarkBg(getWorkoutStyle('quality', 'Tempo').bg)))
    } finally {
      document.documentElement.classList.remove('dark')
    }
  })

  it('does not repeat a custom focus in the coach note', () => {
    const custom: TrainingWeek[] = [{ ...weeks[0], focus: 'Build aerobic base + station familiarity.' }]
    render(<PlanAtAGlance weeks={custom} currentWeekNum={5} />)
    const note = screen.getByText(/show up for the easy days/i)
    expect(note.textContent).toBe('Show up for the easy days as much as the hard ones — the plan does the rest.')
  })
})

describe('Today mounts the week strip with or without a watch', () => {
  const SUMMARY = Object.values(import.meta.glob('../components/Summary.tsx', {
    query: '?raw', import: 'default', eager: true,
  }))[0] as string

  it('does not gate PlanAtAGlance on Garmin', () => {
    // Field request (2026-10-04): the card vanished the moment Garmin
    // connected. Read the mount's guard expression.
    const mount = SUMMARY.indexOf('<PlanAtAGlance')
    expect(mount).toBeGreaterThan(-1)
    const guard = SUMMARY.slice(SUMMARY.lastIndexOf('{', mount), mount)
    expect(guard).toContain('weeks')
    expect(guard).not.toMatch(/garmin/i)
  })
})
