import { describe, it, expect } from 'vitest'
import { hashFields, materialFields } from '../hooks/useCoachInsight'
import type { CoachSnapshot } from '../types'

function snap(overrides: Partial<CoachSnapshot> = {}): CoachSnapshot {
  return {
    today: { date: '2026-04-14' },
    currentWeekNum: 1,
    readiness: {
      date: '2026-04-14',
      displayScore: 78,
      status: 'GREEN',
      trainingState: 2,
      components: {} as never,
      score: 78,
      adjustment: null,
    } as never,
    performance: { date: '2026-04-14', ctl: 52.3, atl: 48.9, tsb: 3.4, acwr: 0.94 },
    plannedToday: {
      day: '4/14 Tue',
      type: 'run' as never,
      workout: 'Easy 3mi',
      detail: '',
      zone: 'Z1-2',
      route: '—',
      time: '30m',
    },
    plannedTomorrow: null,
    ...overrides,
  }
}

describe('hashFields', () => {
  it('is stable across identical inputs', () => {
    const a = hashFields({ a: 1, b: 'x', c: [1, 2] })
    const b = hashFields({ a: 1, b: 'x', c: [1, 2] })
    expect(a).toBe(b)
  })
  it('differs when inputs differ materially', () => {
    expect(hashFields({ a: 1 })).not.toBe(hashFields({ a: 2 }))
  })
})

describe('materialFields', () => {
  it('buckets readiness score to 10 so trivial drift does not bust cache', () => {
    // 76 and 79 both round to 80 bucket (7.6→8, 7.9→8)
    const s1 = snap({ readiness: { ...snap().readiness!, displayScore: 76 } as never })
    const s2 = snap({ readiness: { ...snap().readiness!, displayScore: 79 } as never })
    expect(hashFields(materialFields('daily', s1))).toBe(
      hashFields(materialFields('daily', s2)),
    )
  })

  it('rounds CTL/ATL/TSB so sub-integer drift is cache-stable', () => {
    const s1 = snap({
      performance: { date: '2026-04-14', ctl: 52.3, atl: 48.9, tsb: 3.4, acwr: 0.94 },
    })
    const s2 = snap({
      performance: { date: '2026-04-14', ctl: 52.4, atl: 48.7, tsb: 3.2, acwr: 0.99 },
    })
    expect(hashFields(materialFields('daily', s1))).toBe(
      hashFields(materialFields('daily', s2)),
    )
  })

  it('busts cache when readiness status band changes', () => {
    const green = snap({ readiness: { ...snap().readiness!, status: 'GREEN' } as never })
    const yellow = snap({ readiness: { ...snap().readiness!, status: 'YELLOW' } as never })
    expect(hashFields(materialFields('daily', green))).not.toBe(
      hashFields(materialFields('daily', yellow)),
    )
  })

  it('busts cache when the planned workout for today changes', () => {
    const a = snap()
    const b = snap({
      plannedToday: { ...snap().plannedToday!, workout: 'Tempo 4mi' },
    })
    expect(hashFields(materialFields('daily', a))).not.toBe(
      hashFields(materialFields('daily', b)),
    )
  })

  it('different surfaces produce different hashes for the same snapshot', () => {
    const s = snap()
    expect(hashFields(materialFields('daily', s))).not.toBe(
      hashFields(materialFields('day_card:4/14 Tue', s)),
    )
  })

  it('busts cache when HR zones change in settings', () => {
    const z148 = snap({
      zones: [
        { zone: 'Z1', hr: '108-128', pct: '55-65%', desc: '' },
        { zone: 'Z2', hr: '128-148', pct: '65-75%', desc: '' },
      ],
    })
    const z150 = snap({
      zones: [
        { zone: 'Z1', hr: '108-128', pct: '55-65%', desc: '' },
        { zone: 'Z2', hr: '128-150', pct: '65-75%', desc: '' },
      ],
    })
    expect(hashFields(materialFields('daily', z148))).not.toBe(
      hashFields(materialFields('daily', z150)),
    )
  })

  it('busts cache when today\'s workout becomes actual-logged', () => {
    const before = snap()
    const after = snap({
      plannedToday: {
        ...snap().plannedToday!,
        actual: { name: 'Easy run', distance: 3.1, movingTime: 1800 } as never,
      },
    })
    expect(hashFields(materialFields('daily', before))).not.toBe(
      hashFields(materialFields('daily', after)),
    )
  })
})

// The welcome letter is a one-time, onboarding-time note. Its snapshot is a
// bespoke shape (plan + the athlete's own words), with no readiness/activity
// data yet — so its cache key must be stable against transient signals and
// only bust when the athlete redoes onboarding with different inputs.
describe('materialFields — welcome_letter', () => {
  function wlSnap(overrides: Record<string, unknown> = {}): CoachSnapshot {
    return {
      athleteProfile: { name: 'Pat', maxHR: 165, currentBase: '', weeklyStructure: '' },
      race: {
        name: 'Summer fitness',
        distance: 'General fitness — no race',
        description: 'Back in shape after years off.',
        athleteGoal: 'Build a consistent habit.',
      },
      zones: [{ zone: 'Z1', hr: '91-107', pct: '', desc: '' }],
      weeks: [{}, {}, {}],
      detailLevel: 'simple',
      currentWeekNum: 1,
      ...overrides,
    } as unknown as CoachSnapshot
  }

  it('keys on the plan + the athlete\'s words, not transient signals', () => {
    const plain = wlSnap()
    // Same plan + words, but with readiness/perf/today layered on — these must
    // NOT change the welcome-letter cache key.
    const withSignals = wlSnap({
      readiness: { status: 'YELLOW', displayScore: 40, trainingState: 1 },
      performance: { ctl: 12, atl: 30, tsb: -18, acwr: 1.4 },
      today: { date: '2026-06-08' },
    })
    expect(hashFields(materialFields('welcome_letter', plain))).toBe(
      hashFields(materialFields('welcome_letter', withSignals)),
    )
  })

  it('busts when the athlete\'s goal / own words change (redo onboarding)', () => {
    const a = wlSnap()
    const b = wlSnap({
      race: {
        name: 'Fall 10K',
        distance: '10K',
        description: 'Training for my first 10K race.',
        athleteGoal: 'Finish under an hour.',
      },
    })
    expect(hashFields(materialFields('welcome_letter', a))).not.toBe(
      hashFields(materialFields('welcome_letter', b)),
    )
  })
})
