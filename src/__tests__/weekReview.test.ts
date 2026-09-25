/**
 * The last-7-days review: exact window, plain stats, and every line sorted
 * into Going well / To improve with an action on each To-improve line.
 */
import { describe, it, expect } from 'vitest'
import {
  buildWeekReview,
  formatReviewRange,
  formatTrainingTime,
  WEEK_REVIEW_MAX_LINES,
} from '../utils/weekReview'
import { buildTrainingSignals, type TrainingSignals } from '../utils/trainingSignals'
import type {
  ActualWorkout, DailyTRIMP, PerformanceMetrics, PlannedDay, TRIMPRecord, TrainingWeek, WorkoutType,
} from '../types'

const TODAY = '2026-09-25'
const iso = (offset: number) => {
  const d = new Date(`${TODAY}T12:00:00`)
  d.setDate(d.getDate() + offset)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Nine days of history; `ctl`/`tsb` given as [7 days ago, today]. */
const perf = (ctl: [number, number] = [50, 50], tsb: [number, number] = [0, 0]): PerformanceMetrics[] =>
  Array.from({ length: 9 }, (_, i) => {
    const offset = i - 8
    const t = offset <= -7 ? 0 : (offset + 7) / 7
    return {
      date: iso(offset),
      ctl: ctl[0] + (ctl[1] - ctl[0]) * t,
      atl: 50,
      tsb: tsb[0] + (tsb[1] - tsb[0]) * t,
      acwr: 1,
    }
  })

const record = (name: string, trimp: number): TRIMPRecord => ({
  date: '', activityName: name, sportType: 'run' as TRIMPRecord['sportType'],
  baseTRIMP: trimp, sportMultiplier: 1, elevationBonus: 0, adjustedTRIMP: trimp,
})

const trimp = (offsets: number[], total = 80): DailyTRIMP[] =>
  offsets.map(o => ({ date: iso(o), total, records: [record('Morning Run', total)] }))

const actual = (minutes: number, name = 'Run'): ActualWorkout => ({
  stravaId: 1, distance: 5000, movingTime: minutes * 60, elapsedTime: minutes * 60,
  elevationGain: 0, type: 'Run', name, startDate: `${TODAY}T07:00:00Z`,
})

const day = (type: WorkoutType, workout = type === 'rest' ? 'Rest' : 'Easy run', a?: ActualWorkout): PlannedDay => ({
  day: 'D', type, workout, detail: '', zone: 'Z2', route: '', time: '40 min', actual: a,
})

/** A dated plan whose seven days end today. */
const plan = (days: PlannedDay[]): TrainingWeek[] => ([{
  num: 1, dates: '', miles: 20, focus: 'Build', startIso: iso(-6), days,
}])

const baseSignals = () => buildTrainingSignals({
  performance: { date: TODAY, ctl: 50, atl: 50, tsb: 0, acwr: 1 },
  readiness: null,
  sorenessLoadByDate: new Map(),
})

const sig = (over: Partial<TrainingSignals> = {}): TrainingSignals => ({ ...baseSignals(), ...over })

const review = (opts: {
  perf?: PerformanceMetrics[]
  trimp?: DailyTRIMP[]
  signals?: TrainingSignals
  weeks?: TrainingWeek[]
} = {}) => buildWeekReview(opts.perf ?? perf(), opts.trimp ?? [], opts.signals ?? sig(), opts.weeks, TODAY)!

describe('window', () => {
  it('is today and the six days before it — not eight days', () => {
    const r = review({ trimp: trimp([-7, -6, 0]) })
    expect(r.fromIso).toBe(iso(-6))
    expect(r.toIso).toBe(TODAY)
    expect(r.stats.daysTrained).toBe(2)
  })

  it('measures the fitness change from the day before the window', () => {
    expect(review({ perf: perf([40, 44.6]) }).stats.fitnessDelta).toBe(5)
    expect(review({ perf: perf([44, 41]) }).stats.fitnessDelta).toBe(-3)
  })

  it('returns null without enough history to compare', () => {
    expect(buildWeekReview(perf().slice(-1), [], sig(), undefined, TODAY)).toBeNull()
  })
})

describe('stats', () => {
  it('counts planned sessions done of those due, leaving today out until it is done', () => {
    const weeks = plan([
      day('run', 'Easy run', actual(40)), day('rest'), day('quality', 'Tempo 5 mi'),
      day('rest'), day('run', 'Easy run', actual(30)), day('rest'), day('long', 'Long run'),
    ])
    const r = review({ weeks })
    expect(r.stats.planned).toEqual({ done: 2, due: 3 })
    expect(r.stats.trainingMinutes).toBe(70)
  })

  it('adds a second session on the same day to training time', () => {
    const d = day('run', 'Easy run', actual(40))
    d.secondaryActuals = [actual(25, 'Strength')]
    const r = review({ weeks: plan([d, day('rest'), day('rest'), day('rest'), day('rest'), day('rest'), day('rest')]) })
    expect(r.stats.trainingMinutes).toBe(65)
  })

  it('shows no training time when no logged session carries one', () => {
    expect(review({ trimp: trimp([-1]) }).stats.trainingMinutes).toBeNull()
  })

  it('names the hardest session by its biggest activity, in plain words', () => {
    const t: DailyTRIMP[] = [
      { date: iso(-4), total: 60, records: [record('Easy spin', 60)] },
      { date: iso(-2), total: 150, records: [record('Warm-up jog', 20), record('Hill repeats', 130)] },
    ]
    expect(review({ trimp: t }).stats.hardest).toEqual({ iso: iso(-2), name: 'Hill repeats' })
  })
})

describe('going well', () => {
  it('says every planned session is done', () => {
    const weeks = plan([
      day('run', 'Easy run', actual(40)), day('rest'), day('run', 'Easy run', actual(40)),
      day('rest'), day('run', 'Easy run', actual(40)), day('rest'), day('rest'),
    ])
    const r = review({ weeks, trimp: trimp([-6, -4, -2]) })
    expect(r.wins[0]).toBe('✅ All 3 planned sessions done.')
    expect(r.wins).toContain('😴 Rest days taken as planned.')
  })

  it('calls 4 of 5 solid consistency, and says the fifth is not logged', () => {
    const done = (w = 'Easy run') => day('run', w, actual(40))
    const weeks = plan([done(), done(), day('run'), done(), done(), day('rest'), day('rest')])
    const r = review({ weeks })
    expect(r.wins[0]).toBe('✅ 4 of 5 planned sessions done — solid consistency.')
    expect(r.fixes.some(f => f.startsWith('⭕ 1 planned session isn’t logged'))).toBe(true)
  })

  it('names the key sessions that landed', () => {
    const weeks = plan([
      day('quality', 'Tempo 5 mi', actual(45)), day('rest'), day('run', 'Easy run', actual(30)),
      day('rest'), day('rest'), day('long', 'Long run 14 mi', actual(130)), day('rest'),
    ])
    const r = review({ weeks })
    // 2026-09-19 is a Saturday; 2026-09-24 a Thursday.
    expect(r.wins).toContain('🎯 Key sessions landed: Sat Tempo 5 mi, Thu Long run 14 mi.')
  })

  it('credits a fitness gain with the number of points', () => {
    expect(review({ perf: perf([40, 43]) }).wins).toContain('📈 Fitness up 3 points — the work is adding up.')
    expect(review({ perf: perf([40, 41]) }).wins).toContain('📈 Fitness up 1 point — the work is adding up.')
  })

  it('credits a safe load only when there was load to judge', () => {
    expect(review({ trimp: trimp([-1]) }).wins).toContain('⚖️ Your load is building at a safe rate for your base.')
    expect(review({ trimp: [] }).wins.join()).not.toContain('safe rate')
    expect(review({ trimp: trimp([-1]), signals: sig({ rampAlert: true }) }).wins.join()).not.toContain('safe rate')
  })

  it('does not call fresher a win while the body or soreness disagrees', () => {
    const fresher = perf([50, 50], [-5, 5])
    expect(review({ perf: fresher }).wins.join()).toContain('Fresher than a week ago (Recovery Balance +10)')
    const bodyLow = sig({ body: { state: 'yellow', label: 'Sub-baseline', severity: 2 } })
    expect(review({ perf: fresher, signals: bodyLow }).wins.join()).not.toContain('Fresher')
    const sore = sig({ damage: { state: 'elevated', label: 'Elevated', severity: 2 } })
    expect(review({ perf: fresher, signals: sore }).wins.join()).not.toContain('Fresher')
  })

  it('does not call fresher a win when planned sessions went unlogged', () => {
    const weeks = plan([day('run'), day('run'), day('rest'), day('rest'), day('rest'), day('rest'), day('rest')])
    expect(review({ perf: perf([50, 50], [-5, 5]), weeks }).wins.join()).not.toContain('Fresher')
  })
})

describe('to improve', () => {
  it('tells an overreached athlete to back off for days, not just today', () => {
    const r = review({
      perf: perf([50, 50], [-20, -35]),
      signals: sig({ load: { state: 'danger', label: 'Danger', severity: 3 } }),
    })
    expect(r.fixes[0]).toBe('🛑 Fatigue has outrun your fitness — make the next 2–3 days easy or off.')
  })

  it('reads a spike (not overreaching) as ramping too fast', () => {
    const r = review({ signals: sig({ load: { state: 'danger', label: 'Danger', severity: 3 } }) })
    expect(r.fixes[0]).toBe('🛑 Load jumped too fast this week — cut the next few days back to easy.')
  })

  it('asks a ramping athlete to hold volume flat', () => {
    const line = '⚠️ Load is climbing fast — hold next week’s volume flat rather than adding more.'
    expect(review({ signals: sig({ load: { state: 'ramping', label: 'Ramping fast', severity: 2 } }) }).fixes).toContain(line)
    expect(review({ signals: sig({ rampAlert: true }) }).fixes).toContain(line)
  })

  it('flags low recovery signals and building soreness with an action', () => {
    const r = review({
      signals: sig({
        body: { state: 'yellow', label: 'Sub-baseline', severity: 2 },
        damage: { state: 'escalating', label: 'Escalating', severity: 3 },
      }),
    })
    expect(r.fixes).toContain('💤 Recovery signals (HRV, sleep, resting HR) are below your baseline — keep today easy.')
    expect(r.fixes).toContain('🦵 Soreness is building — skip heavy leg work until it settles.')
  })

  it('asks for a rest day after seven straight training days', () => {
    const r = review({ trimp: trimp([-6, -5, -4, -3, -2, -1, 0]) })
    expect(r.fixes).toContain('🔥 No rest day in 7 days — take one in the next 48 hours.')
  })

  it('notices training through a planned rest day', () => {
    const weeks = plan([
      day('run', 'Easy run', actual(40)), day('rest', 'Rest', actual(50)), day('run', 'Easy run', actual(40)),
      day('rest'), day('rest'), day('rest'), day('rest'),
    ])
    const r = review({ weeks })
    expect(r.fixes).toContain('😴 Trained through a planned rest day — keep the next one fully easy.')
    expect(r.wins.join()).not.toContain('Rest days taken')
  })

  it('nudges volume back up when load has fallen below the base', () => {
    const r = review({ trimp: trimp([-3]), signals: sig({ load: { state: 'detrained', label: 'Detrained', severity: 1 } }) })
    expect(r.fixes).toContain('📉 Your load has dropped below your base — add volume back gradually, about 10% a week.')
  })

  it('has nothing to fix on a clean week', () => {
    expect(review({ trimp: trimp([-5, -3, -1]) }).fixes).toEqual([])
  })
})

describe('length', () => {
  it(`caps each section at ${WEEK_REVIEW_MAX_LINES} lines, most important first`, () => {
    const r = review({
      perf: perf([50, 50], [-20, -35]),
      trimp: trimp([-6, -5, -4, -3, -2, -1, 0]),
      signals: sig({
        load: { state: 'danger', label: 'Danger', severity: 3 },
        body: { state: 'red', label: 'Wrecked', severity: 3 },
        damage: { state: 'escalating', label: 'Escalating', severity: 3 },
      }),
    })
    expect(r.fixes).toHaveLength(WEEK_REVIEW_MAX_LINES)
    expect(r.fixes[0]).toMatch(/^🛑/)
    expect(r.fixes.join()).not.toContain('No rest day')
  })
})

describe('formatting', () => {
  it('formats training time', () => {
    expect(formatTrainingTime(45)).toBe('45m')
    expect(formatTrainingTime(60)).toBe('1h')
    expect(formatTrainingTime(320)).toBe('5h 20m')
  })

  it('formats the date range within and across months', () => {
    expect(formatReviewRange('2026-09-19', '2026-09-25')).toBe('Sep 19 – 25')
    expect(formatReviewRange('2026-09-29', '2026-10-05')).toBe('Sep 29 – Oct 5')
  })
})
