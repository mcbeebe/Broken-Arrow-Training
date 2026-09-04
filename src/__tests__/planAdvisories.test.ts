import { describe, it, expect } from 'vitest'
import type { PlannedDay, PlanAdvisory, TrainingWeek } from '../types'
import { seasonQaAdvisories, combineAdvisories } from '../utils/planAdvisories'

/**
 * These rules used to live as `useMemo` bodies inside App.tsx, where the only
 * way to exercise them was to render the whole app. Each one exists because of
 * a specific wrong thing the athlete was told, so each one is pinned here.
 */

function day(label: string, type: PlannedDay['type'], extra: Partial<PlannedDay> = {}): PlannedDay {
  return { day: label, type, workout: 'X', detail: 'd', zone: 'Z2', route: '', time: '45 min', ...extra }
}

/** A layered day as the layering transform stamps them. */
function layered(label: string, detail: string): PlannedDay {
  return day(label, 'strength', {
    workout: 'Hyrox prep — station volumes',
    detail,
    layeredFor: 'Hyrox - Anaheim',
  })
}

function week(num: number, mon: number, d: number, focus: string, days: PlannedDay[]): TrainingWeek {
  return {
    num, dates: '', miles: 20, focus,
    startIso: `2026-${String(mon).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
    days,
  }
}

/** A cutback week carrying a layered dose — a rule the gate fires on. */
const protectedWeekWithLayering = (num: number, mon: number, d: number) =>
  week(num, mon, d, 'Cutback', [
    day('Mon', 'run'),
    layered('Tue', 'SkiErg 350m · Row 350m'),
    day('Wed', 'rest'),
  ])

/** A week the gate has nothing to say about: a rest day, and content that
 *  differs week to week so the duplicate-weeks rule stays quiet. */
const plainWeek = (num: number, mon: number, d: number) =>
  week(num, mon, d, 'Build', [
    day('Mon', 'run', { detail: `easy ${num * 3} mi` }),
    day('Tue', 'strength', { detail: `full body ${num}` }),
    day('Wed', 'rest', { workout: 'Rest', detail: 'off' }),
    day('Thu', 'cross', { detail: `bike ${num * 20} min` }),
    day('Sun', 'long', { detail: `${num * 6} mi` }),
  ])

describe('seasonQaAdvisories — the spliced season gets validated too', () => {
  it('says nothing when there is no season (fewer than two races)', () => {
    const weeks = [plainWeek(1, 9, 14), protectedWeekWithLayering(2, 9, 21)]
    expect(seasonQaAdvisories({ weeks, anchorWeekCount: 1, seasonRaceCount: 1 })).toEqual([])
  })

  it('surfaces findings from weeks BEYOND the anchor', () => {
    const weeks = [plainWeek(1, 9, 14), protectedWeekWithLayering(2, 9, 21)]
    const out = seasonQaAdvisories({ weeks, anchorWeekCount: 1, seasonRaceCount: 2 })
    expect(out.map(a => a.id)).toContain('qa_layered_in_protected_week')
  })

  it('D11: layered findings inside the anchor survive, even with no extra weeks', () => {
    // Layering happens INSIDE the anchor by definition. A "beyond the anchor"
    // filter alone discards every layered finding, and an early return on
    // week count skips the validator entirely for a season whose only change
    // is layered days — which is exactly the season this covers.
    const weeks = [protectedWeekWithLayering(1, 9, 14)]
    const out = seasonQaAdvisories({ weeks, anchorWeekCount: 1, seasonRaceCount: 2 })
    expect(out.map(a => a.id)).toContain('qa_layered_in_protected_week')
  })

  it('says nothing when the season adds weeks but they are clean', () => {
    const weeks = [plainWeek(1, 9, 14), plainWeek(2, 9, 21)]
    expect(seasonQaAdvisories({ weeks, anchorWeekCount: 1, seasonRaceCount: 2 })).toEqual([])
  })

  it('does not repeat the anchor\'s own findings — those already ship with the plan', () => {
    // Week 1 is the anchor and dirty; week 2 is clean. The anchor's findings
    // ride in activePlan.advisories, so saying them again here double-counts.
    const weeks = [protectedWeekWithLayering(1, 9, 14), plainWeek(2, 9, 21)]
    const out = seasonQaAdvisories({ weeks, anchorWeekCount: 1, seasonRaceCount: 2 })
    const fromAnchorOnly = out.filter(a => !a.id.startsWith('qa_layered_'))
    expect(fromAnchorOnly).toEqual([])
  })
})

describe('combineAdvisories — one list, in source order', () => {
  const adv = (id: string): PlanAdvisory => ({ id, severity: 'info', title: id, detail: id })
  const weeks = [plainWeek(1, 9, 14)]

  it('concatenates generator, season QA and layering advisories in that order', () => {
    const out = combineAdvisories({
      planAdvisories: [adv('runway')],
      seasonQa: [adv('qa_layered_in_protected_week')],
      layer: [adv('season_layer_refused_Hyrox')],
      weeks,
      todayIso: '2026-09-16',
    })
    expect(out.map(a => a.id)).toEqual([
      'runway', 'qa_layered_in_protected_week', 'season_layer_refused_Hyrox',
    ])
  })

  it('tolerates a plan with no advisories of its own', () => {
    const out = combineAdvisories({ seasonQa: [], layer: [], weeks, todayIso: '2026-09-16' })
    expect(out).toEqual([])
  })

  it('keeps "zones estimated" up while the benchmark is still ahead', () => {
    const withBenchmark = [week(1, 9, 14, 'Build', [
      day('Mon 9/14', 'quality', {
        workout: 'BENCHMARK — 20 min time trial',
        actual: { movingTime: 1200 } as PlannedDay['actual'],
      }),
    ])]
    const out = combineAdvisories({
      planAdvisories: [adv('zones_estimated')],
      seasonQa: [], layer: [],
      weeks: withBenchmark,
      todayIso: '2026-09-01', // before the benchmark day
    })
    expect(out.map(a => a.id)).toEqual(['zones_estimated'])
  })

  it('retires "zones estimated" once a benchmark has actually been recorded', () => {
    // Telling an athlete their zones are guesses after they have proved
    // otherwise is the failure this drops.
    const withBenchmark = [week(1, 9, 14, 'Build', [
      day('Mon 9/14', 'quality', {
        workout: 'BENCHMARK — 20 min time trial',
        actual: { movingTime: 1200 } as PlannedDay['actual'],
      }),
    ])]
    const out = combineAdvisories({
      planAdvisories: [adv('zones_estimated'), adv('runway')],
      seasonQa: [], layer: [],
      weeks: withBenchmark,
      todayIso: '2026-09-20',
    })
    expect(out.map(a => a.id)).toEqual(['runway'])
  })
})
