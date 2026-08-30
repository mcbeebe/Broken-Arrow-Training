/**
 * The honest-metric contract. These pin the rules that keep the Progress tab
 * from calling a plan you're following a failure.
 */
import { describe, it, expect } from 'vitest'
import type { OverallCompliance, WeekCompliance } from '../hooks/useCompliance'
import {
  frameThisWeek, bandForWeek, planGradeable, completeWeeks, isWeekComplete,
  MIN_COMPLETE_WEEKS_TO_GRADE, MIN_HR_RUNS_TO_GRADE,
} from '../utils/progressFraming'

const wk = (over: Partial<WeekCompliance>): WeekCompliance => ({
  weekNum: 1, completed: 0, missed: 0, restDays: 2, totalWorkouts: 5,
  plannedMiles: 10, actualMiles: 0, plannedElevation: 0, actualElevation: 0,
  plannedDuration: 300, actualDuration: 0, hrCompliance: 0, hrCheckedWorkouts: 0,
  hrInZoneTotal: 0, days: [], distanceCompliancePct: 0, durationCompliancePct: 0,
  flaggedCount: 0, ...over,
})

const overall = (weeks: WeekCompliance[], over: Partial<OverallCompliance> = {}): OverallCompliance => ({
  weeks, totalCompleted: 0, totalMissed: 0, totalWorkouts: 0, completionRate: 0,
  totalPlannedMiles: 162, totalActualMiles: 2.7, totalPlannedElevation: 0,
  totalActualElevation: 0, overallHRCompliance: 8, overallDistanceCompliance: 0,
  overallDurationCompliance: 65, totalFlagged: 1, ...over,
})

/** Mike's device state: day 5, week 1 of an 8-week plan, one run in. */
const mikeWeek1 = () => overall([
  wk({ weekNum: 1, completed: 1, actualMiles: 2.7, plannedMiles: 10, actualDuration: 26, plannedDuration: 40, hrCheckedWorkouts: 1 }),
])

describe('isWeekComplete', () => {
  it('is false for the current week — it is still being run', () => {
    expect(isWeekComplete(1, 1)).toBe(false)
  })
  it('is true only for strictly-past weeks', () => {
    expect(isWeekComplete(1, 2)).toBe(true)
    expect(isWeekComplete(2, 2)).toBe(false)
    expect(isWeekComplete(3, 2)).toBe(false)
  })
})

describe('planGradeable', () => {
  it('is false on a young plan — a percentage has not earned a colour yet', () => {
    expect(planGradeable(mikeWeek1(), 1)).toBe(false)
  })
  it('needs the threshold of completed weeks', () => {
    const weeks = [wk({ weekNum: 1, totalWorkouts: 5 }), wk({ weekNum: 2, totalWorkouts: 5 }), wk({ weekNum: 3, totalWorkouts: 5 })]
    // current week 3 → weeks 1 and 2 complete → exactly the minimum
    expect(completeWeeks(overall(weeks), 3)).toHaveLength(MIN_COMPLETE_WEEKS_TO_GRADE)
    expect(planGradeable(overall(weeks), 3)).toBe(true)
    expect(planGradeable(overall(weeks), 2)).toBe(false)
  })
  it('ignores empty weeks with nothing planned', () => {
    const weeks = [wk({ weekNum: 1, totalWorkouts: 0 }), wk({ weekNum: 2, totalWorkouts: 0 }), wk({ weekNum: 3, totalWorkouts: 5 })]
    expect(planGradeable(overall(weeks), 4)).toBe(false)
  })
})

describe('frameThisWeek — Mike’s day-5 state', () => {
  const framed = frameThisWeek(mikeWeek1(), 1)
  const byKey = (k: string) => framed.metrics.find(m => m.key === k)!

  it('shows distance against THIS WEEK, never the whole season', () => {
    const d = byKey('distance')
    expect(d.value).toBe('2.7')
    expect(d.sub).toBe('/ 10 mi this week')
    expect(d.sub).not.toContain('162')
  })

  it('never paints the in-progress week red', () => {
    for (const m of framed.metrics) {
      expect(m.tone, `${m.key} is red on day 5`).not.toBe('bad')
    }
  })

  it('says HR is too soon on one measured run, rather than 8% in red', () => {
    const h = byKey('hr')
    expect(h.value).toBe('too soon')
    expect(h.tone).toBe('tooSoon')
    expect(h.sub).toBe(`1 of ${MIN_HR_RUNS_TO_GRADE} runs measured`)
  })

  it('frames completion as a count, not a grade', () => {
    const c = byKey('completion')
    expect(c.value).toBe('1 done')
    expect(c.sub).toContain('open')
    expect(c.tone).toBe('neutral')
  })
})

