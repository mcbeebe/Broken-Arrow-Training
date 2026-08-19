/**
 * Phase 5 surfaces (PRD-110) in the plan view: the missed-workout action,
 * the completed-vs-planned week line, and the two-short-weeks rebuild
 * suggestion. The rules and the log are proven engine-side; this covers
 * the affordances an athlete actually touches.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import type { TrainingWeek, PlannedDay, WorkoutType } from '../../types'
import type { WeekCompliance } from '../../hooks/useCompliance'
import WeeklyPlan from '../../components/WeeklyPlan'

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

function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** A week whose 7 days end yesterday, so every day is in the past. */
function pastWeek(num: number, endedDaysAgo: number, types: WorkoutType[]): TrainingWeek {
  const startIso = isoShift(todayIso(), -(endedDaysAgo + 7))
  const days: PlannedDay[] = types.map((type, i) => ({
    day: labelFor(isoShift(startIso, i)),
    type,
    workout: type === 'quality' ? 'Threshold intervals' : type === 'rest' ? 'Rest' : 'Easy run',
    detail: 'Steady.',
    zone: 'Z2',
    route: 'Any',
    time: '40 min',
  }))
  return { num, dates: '', miles: 20, focus: 'Build', days, startIso }
}

const RUN_WEEK: WorkoutType[] = ['run', 'quality', 'run', 'rest', 'run', 'long', 'rest']

function complianceFor(weekNum: number, planned: number, actual: number): WeekCompliance {
  return {
    weekNum, completed: 0, missed: 0, restDays: 0, totalWorkouts: 5,
    plannedMiles: planned, actualMiles: actual,
    plannedElevation: 0, actualElevation: 0, plannedDuration: 0, actualDuration: 0,
    hrCompliance: 0, hrCheckedWorkouts: 0, hrInZoneTotal: 0, days: [],
    distanceCompliancePct: 0, durationCompliancePct: 0, flaggedCount: 0,
  }
}

function stubReplan(overrides: Partial<{ hasReplan: boolean }> = {}) {
  return {
    apply: vi.fn(),
    undoFor: vi.fn(),
    hasReplan: vi.fn(() => overrides.hasReplan ?? false),
  }
}

beforeEach(() => {
  localStorage.clear()
  Element.prototype.scrollIntoView = () => {}
})

describe('missed-workout action (PRD-110)', () => {
  it('past, un-logged workout days offer "Missed?" — rest days and logged days do not', () => {
    const weeks = [pastWeek(1, 1, RUN_WEEK)]
    weeks[0].days[4].actual = {
      stravaId: 1, distance: 5, movingTime: 2400, elapsedTime: 2400, elevationGain: 100,
      type: 'Run', name: 'Logged run', startDate: `${isoShift(todayIso(), -4)}T13:00:00Z`,
    }
    render(<WeeklyPlan weeks={weeks} replan={stubReplan()} />)
    // Five workout days, one of them logged → four offers. The two rest
    // days and the logged day are excluded.
    expect(screen.getAllByRole('button', { name: 'Missed?' })).toHaveLength(4)
  })

  it('future days never offer it — a replan on a day that has not happened is guessing', () => {
    const start = isoShift(todayIso(), 1)
    const week: TrainingWeek = {
      num: 1, dates: '', miles: 20, focus: 'Build', startIso: start,
      days: RUN_WEEK.map((type, i) => ({
        day: labelFor(isoShift(start, i)), type, workout: 'Easy run', detail: '', zone: 'Z2', route: '', time: '40 min',
      })),
    }
    render(<WeeklyPlan weeks={[week]} replan={stubReplan()} />)
    expect(screen.queryByRole('button', { name: 'Missed?' })).not.toBeInTheDocument()
  })

  it('without the replan prop the affordance is absent entirely', () => {
    render(<WeeklyPlan weeks={[pastWeek(1, 1, RUN_WEEK)]} />)
    expect(screen.queryByRole('button', { name: 'Missed?' })).not.toBeInTheDocument()
  })

  it('a key session offers skip, move, and illness; an easy run offers skip and illness only', () => {
    const replan = stubReplan()
    render(<WeeklyPlan weeks={[pastWeek(1, 1, RUN_WEEK)]} replan={replan} />)
    const buttons = screen.getAllByRole('button', { name: 'Missed?' })

    fireEvent.click(buttons[1]) // the quality day
    const keySheet = screen.getByRole('dialog', { name: /missed workout options/i })
    expect(within(keySheet).getByText('Skip it')).toBeInTheDocument()
    expect(within(keySheet).getByText('Move it later this week')).toBeInTheDocument()
    expect(within(keySheet).getByText(/I was sick/)).toBeInTheDocument()
    fireEvent.click(within(keySheet).getByText('Cancel'))

    fireEvent.click(screen.getAllByRole('button', { name: 'Missed?' })[0]) // easy run
    const easySheet = screen.getByRole('dialog', { name: /missed workout options/i })
    expect(within(easySheet).getByText('Skip it')).toBeInTheDocument()
    expect(within(easySheet).queryByText('Move it later this week')).not.toBeInTheDocument()
  })

  it('choosing an option applies that rule to that day and closes the sheet', () => {
    const replan = stubReplan()
    const weeks = [pastWeek(1, 1, RUN_WEEK)]
    render(<WeeklyPlan weeks={weeks} replan={replan} />)
    fireEvent.click(screen.getAllByRole('button', { name: 'Missed?' })[1])
    fireEvent.click(screen.getByText('Skip it'))
    expect(replan.apply).toHaveBeenCalledWith('skip', isoShift(weeks[0].startIso!, 1))
    expect(screen.queryByRole('dialog', { name: /missed workout options/i })).not.toBeInTheDocument()
  })

  it('an already-replanned day shows the undo instead of the rules', () => {
    const replan = stubReplan({ hasReplan: true })
    render(<WeeklyPlan weeks={[pastWeek(1, 1, RUN_WEEK)]} replan={replan} />)
    fireEvent.click(screen.getAllByRole('button', { name: '↩ Replanned' })[0])
    const sheet = screen.getByRole('dialog', { name: /missed workout options/i })
    expect(within(sheet).queryByText('Skip it')).not.toBeInTheDocument()
    fireEvent.click(within(sheet).getByText(/Undo/))
    expect(replan.undoFor).toHaveBeenCalled()
  })
})

