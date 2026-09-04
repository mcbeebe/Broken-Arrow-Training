/**
 * T3 — the weekly narrative stops calling unlogged sessions "rest".
 *
 * The count was `7 - daysWithLoad`, so three planned sessions nobody
 * logged produced "3 rest days this week — recovery is pulling fatigue
 * down." The athlete was told their skipped week was doing them good.
 */
import { describe, it, expect } from 'vitest'
import { buildWeekNarrative } from '../utils/weekNarrative'
import { buildTrainingSignals } from '../utils/trainingSignals'
import type { PerformanceMetrics, DailyTRIMP, TrainingWeek, PlannedDay, WorkoutType } from '../types'

const iso = (offsetDays: number) => {
  const d = new Date(Date.now() + offsetDays * 86400000)
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

const run = (weeks?: TrainingWeek[], trained: number[] = []) =>
  buildWeekNarrative(perf(), trimpOn(trained), signals(), weeks).join(' | ')

describe('rest versus open', () => {
  it('calls a genuinely rested week rested', () => {
    // Plan said rest on four days; the three training days were all done.
    const out = run(weekOf(['run', 'run', 'rest', 'rest', 'rest', 'rest', 'run']), [-6, -5, 0])
    expect(out).toContain('rest days this week — recovery is pulling fatigue down')
    expect(out).not.toContain('still open')
  })

  it('never claims recovery is helping when planned sessions went unlogged', () => {
    // Four rest days, but three planned sessions were never logged.
    const out = run(weekOf(['run', 'run', 'rest', 'rest', 'rest', 'rest', 'run']), [])
    expect(out).not.toContain('recovery is pulling fatigue down')
    expect(out).toContain('3 planned sessions are still open this week')
  })

  it('uses the singular when exactly one session is open', () => {
    const out = run(weekOf(['run', 'rest', 'rest', 'rest', 'rest', 'rest', 'rest']), [])
    expect(out).toContain('1 planned session is still open this week')
  })

  it('blames a fitness drop on the unlogged sessions, not on rest', () => {
    const out = run(weekOf(['run', 'run', 'rest', 'rest', 'rest', 'rest', 'run']), [])
    expect(out).toContain('went unlogged')
    expect(out).not.toContain('lighter training or rest days pulled it down')
  })

  it('attributes a drop to a lighter week when nothing is open', () => {
    const out = run(weekOf(['run', 'run', 'rest', 'rest', 'rest', 'rest', 'run']), [-6, -5, 0])
    expect(out).toContain('a lighter week pulled it down')
  })

  it('makes no claim about recovery when there is no plan to compare against', () => {
    // Legacy plans have no startIso — we cannot tell rest from skipped, so
    // we report the count and stop, rather than guessing flatteringly.
    const out = run(undefined, [])
    expect(out).not.toContain('recovery is pulling fatigue down')
    expect(out).toContain('days without a recorded session')
  })

  it('never calls an unlogged day "missed"', () => {
    const out = run(weekOf(['run', 'run', 'run', 'rest', 'rest', 'rest', 'run']), [])
    expect(out.toLowerCase()).not.toContain('missed')
  })
})
