/**
 * The last-7-days review: exact window, plain stats, and every line sorted
 * into Going well / To improve with an action on each To-improve line.
 */
import { describe, it, expect } from 'vitest'
import {
  buildWeekReview,
  weekReviewDigest,
  type WeekReview,
  formatClock,
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

let nextId = 1
const actual = (minutes: number, name = 'Run', over: Partial<ActualWorkout> = {}): ActualWorkout => ({
  stravaId: nextId++, distance: 5000, movingTime: minutes * 60, elapsedTime: minutes * 60,
  elevationGain: 0, type: 'Run', name, startDate: `${TODAY}T07:00:00Z`, ...over,
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
    expect(review({ trimp: trimp([-1]) }).wins).toContain('⚖️ Your training load is in a safe range for your base.')
    expect(review({ trimp: [] }).wins.join()).not.toContain('safe range')
    expect(review({ trimp: trimp([-1]), signals: sig({ rampAlert: true }) }).wins.join()).not.toContain('safe range')
  })

  it('does not call fresher a win while the body or soreness disagrees', () => {
    const fresher = perf([50, 50], [-5, 5])
    const t = trimp([-3])
    expect(review({ perf: fresher, trimp: t }).wins.join()).toContain('Fresher than a week ago (Recovery Balance +10)')
    const bodyLow = sig({ body: { state: 'yellow', label: 'Sub-baseline', severity: 2 } })
    expect(review({ perf: fresher, trimp: t, signals: bodyLow }).wins.join()).not.toContain('Fresher')
    const sore = sig({ damage: { state: 'elevated', label: 'Elevated', severity: 2 } })
    expect(review({ perf: fresher, trimp: t, signals: sore }).wins.join()).not.toContain('Fresher')
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

  it('formats a clock time the way Garmin lists activities', () => {
    expect(formatClock(1546)).toBe('25:46')
    expect(formatClock(4381)).toBe('1:13:01')
    expect(formatClock(476)).toBe('7:56')
    expect(formatClock(3600)).toBe('1:00:00')
  })
})

describe('review findings', () => {
  const label = (offset: number) => {
    const d = new Date(`${iso(offset)}T12:00:00`)
    return `${d.toLocaleDateString('en-US', { weekday: 'short' })} ${d.getMonth() + 1}/${d.getDate()}`
  }
  const dated = (offset: number, type: WorkoutType, workout?: string, a?: ActualWorkout): PlannedDay =>
    ({ ...day(type, workout, a), day: label(offset) })

  it('never praises a week with no training, and says to restart', () => {
    const r = review({ perf: perf([50, 44], [0, 20]) })
    expect(r.wins).toEqual([])
    expect(r.fixes).toContain('🗓️ No training logged in 7 days — if you trained, sync your watch; if not, restart with an easy 20–30 minutes.')
  })

  it('does not nag a planned all-rest week', () => {
    const weeks = plan([day('rest'), day('rest'), day('rest'), day('rest'), day('rest'), day('rest'), day('rest')])
    expect(review({ weeks }).fixes).toEqual([])
  })

  it('does not count stray load on a planned day as the session done', () => {
    // An e-bike commute the matcher refused to claim for the track session.
    const weeks = plan([day('quality', 'Track 6x800'), day('rest'), day('rest'), day('rest'), day('rest'), day('rest'), day('rest')])
    const r = review({ weeks, trimp: trimp([-6], 8) })
    expect(r.stats.planned).toEqual({ done: 0, due: 1 })
    expect(r.wins.join()).not.toMatch(/done|Key session/)
    // …but it isn't "not logged" either: something was recorded that day.
    expect(r.fixes.join()).not.toContain('logged')
  })

  it('dates days by their label, so an added session does not shift the week', () => {
    // A coach edit spliced a second session into the first day: eight
    // entries, and the index no longer matches the date.
    // The added strength session has load recorded on its day (-6) but no
    // matched workout; dated by index it would land on -5 and read as
    // "not logged", and every later day would slide by one.
    const weeks = plan([
      dated(-6, 'run', 'Easy run', actual(30)), dated(-6, 'strength', 'Strength'),
      dated(-5, 'rest'), dated(-4, 'run', 'Easy run', actual(40)), dated(-3, 'rest'),
      dated(-2, 'run', 'Easy run', actual(40)), dated(-1, 'rest'), dated(0, 'rest'),
    ])
    const r = review({ weeks, trimp: trimp([-6, -4, -2]) })
    expect(r.stats.planned).toEqual({ done: 3, due: 4 })
    expect(r.fixes.join()).not.toContain('logged')
    expect(r.wins).toContain('😴 Rest days taken as planned.')
  })

  it('counts a day once when two plan weeks overlap', () => {
    const week = plan([
      day('run', 'Easy run', actual(60)), day('rest'), day('run', 'Easy run', actual(60)),
      day('rest'), day('rest'), day('rest'), day('rest'),
    ])[0]
    const r = review({ weeks: [week, { ...week, num: 2 }] })
    expect(r.stats.planned).toEqual({ done: 2, due: 2 })
    expect(r.stats.trainingMinutes).toBe(120)
  })

  it('reads a session moved onto a rest day as a swap, not two problems', () => {
    const weeks = plan([
      day('run', 'Easy run', actual(40)), day('run', 'Tempo'), day('rest', 'Rest', actual(45)),
      day('rest'), day('run', 'Easy run', actual(40)), day('rest'), day('rest'),
    ])
    const r = review({ weeks })
    expect(r.stats.planned).toEqual({ done: 3, due: 3 })
    expect(r.fixes.join()).not.toMatch(/logged|rest day/)
  })

  it('does not tell a tapering athlete to add volume', () => {
    const detrained = sig({ load: { state: 'detrained', label: 'Detrained', severity: 1 } })
    const taper = plan([day('run', 'Easy run', actual(30)), day('rest'), day('rest'), day('rest'), day('rest'), day('rest'), day('rest')])
    taper[0].focus = 'Taper'
    expect(review({ weeks: taper, trimp: trimp([-6]), signals: detrained }).fixes.join()).not.toContain('add volume')
    const block = plan([day('run', 'Easy run', actual(30)), day('rest'), day('rest'), day('rest'), day('rest'), day('rest'), day('rest')])
    block[0].seasonRace = { name: 'Fall 50k', dateIso: iso(3), blockKind: 'TAPER' }
    expect(review({ weeks: block, trimp: trimp([-6]), signals: detrained }).fixes.join()).not.toContain('add volume')
    const race = plan([day('rest'), day('rest'), day('rest'), day('rest'), day('rest'), day('rest'), day('race', 'Race day')])
    expect(review({ weeks: race, trimp: trimp([-6]), signals: detrained }).fixes.join()).not.toContain('add volume')
  })

  it('measures fitness across the dates, not the positions, of a gappy series', () => {
    // Only three readings: 10 days ago, 7 days ago, and today.
    const p: PerformanceMetrics[] = [
      { date: iso(-10), ctl: 30, atl: 30, tsb: 0, acwr: 1 },
      { date: iso(-7), ctl: 40, atl: 40, tsb: 0, acwr: 1 },
      { date: iso(0), ctl: 45, atl: 45, tsb: 0, acwr: 1 },
    ]
    expect(review({ perf: p }).stats.fitnessDelta).toBe(5)
  })

  it('ignores readings dated after today', () => {
    const p = [...perf([40, 44]), { date: iso(1), ctl: 60, atl: 50, tsb: 0, acwr: 1 }]
    expect(review({ perf: p }).stats.fitnessDelta).toBe(4)
  })
})

describe('training time matches the watch', () => {
  const rest = () => day('rest')
  const weekWith = (first: PlannedDay, ...more: PlannedDay[]) =>
    plan([first, ...more, ...Array.from({ length: 6 - more.length }, rest)])

  it("uses Garmin's timer time, not its moving time", () => {
    // Garmin's list shows 29:50 for a ride whose moving time is 28:19.
    const ride = actual(0, 'Oakland eBiking', { source: 'garmin', stravaId: 0, garminId: 11, type: 'e_bike', movingTime: 1699, elapsedTime: 1790 })
    const r = review({ weeks: weekWith(day('cross', 'Ride', ride)) })
    expect(r.stats.activities).toEqual([{ iso: iso(-6), name: 'Oakland eBiking', seconds: 1790 }])
    expect(r.stats.trainingMinutes).toBe(30)
  })

  it("uses Strava's moving time, since its elapsed time runs to the save", () => {
    // Strava: moving 25:46, elapsed 42:27 — Garmin shows 25:46 for the same hike.
    const hike = actual(0, 'Lunch Hike', { source: 'strava', type: 'Hike', movingTime: 1546, elapsedTime: 2547 })
    expect(review({ weeks: weekWith(day('cross', 'Hike', hike)) }).stats.trainingMinutes).toBe(26)
  })

  it('counts an activity once when two sessions are planned on its date', () => {
    const strength = actual(40, 'Strength', { source: 'garmin', stravaId: 0, garminId: 21 })
    const run = actual(20, 'Run', { source: 'garmin', stravaId: 0, garminId: 22 })
    // Both plan entries for the day see both activities, as the matcher leaves them.
    const a = { ...day('strength', 'Strength', strength), secondaryActuals: [run] }
    const b = { ...day('run', 'Easy run', run), secondaryActuals: [strength] }
    const label = (o: number) => {
      const d = new Date(`${iso(o)}T12:00:00`)
      return `${d.toLocaleDateString('en-US', { weekday: 'short' })} ${d.getMonth() + 1}/${d.getDate()}`
    }
    const days = [{ ...a, day: label(-6) }, { ...b, day: label(-6) },
      ...[-5, -4, -3, -2, -1, 0].map(o => ({ ...rest(), day: label(o) }))]
    const r = review({ weeks: plan(days) })
    expect(r.stats.trainingMinutes).toBe(60)
    expect(r.stats.activities.map(x => x.name)).toEqual(['Strength', 'Run'])
  })

  it('lists every activity, oldest first, with its minutes', () => {
    const d1 = day('run', 'Easy run', actual(30, 'Morning Run'))
    d1.secondaryActuals = [actual(15, 'Walk')]
    const r = review({ weeks: plan([rest(), d1, rest(), day('long', 'Long run', actual(90, 'Long Run')), rest(), rest(), rest()]) })
    expect(r.stats.activities.map(a => `${a.iso} ${a.name} ${a.seconds}`)).toEqual([
      `${iso(-5)} Morning Run 1800`, `${iso(-5)} Walk 900`, `${iso(-3)} Long Run 5400`,
    ])
    expect(r.stats.trainingMinutes).toBe(135)
  })
})

describe('light movement does not use up a rest day', () => {
  const ebike = () => actual(30, 'Oakland eBiking', { type: 'EBikeRide' })

  it('an e-bike commute or a walk on a rest day is not "trained through"', () => {
    const commute = { ...day('rest'), actual: ebike() }
    const walk = { ...day('rest'), actual: actual(40, 'Evening walk', { type: 'Walk' }) }
    const r = review({ weeks: plan([day('run', 'Easy run', actual(30)), commute, walk, day('rest'), day('rest'), day('rest'), day('rest')]) })
    expect(r.fixes.join()).not.toContain('rest day')
    expect(r.wins).toContain('😴 Rest days taken as planned.')
  })

  it('a short hike is light, a long one is a workout', () => {
    const stroll = { ...day('rest'), actual: actual(26, 'Lunch Hike', { type: 'Hike' }) }
    expect(review({ weeks: plan([stroll, day('rest'), day('rest'), day('rest'), day('rest'), day('rest'), day('rest')]) }).fixes.join()).not.toContain('rest day')
    const bigHike = { ...day('rest'), actual: actual(73, 'Berkeley Hiking', { type: 'Hike' }) }
    expect(review({ weeks: plan([bigHike, day('rest'), day('rest'), day('rest'), day('rest'), day('rest'), day('rest')]) }).fixes)
      .toContain('😴 Trained through a planned rest day — keep the next one fully easy.')
  })

  it('an e-bike ride does not stand in for a skipped session as a swap', () => {
    const commute = { ...day('rest'), actual: ebike() }
    const r = review({ weeks: plan([day('run', 'Tempo'), commute, day('rest'), day('rest'), day('rest'), day('rest'), day('rest')]) })
    expect(r.stats.planned).toEqual({ done: 0, due: 1 })
    expect(r.fixes.some(f => f.startsWith('⭕ 1 planned session isn’t logged'))).toBe(true)
  })

  it('commuting every day is not "no rest day in 7 days"', () => {
    const t: DailyTRIMP[] = [-6, -5, -4, -3, -2, -1, 0].map(o => ({
      date: iso(o), total: 10, records: [{ ...record('Oakland eBiking', 10), sportType: 'ebike' as TRIMPRecord['sportType'] }],
    }))
    expect(review({ trimp: t }).fixes.join()).not.toContain('No rest day')
    // …but seven days with a real workout still is.
    expect(review({ trimp: trimp([-6, -5, -4, -3, -2, -1, 0]) }).fixes).toContain('🔥 No rest day in 7 days — take one in the next 48 hours.')
  })
})

describe('second review findings', () => {
  const label = (o: number) => {
    const d = new Date(`${iso(o)}T12:00:00`)
    return `${d.toLocaleDateString('en-US', { weekday: 'short' })} ${d.getMonth() + 1}/${d.getDate()}`
  }
  const rest = () => day('rest')
  /** Two plan entries on the window's first date, then six rest days. */
  const twoOnDayOne = (a: PlannedDay, b: PlannedDay) => plan([
    { ...a, day: label(-6) }, { ...b, day: label(-6) },
    ...[-5, -4, -3, -2, -1, 0].map(o => ({ ...rest(), day: label(o) })),
  ])
  const onRestDay = (a: ActualWorkout) =>
    plan([{ ...rest(), actual: a }, rest(), rest(), rest(), rest(), rest(), rest()])
  const TRAINED = '😴 Trained through a planned rest day — keep the next one fully easy.'

  it('counts a Strava run once when its Garmin-enriched copy sits on the other plan entry', () => {
    // The run day's actual was enriched (both ids); the strength entry
    // for the same date still lists the bare Strava copy.
    const enriched = actual(40, 'Morning Run', { stravaId: 111, garminId: 999, source: 'strava', garminTimerTime: 2460 })
    const bare = actual(40, 'Morning Run', { stravaId: 111, source: 'strava' })
    const r = review({ weeks: twoOnDayOne(
      day('run', 'Easy run', enriched),
      { ...day('strength', 'Gym strength'), secondaryActuals: [bare] },
    ) })
    expect(r.stats.activities).toHaveLength(1)
    expect(r.stats.trainingMinutes).toBe(41)
  })

  it('matches a session by any of its ids, even when the copies disagree on time', () => {
    // A manual edit changed the enriched copy's duration; the ids still say
    // it is the same run.
    const enriched = actual(0, 'Morning Run', { stravaId: 111, garminId: 999, source: 'strava', movingTime: 3600 })
    const bare = actual(0, 'Morning Run', { stravaId: 111, source: 'strava', movingTime: 1500 })
    const r = review({ weeks: twoOnDayOne(
      day('run', 'Easy run', enriched),
      { ...day('strength', 'Gym strength'), secondaryActuals: [bare] },
    ) })
    expect(r.stats.activities).toHaveLength(1)
    expect(r.stats.trainingMinutes).toBe(60)
  })

  it('counts a session once when two sources give it different ids on the same date', () => {
    const fromGarmin = actual(0, 'Run', { stravaId: 0, garminId: 5, source: 'garmin', movingTime: 2350, elapsedTime: 2400 })
    const fromStrava = actual(0, 'Afternoon Run', { stravaId: 7, source: 'strava', movingTime: 2350, elapsedTime: 2500 })
    const r = review({ weeks: twoOnDayOne(
      day('run', 'Easy run', fromGarmin),
      { ...day('strength', 'Gym strength'), secondaryActuals: [fromStrava] },
    ) })
    expect(r.stats.activities.map(a => a.name)).toEqual(['Run'])
    expect(r.stats.trainingMinutes).toBe(40)
  })

  it("uses Garmin's timer time for a Strava actual enriched with Garmin data", () => {
    const enriched = actual(0, 'Afternoon Run', { source: 'strava', movingTime: 1200, elapsedTime: 1900, garminTimerTime: 1320 })
    expect(review({ weeks: plan([day('run', 'Easy run', enriched), rest(), rest(), rest(), rest(), rest(), rest()]) }).stats.activities[0].seconds).toBe(1320)
  })

  it('keeps workouts whose names only look light', () => {
    for (const a of [
      actual(35, 'Walking lunges & core', { type: 'WeightTraining' }),
      actual(120, 'Lake bike loop', { type: 'Ride' }),
      actual(40, 'Run/walk intervals', { type: 'Run' }),
      actual(50, 'Long run + mobility', { type: 'Run' }),
    ]) {
      expect(review({ weeks: onRestDay(a) }).fixes).toContain(TRAINED)
    }
  })

  it('knows the e-bike and walking types training load knows', () => {
    for (const a of [
      actual(40, 'Hills', { type: 'EMountainBikeRide' }),
      actual(30, 'Walk', { type: 'indoor_walking' }),
      actual(30, 'Stroll', { type: 'casual_walking' }),
      actual(45, 'Flow', { type: 'Yoga' }),
    ]) {
      expect(review({ weeks: onRestDay(a) }).fixes).not.toContain(TRAINED)
    }
  })

  it('agrees with training load that a hard no-assist e-bike ride is a workout', () => {
    expect(review({ weeks: onRestDay(actual(60, 'E-bike hard no assist', { type: 'EBikeRide' })) }).fixes).toContain(TRAINED)
  })

  it('still credits a swap when the skipped day had only a commute', () => {
    // Tempo planned day 1, skipped (an e-bike commute that day); the run
    // was done on day 3, a planned rest day.
    const commute: DailyTRIMP = { date: iso(-6), total: 10, records: [{ ...record('Oakland eBiking', 10), sportType: 'ebike' as TRIMPRecord['sportType'] }] }
    const r = review({
      weeks: plan([day('quality', 'Tempo'), rest(), { ...rest(), actual: actual(45, 'Tempo run') }, rest(), rest(), rest(), rest()]),
      trimp: [commute, ...trimp([-4])],
    })
    expect(r.stats.planned).toEqual({ done: 1, due: 1 })
    expect(r.fixes.join()).not.toMatch(/rest day|logged/)
  })
})

describe('carried soreness is not training', () => {
  // Field bug (2026-09-29): Fri, Sat and Mon were rest days, yet the card
  // said "No rest day in 7 days" and the coach's take repeated it. A day's
  // load total also holds soreness carried forward from a hard session and
  // soreness check-ins, so every rest day after a strength session had load.
  const NO_REST = '🔥 No rest day in 7 days — take one in the next 48 hours.'
  const rec = (name: string, sport: string, load: number): TRIMPRecord => ({
    ...record(name, load), sportType: sport as TRIMPRecord['sportType'],
  })
  /** A load total with no activity behind it: carried soreness. */
  const carried = (o: number, total = 25): DailyTRIMP => ({ date: iso(o), total, records: [] })
  const logged = (o: number, ...records: TRIMPRecord[]): DailyTRIMP => ({
    date: iso(o), total: records.reduce((t, r) => t + r.adjustedTRIMP, 0) + 10, records,
  })

  it('does not count load-only days as training without a plan', () => {
    const r = review({ trimp: [
      logged(-6, rec('Lower body + sleds', 'strength_lower', 90)),
      logged(-5, rec('Oakland Running', 'running', 40)),
      carried(-4), carried(-3),
      logged(-2, rec('Long run', 'running', 110)),
      carried(-1),
      logged(0, rec('Strength', 'strength_full', 60)),
    ] })
    expect(r.fixes).not.toContain(NO_REST)
    expect(r.stats.daysTrained).toBe(4)
  })

  it('reads the field week as three rest days taken', () => {
    const hike = actual(26, 'Oakland Hiking', { type: 'hiking', source: 'garmin', garminTimerTime: 1546 })
    const commute = actual(33, 'Oakland eBiking', { type: 'e_bike_fitness', source: 'garmin' })
    const r = review({
      weeks: plan([
        day('strength', 'Lower body + sleds', actual(41, 'STRENGTH: Lower body + sleds', { type: 'strength_training' })),
        day('run', 'Easy run', actual(21, 'Oakland Running')),
        { ...day('rest'), actual: commute, secondaryActuals: [hike] },
        day('rest'),
        day('long', 'Long run', actual(80, 'Long run')),
        day('rest'),
        day('strength', 'Upper body', actual(35, 'Strength', { type: 'strength_training' })),
      ]),
      // Every day carries load — the rest days only soreness and the
      // Friday records the watch's hike as a hike.
      trimp: [
        logged(-6, rec('STRENGTH: Lower body + sleds', 'strength_lower', 90)),
        logged(-5, rec('Oakland Running', 'running', 40)),
        logged(-4, rec('Oakland eBiking', 'ebike', 8), rec('Oakland Hiking', 'hiking', 20)),
        carried(-3),
        logged(-2, rec('Long run', 'running', 110)),
        carried(-1),
        logged(0, rec('Strength', 'strength_full', 60)),
      ],
    })
    // Nothing to fix: no "no rest day", no "trained through a rest day".
    expect(r.fixes).toEqual([])
    expect(r.wins[0]).toBe('✅ All 4 planned sessions done.')
    // The commute-and-stroll Friday is not a training day either.
    expect(r.stats.daysTrained).toBe(4)
  })

  it('still says "no training logged" when the only load is carried soreness', () => {
    const r = review({ trimp: [carried(-3), carried(-2), carried(-1)] })
    expect(r.fixes.some(f => f.startsWith('🗓️ No training logged in 7 days'))).toBe(true)
    expect(r.stats.daysTrained).toBe(0)
    expect(r.stats.hardest).toBeNull()
  })

  it('never names a soreness-only day as the hardest session', () => {
    const r = review({ trimp: [logged(-5, rec('Easy spin', 'cycling', 30)), carried(-4, 200)] })
    expect(r.stats.hardest).toEqual({ iso: iso(-5), name: 'Easy spin' })
  })

  it('still flags seven real workout days on a dated plan', () => {
    const run = (min: number) => day('run', 'Easy run', actual(min, 'Run'))
    const r = review({ weeks: plan([run(30), run(31), run(32), run(33), run(34), run(35), run(36)]) })
    expect(r.fixes).toContain(NO_REST)
    expect(r.stats.daysTrained).toBe(7)
  })

  it('reads the load records on dates the plan does not cover', () => {
    // The plan starts three days ago; the four days before it are known
    // only from the watch's records.
    const late: TrainingWeek[] = [{
      num: 1, dates: '', miles: 20, focus: 'Build', startIso: iso(-2),
      days: [day('run', 'Easy run', actual(30)), day('run', 'Easy run', actual(31)), day('run', 'Easy run', actual(32))],
    }]
    const r = review({ weeks: late, trimp: trimp([-6, -5, -4, -3]) })
    expect(r.fixes).toContain(NO_REST)
    expect(r.stats.daysTrained).toBe(7)
  })
})

describe('the digest the coach comments on', () => {
  const full: WeekReview = {
    fromIso: '2026-09-20',
    toIso: '2026-09-26',
    stats: {
      planned: { done: 4, due: 4 }, daysTrained: 6, trainingMinutes: 302, fitnessDelta: 7,
      hardest: { iso: '2026-09-23', name: 'STRENGTH: Lower body + sleds' }, activities: [],
    },
    wins: ['✅ All 4 planned sessions done.', '📈 Fitness up 7 points — the work is adding up.'],
    fixes: ['⚠️ Load is climbing fast — hold next week’s volume flat rather than adding more.'],
  }

  it('carries the card’s numbers and lines, without emoji', () => {
    expect(weekReviewDigest(full)).toBe(
      'Sep 20 – 26 · Sessions done 4 of 4 · Training time 5h 2m · Fitness +7 · '
      + 'Hardest session: Wed STRENGTH: Lower body + sleds · '
      + 'Going well: All 4 planned sessions done. Fitness up 7 points — the work is adding up. · '
      + 'To improve: Load is climbing fast — hold next week’s volume flat rather than adding more.',
    )
  })

  it('says so when a section is empty, and falls back to days trained without a plan', () => {
    const bare: WeekReview = {
      ...full,
      stats: { ...full.stats, planned: null, daysTrained: 2, trainingMinutes: null, fitnessDelta: -3, hardest: null },
      wins: [], fixes: [],
    }
    expect(weekReviewDigest(bare)).toBe(
      'Sep 20 – 26 · Days trained 2 · Fitness -3 · Going well: nothing flagged · To improve: nothing to fix',
    )
  })
})
