/**
 * Adaptive engine PR 7 — the Morning Outlook: HRV-trend-gated same-day
 * modulation (swap > trim), heat re-pacing, hard guardrails (baseline
 * required, race week locked, trends over single bad nights), and the
 * Adaptation Log store.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import type {
  GarminHealthData, PlannedDay, ReadinessBaselines, ReadinessScore,
  TrainingWeek, ActualWorkout,
} from '../types'
import {
  buildMorningOutlook, buildEvidence, downStreak,
} from '../engines/adaptive/morningOutlook'
import {
  appendEntry, markEntryReverted, readLog, type AdaptationLogEntry,
} from '../hooks/useAdaptationLog'

const TODAY = '2026-09-16' // Wed

function day(over: Partial<PlannedDay>, logged = false): PlannedDay {
  const actual: ActualWorkout | undefined = logged ? {
    stravaId: 1, source: 'strava', distance: 4, movingTime: 2400, elapsedTime: 2500,
    elevationGain: 0, type: 'Run', name: 'Run', startDate: '2026-09-14T07:00:00',
  } : undefined
  return {
    day: 'Mon 9/14', type: 'run', workout: 'Easy run', detail: '',
    zone: '4.0 mi · Z2 (130–148)', route: '', time: '40 min', actual, ...over,
  }
}

function planWeeks(days: PlannedDay[], weekNum = 1): TrainingWeek[] {
  return [
    { num: weekNum, dates: '', startIso: '2026-09-14', miles: 20, focus: 'Build', days },
    { num: weekNum + 1, dates: '', startIso: '2026-09-21', miles: 20, focus: 'Build', days: [] },
    { num: weekNum + 2, dates: '', startIso: '2026-09-28', miles: 20, focus: 'Build', days: [] },
  ]
}

function standardWeek(over: { fridayLogged?: boolean } = {}): PlannedDay[] {
  return [
    day({ day: 'Mon 9/14' }, true),
    day({ day: 'Wed 9/16', type: 'quality', workout: 'Threshold intervals', time: '50 min', zone: '5.0 mi · Z4 · 8:45-9:10 /mi' }),
    day({ day: 'Fri 9/18', workout: 'Easy run', time: '40 min' }, over.fridayLogged ?? false),
    day({ day: 'Sun 9/20', type: 'long', workout: 'Long run', time: '80 min', zone: '8 mi · Z2 (130–148)' }),
  ]
}

function score(date: string, status: ReadinessScore['status']): ReadinessScore {
  const composite = status === 'RED' ? -1.2 : status === 'YELLOW' ? -0.4 : 0.8
  return {
    date, composite, displayScore: status === 'RED' ? 35 : status === 'YELLOW' ? 55 : 80,
    status, trainingState: 'B',
    components: { hrv: -1, rhr: -0.5, sleep: -0.5, trainingLoad: 0 },
    message: '',
  }
}

const BASELINES: ReadinessBaselines = {
  lnRmssd: { mean: Math.log(60), stdDev: 0.15, sampleSize: 30 },
  rhr: { mean: 52, stdDev: 3, sampleSize: 30 },
  sleepDuration: { mean: 7.2, stdDev: 0.8, sampleSize: 30 },
  sleepScore: { mean: 78, stdDev: 8, sampleSize: 30 },
  dailyTrimp: { mean: 60, stdDev: 30, sampleSize: 30 },
}

const HEALTH: GarminHealthData = {
  date: TODAY,
  hrv: { weeklyAvg: 45, lastNightAvg: 40, status: 'low' },
  rhr: 58,
  sleep: { durationSeconds: 5 * 3600 + 41 * 60, quality: 'poor', deepSeconds: 3000, remSeconds: 4000, lightSeconds: 9000, awakeSeconds: 1200 },
}

const redTrend = [score('2026-09-14', 'YELLOW'), score('2026-09-15', 'RED'), score(TODAY, 'RED')]

function inputs(over: Partial<Parameters<typeof buildMorningOutlook>[2]> = {}) {
  return {
    score: score(TODAY, 'RED'), recentScores: redTrend,
    baselines: BASELINES, health: HEALTH, ...over,
  }
}

describe('buildMorningOutlook — readiness gate', () => {
  it('swaps a hard day out on a 3-day red trend — moved, never deleted', () => {
    const outlook = buildMorningOutlook(planWeeks(standardWeek()), TODAY, inputs())!
    expect(outlook.verdict).toBe('swap')
    expect(outlook.movedToDay).toBe('Fri 9/18')
    expect(outlook.ops).toHaveLength(2)
    // Mirrored updates: today becomes the easy run, Friday gets the intervals.
    const updates = outlook.ops.map(o => (o.op as { updates: Partial<PlannedDay> }).updates)
    expect(updates[0].workout).toBe('Easy run')
    expect(updates[1].workout).toBe('Threshold intervals')
    expect(outlook.why).toMatch(/3rd straight day/)
    expect(outlook.evidence.find(e => e.label.includes('HRV'))?.value).toMatch(/% below/)
  })

  it('a single bad night changes nothing — trends only', () => {
    const outlook = buildMorningOutlook(planWeeks(standardWeek()), TODAY, inputs({
      recentScores: [score('2026-09-15', 'GREEN'), score(TODAY, 'RED')],
    }))!
    expect(outlook.verdict).toBe('confirm')
    expect(outlook.ops).toHaveLength(0)
  })

  it('without ~3 weeks of HRV baseline the readiness gate stays closed', () => {
    const thin = { ...BASELINES, lnRmssd: { ...BASELINES.lnRmssd, sampleSize: 10 } }
    const outlook = buildMorningOutlook(planWeeks(standardWeek()), TODAY, inputs({ baselines: thin }))!
    expect(outlook.verdict).toBe('confirm')
  })

  it('trims to 70% when no safe swap target exists', () => {
    // Friday already logged → the only landing spot is gone.
    const outlook = buildMorningOutlook(planWeeks(standardWeek({ fridayLogged: true })), TODAY, inputs())!
    expect(outlook.verdict).toBe('trim')
    expect(outlook.ops).toHaveLength(1)
    const updates = (outlook.ops[0].op as { updates: Partial<PlannedDay> }).updates
    expect(updates.time).toBe('35 min')
    expect(updates.zone).toContain('3.5 mi')
  })

  it('leaves a pinned day alone — autopilot never touches a locked session', () => {
    // Same red trend that swaps a hard day out above, but today (Wed) is
    // locked: the athlete pinned it, so autopilot stands down entirely.
    const locked = standardWeek().map(d => d.day === 'Wed 9/16' ? { ...d, locked: true } : d)
    const outlook = buildMorningOutlook(planWeeks(locked), TODAY, inputs())
    expect(outlook).toBeNull()
  })

  it('yellow trend keeps the session at 80% instead of moving it', () => {
    const outlook = buildMorningOutlook(planWeeks(standardWeek()), TODAY, inputs({
      score: score(TODAY, 'YELLOW'),
      recentScores: [score('2026-09-14', 'YELLOW'), score('2026-09-15', 'YELLOW'), score(TODAY, 'YELLOW')],
    }))!
    expect(outlook.verdict).toBe('trim')
    expect((outlook.ops[0].op as { updates: Partial<PlannedDay> }).updates.time).toBe('40 min')
  })
})

describe('buildMorningOutlook — heat and guardrails', () => {
  const greenInputs = () => inputs({
    score: score(TODAY, 'GREEN'),
    recentScores: [score('2026-09-15', 'GREEN'), score(TODAY, 'GREEN')],
  })

  it('eases pace targets for a hot forecast, today only', () => {
    const outlook = buildMorningOutlook(planWeeks(standardWeek()), TODAY, { ...greenInputs(), heatTempF: 91 })!
    expect(outlook.verdict).toBe('heat-repace')
    expect(outlook.ops).toHaveLength(1)
    const updates = (outlook.ops[0].op as { updates: Partial<PlannedDay> }).updates
    expect(updates.zone).not.toContain('8:45')
    expect(outlook.why).toMatch(/91°F/)
  })

  it('a mild morning changes nothing', () => {
    const outlook = buildMorningOutlook(planWeeks(standardWeek()), TODAY, { ...greenInputs(), heatTempF: 72 })!
    expect(outlook.verdict).toBe('confirm')
  })

  it('race week is untouchable', () => {
    // A lone week is the plan's last week → protected.
    const weeks: TrainingWeek[] = [{ num: 1, dates: '', startIso: '2026-09-14', miles: 20, focus: 'Race', days: standardWeek() }]
    expect(buildMorningOutlook(weeks, TODAY, inputs())).toBeNull()
  })

  it('rest days and logged days have nothing to decide', () => {
    const restToday = [day({ day: 'Wed 9/16', type: 'rest', workout: 'Rest' })]
    expect(buildMorningOutlook(planWeeks(restToday), TODAY, inputs())).toBeNull()
    const loggedToday = [day({ day: 'Wed 9/16', type: 'quality', workout: 'Threshold intervals' }, true)]
    expect(buildMorningOutlook(planWeeks(loggedToday), TODAY, inputs())).toBeNull()
  })
})

describe('evidence + trend helpers', () => {
  it('reports HRV vs band, sleep, and RHR delta from real signals only', () => {
    const rows = buildEvidence(inputs())
    expect(rows.find(r => r.label === '7-day HRV vs your band')?.value).toBe('13% below')
    expect(rows.find(r => r.label === 'Sleep last night')?.value).toBe('5h 41m')
    expect(rows.find(r => r.label === 'Resting HR vs baseline')?.value).toBe('+6 bpm')
    expect(buildEvidence({ score: null, recentScores: [], baselines: null, health: null })).toHaveLength(0)
  })

  it('downStreak counts consecutive down days ending today', () => {
    expect(downStreak(redTrend, TODAY)).toBe(3)
    expect(downStreak([score('2026-09-14', 'RED'), score(TODAY, 'RED')], TODAY)).toBe(1) // 9/15 missing breaks it
    expect(downStreak([score(TODAY, 'GREEN')], TODAY)).toBe(0)
  })
})

describe('adaptation log store', () => {
  beforeEach(() => localStorage.clear())

  const entry = (over: Partial<AdaptationLogEntry> = {}) => ({
    dateIso: TODAY, source: 'autopilot' as const, kind: 'auto' as const,
    title: 'Swapped threshold intervals → easy run', detail: 'HRV 13% below band, 3rd down day.',
    batchId: 'batch_1', ...over,
  })

  it('appends newest-first and caps the log', () => {
    let list: AdaptationLogEntry[] = []
    for (let i = 0; i < 125; i++) {
      list = appendEntry(list, entry({ title: `entry ${i}`, atMs: 1000 + i })).entries
    }
    expect(list).toHaveLength(120)
    expect(list[0].title).toBe('entry 124')
  })

  it('marking reverted keeps the story but removes the undo', () => {
    const { entries, id } = appendEntry([], entry())
    const after = markEntryReverted(entries, id)
    expect(after[0].kind).toBe('reverted')
    expect(after[0].batchId).toBeUndefined()
    expect(after[0].title).toContain('Swapped')
  })

  it('readLog survives an empty or corrupt store', () => {
    expect(readLog()).toEqual([])
    localStorage.setItem('ba_adaptation_log_v1', 'not json')
    expect(readLog()).toEqual([])
  })
})
