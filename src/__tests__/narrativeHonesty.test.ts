/**
 * T3 — the weekly review stops calling unlogged sessions "rest".
 *
 * The count was `7 - daysWithLoad`, so three planned sessions nobody
 * logged produced "3 rest days this week — recovery is pulling fatigue
 * down." The athlete was told their skipped week was doing them good.
 *
 * These rules moved from the old week narrative to the last-7-days
 * review (weekReview.ts) and still hold there.
 */
import { describe, it, expect } from 'vitest'
import { buildWeekReview } from '../utils/weekReview'
import { buildTrainingSignals } from '../utils/trainingSignals'
import type { PerformanceMetrics, DailyTRIMP, TrainingWeek, PlannedDay, WorkoutType } from '../types'

const TODAY = '2026-09-25'
const iso = (offsetDays: number) => {
  const d = new Date(`${TODAY}T12:00:00`)
  d.setDate(d.getDate() + offsetDays)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** A falling-fitness week: CTL down 4 points over the seven days. */
const perf = (): PerformanceMetrics[] =>
  Array.from({ length: 9 }, (_, i) => ({
    date: iso(i - 8),
    ctl: 50 - i * 0.5,
    atl: 30,
    tsb: 12,
    acwr: 0.6,
  }))

const trimpOn = (offsets: number[]): DailyTRIMP[] =>
  offsets.map(o => ({ date: iso(o), total: 80, records: [] }))

const day = (type: WorkoutType): PlannedDay => ({
  day: 'D', type, workout: type === 'rest' ? 'Rest' : 'Session',
  detail: '', zone: 'Z2', route: '', time: '40 min',
})

/** One week whose seven days carry the given types, ending today. */
const weekOf = (types: WorkoutType[]): TrainingWeek[] => ([{
  num: 1, dates: '', miles: 20, focus: 'Build',
  startIso: iso(-6),
  days: types.map(day),
}])

const signals = () => buildTrainingSignals({
  performance: { date: iso(0), ctl: 46, atl: 30, tsb: 12, acwr: 0.6 },
  readiness: null,
  sorenessLoadByDate: new Map(),
})

const run = (weeks?: TrainingWeek[], trained: number[] = []) => {
  const review = buildWeekReview(perf(), trimpOn(trained), signals(), weeks, TODAY)!
  return [...review.wins, ...review.fixes].join(' | ')
}

describe('rest versus not logged', () => {
  it('credits rest days only when every planned session was done', () => {
    const out = run(weekOf(['run', 'run', 'rest', 'rest', 'rest', 'rest', 'run']), [-6, -5, 0])
    expect(out).toContain('Rest days taken as planned')
    expect(out).not.toContain('logged')
  })

  it('never credits rest when planned sessions went unlogged', () => {
    const out = run(weekOf(['run', 'run', 'rest', 'rest', 'rest', 'rest', 'run']), [])
    expect(out).not.toContain('Rest days taken')
    expect(out).not.toContain('Fresher')
    // Today's run is not due yet, so two are open, not three.
    expect(out).toContain('2 planned sessions aren’t logged')
  })

  it('uses the singular when exactly one session is not logged', () => {
    const out = run(weekOf(['run', 'rest', 'rest', 'rest', 'rest', 'rest', 'rest']), [])
    expect(out).toContain('1 planned session isn’t logged — if you did it, log it')
  })

  it('does not count today’s session as open before it is done', () => {
    const out = run(weekOf(['rest', 'rest', 'rest', 'rest', 'rest', 'rest', 'run']), [])
    expect(out).not.toContain('logged')
  })

  it('makes no rest claim when there is no dated plan to compare against', () => {
    // Legacy plans have no startIso — we cannot tell rest from skipped.
    const review = buildWeekReview(perf(), trimpOn([]), signals(), undefined, TODAY)!
    const out = [...review.wins, ...review.fixes].join(' | ')
    expect(out).not.toMatch(/rest day|Rest days/)
    expect(review.stats.planned).toBeNull()
  })

  it('never calls an unlogged day "missed"', () => {
    const out = run(weekOf(['run', 'run', 'run', 'rest', 'rest', 'rest', 'run']), [])
    expect(out.toLowerCase()).not.toContain('missed')
  })
})