describe('completed vs planned (110-F5)', () => {
  it('a started week reports what actually got done', () => {
    render(<WeeklyPlan weeks={[pastWeek(1, 1, RUN_WEEK)]} compliance={[complianceFor(1, 20, 14)]} />)
    expect(screen.getByText(/14\.0 of 20\.0 mi done/)).toBeInTheDocument()
    expect(screen.getByText(/70%/)).toBeInTheDocument()
  })

  it('a week that has not started yet says nothing — never "0 mi done"', () => {
    const start = isoShift(todayIso(), 7)
    const week: TrainingWeek = {
      num: 1, dates: '', miles: 20, focus: 'Build', startIso: start,
      days: RUN_WEEK.map((type, i) => ({
        day: labelFor(isoShift(start, i)), type, workout: 'Easy run', detail: '', zone: 'Z2', route: '', time: '40 min',
      })),
    }
    render(<WeeklyPlan weeks={[week]} compliance={[complianceFor(1, 20, 0)]} />)
    expect(screen.queryByText(/mi done/)).not.toBeInTheDocument()
  })
})

describe('rebuild suggestion (110-F5)', () => {
  const twoShortWeeks = () => [pastWeek(1, 8, RUN_WEEK), pastWeek(2, 1, RUN_WEEK)]

  it('two consecutive finished weeks under 70% suggest rebuilding from where the athlete is', () => {
    const onRebuildPlan = vi.fn()
    render(
      <WeeklyPlan
        weeks={twoShortWeeks()}
        compliance={[complianceFor(1, 20, 10), complianceFor(2, 20, 11)]}
        onRebuildPlan={onRebuildPlan}
      />,
    )
    expect(screen.getByText(/last two weeks came in well under plan/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /rebuild the rest of my plan/i }))
    expect(onRebuildPlan).toHaveBeenCalled()
  })

  it('one short week does not — a bad week is not a broken plan', () => {
    render(
      <WeeklyPlan
        weeks={twoShortWeeks()}
        compliance={[complianceFor(1, 20, 19), complianceFor(2, 20, 11)]}
        onRebuildPlan={vi.fn()}
      />,
    )
    expect(screen.queryByText(/last two weeks came in well under plan/i)).not.toBeInTheDocument()
  })

  it('the week in progress is never counted — it is short by definition', () => {
    // Week 2 is the CURRENT week (still running), so only one finished
    // week exists and the signal must stay quiet.
    const current: TrainingWeek = { ...pastWeek(2, 1, RUN_WEEK), startIso: isoShift(todayIso(), -2) }
    render(
      <WeeklyPlan
        weeks={[pastWeek(1, 8, RUN_WEEK), current]}
        compliance={[complianceFor(1, 20, 10), complianceFor(2, 20, 2)]}
        onRebuildPlan={vi.fn()}
      />,
    )
    expect(screen.queryByText(/last two weeks came in well under plan/i)).not.toBeInTheDocument()
  })

  it('no rebuild handler, no banner (read-only surfaces stay read-only)', () => {
    render(<WeeklyPlan weeks={twoShortWeeks()} compliance={[complianceFor(1, 20, 10), complianceFor(2, 20, 11)]} />)
    expect(screen.queryByText(/last two weeks came in well under plan/i)).not.toBeInTheDocument()
  })
})