describe('frameThisWeek — HR once enough runs exist', () => {
  it('grades HR red only when the plan is gradeable AND the number is low', () => {
    const weeks = [
      wk({ weekNum: 1, hrCheckedWorkouts: 2 }),
      wk({ weekNum: 2, hrCheckedWorkouts: 2 }),
      wk({ weekNum: 3, hrCheckedWorkouts: 1 }),
    ]
    const c = overall(weeks, { overallHRCompliance: 40 })
    const hr = frameThisWeek(c, 3).metrics.find(m => m.key === 'hr')!
    expect(hr.value).toBe('40%')
    expect(hr.tone).toBe('bad') // 5 runs, 2 complete weeks, genuinely low
  })

  it('holds HR neutral while the plan is still too young, even with runs', () => {
    const weeks = [wk({ weekNum: 1, hrCheckedWorkouts: 4 })]
    const c = overall(weeks, { overallHRCompliance: 40 })
    const hr = frameThisWeek(c, 1).metrics.find(m => m.key === 'hr')!
    expect(hr.value).toBe('40%')          // enough runs to show a number
    expect(hr.tone).toBe('neutral')       // but not enough weeks to call it red
  })

  it('calls strong HR good', () => {
    const weeks = [wk({ weekNum: 1, hrCheckedWorkouts: 2 }), wk({ weekNum: 2, hrCheckedWorkouts: 2 }), wk({ weekNum: 3 })]
    const hr = frameThisWeek(overall(weeks, { overallHRCompliance: 90 }), 3).metrics.find(m => m.key === 'hr')!
    expect(hr.tone).toBe('good')
  })
})

describe('completion when the week is fully done', () => {
  it('reads complete and turns good', () => {
    const c = overall([wk({ weekNum: 1, completed: 5, totalWorkouts: 5, restDays: 2 })])
    const comp = frameThisWeek(c, 1).metrics.find(m => m.key === 'completion')!
    expect(comp.value).toBe('5 done')
    expect(comp.sub).toBe('week complete')
    expect(comp.tone).toBe('good')
  })
})

describe('bandForWeek — the −74% banner', () => {
  it('does not flag the current, in-progress week however short it looks', () => {
    // 2.7 of 10 planned mid-week — would be −73% if graded as complete.
    expect(bandForWeek(2.7, 10, { hasStarted: true, isComplete: false })).toBe('inprogress')
  })
  it('flags a genuinely short COMPLETED week', () => {
    expect(bandForWeek(2.7, 10, { hasStarted: true, isComplete: true })).toBe('flag')
  })
  it('keeps future weeks future and on-plan weeks ok', () => {
    expect(bandForWeek(0, 10, { hasStarted: false, isComplete: false })).toBe('future')
    expect(bandForWeek(9.5, 10, { hasStarted: true, isComplete: true })).toBe('ok')
    expect(bandForWeek(8, 10, { hasStarted: true, isComplete: true })).toBe('warn')
  })
})

describe('the wiring stays honest (source guards)', () => {
  const src = (glob: Record<string, unknown>) => Object.values(glob)[0] as string
  const DASH = src(import.meta.glob('../components/Dashboard.tsx', { query: '?raw', import: 'default', eager: true }))
  const VOL = src(import.meta.glob('../components/VolumeChart.tsx', { query: '?raw', import: 'default', eager: true }))
  const ROW = src(import.meta.glob('../components/ComplianceWeekRow.tsx', { query: '?raw', import: 'default', eager: true }))

  it('routes the summary cards through the contract, not hardcoded StatCards', () => {
    expect(DASH).toMatch(/frameThisWeek\(compliance, currentWeekNum\)/)
    expect(DASH).toMatch(/FramedStatCard/)
  })

  it('no longer divides the headline distance card by the season total', () => {
    // The old card: value={overallDistanceCompliance}% sub={totalActualMiles / totalPlannedMiles}.
    // That exact pairing is what produced "0% · 2.7 / 162 mi".
    expect(DASH).not.toMatch(/label="Distance"[\s\S]{0,200}totalPlannedMiles/)
  })

  it('bands the volume chart by completeness, so the current week cannot flag', () => {
    expect(VOL).toMatch(/bandForWeek\(/)
    expect(VOL).toMatch(/isComplete: w\.num < currentWeekNum/)
    expect(VOL).not.toMatch(/function classify\(/)
  })

  it('retired the red "missed ✗" badge for neutral "open"', () => {
    expect(ROW).not.toMatch(/\{week\.missed\} ✗/)
    expect(ROW).toMatch(/\{week\.missed\} open/)
  })
})
