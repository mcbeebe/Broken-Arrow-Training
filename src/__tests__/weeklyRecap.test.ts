/**
 * N3 — the Sunday recap. Two things are worth pinning: WHEN it appears
 * (a date calculation that is easy to get subtly wrong and annoying when
 * it is), and WHAT it says (grounded in the compliance numbers, never
 * scolding, never inventing).
 */
import { describe, it, expect } from 'vitest'
import { buildWeeklyRecap, recapToMarkdown } from '../engines/coach/weeklyRecap'
import { shouldShowRecap, recapWeekKey } from '../hooks/useWeeklyRecap'
import type { WeekCompliance } from '../hooks/useCompliance'
import type { TrainingWeek } from '../types'

function week(focus = 'Mesocycle 2 — Lactate Threshold'): TrainingWeek {
  return {
    num: 6,
    dates: 'Sep 1 – Sep 7',
    startIso: '2026-09-01',
    miles: 32,
    focus,
    days: [
      { day: 'Mon 9/1', type: 'rest', workout: 'Rest', detail: '', zone: '—', route: '', time: '—' },
      { day: 'Tue 9/2', type: 'quality', workout: 'Threshold intervals', detail: '', zone: 'Z4', route: '', time: '50 min' },
      { day: 'Sat 9/6', type: 'long', workout: 'Long run', detail: '', zone: 'Z2', route: '', time: '2h', actual: { distance: 14 } as never },
    ],
  } as TrainingWeek
}

function compliance(over: Partial<WeekCompliance> = {}): WeekCompliance {
  return {
    weekNum: 6,
    completed: 5, missed: 0, restDays: 2, totalWorkouts: 5,
    plannedMiles: 32, actualMiles: 31,
    plannedElevation: 0, actualElevation: 0,
    plannedDuration: 300, actualDuration: 295,
    hrCompliance: 80, hrCheckedWorkouts: 4, hrInZoneTotal: 320,
    days: [],
    distanceCompliancePct: 97, durationCompliancePct: 98, flaggedCount: 0,
    ...over,
  }
}

const at = (iso: string, h: number, m = 0) => {
  const d = new Date(`${iso}T00:00:00`)
  d.setHours(h, m, 0, 0)
  return d
}

describe('when the recap appears', () => {
  // 2026-09-06 is a Sunday; 2026-09-07 a Monday; 2026-09-05 a Saturday.
  it('opens on Sunday afternoon, not Sunday morning', () => {
    expect(recapWeekKey(at('2026-09-06', 9))).toBeNull()
    expect(recapWeekKey(at('2026-09-06', 14, 59))).toBeNull()
    expect(recapWeekKey(at('2026-09-06', 15))).toBe('2026-09-06')
    expect(recapWeekKey(at('2026-09-06', 21))).toBe('2026-09-06')
  })

  it('never opens on another day of the week', () => {
    for (const iso of ['2026-09-05', '2026-09-07', '2026-09-08', '2026-09-11']) {
      expect(recapWeekKey(at(iso, 18)), iso).toBeNull()
    }
  })

  it('shows once for a fresh Sunday, and stays up into Monday', () => {
    const fresh = shouldShowRecap(null, at('2026-09-06', 16))
    expect(fresh.show).toBe(true)
    expect(fresh.weekKey).toBe('2026-09-06')

    const shownAt = at('2026-09-06', 16).getTime()
    const monday = shouldShowRecap({ weekKey: '2026-09-06', shownAt }, at('2026-09-07', 9))
    expect(monday.show).toBe(true)
  })

  it('stops after 24 hours and never comes back for that week', () => {
    const shownAt = at('2026-09-06', 16).getTime()
    expect(shouldShowRecap({ weekKey: '2026-09-06', shownAt }, at('2026-09-07', 17)).show).toBe(false)
    // Still gone days later.
    expect(shouldShowRecap({ weekKey: '2026-09-06', shownAt }, at('2026-09-10', 12)).show).toBe(false)
  })

  it('a dismissal is final for that week, even inside the 24h window', () => {
    const shownAt = at('2026-09-06', 16).getTime()
    const state = { weekKey: '2026-09-06', shownAt, dismissed: true }
    expect(shouldShowRecap(state, at('2026-09-06', 17)).show).toBe(false)
  })

  it('the NEXT Sunday opens a new one', () => {
    const state = { weekKey: '2026-09-06', shownAt: at('2026-09-06', 16).getTime(), dismissed: true }
    const next = shouldShowRecap(state, at('2026-09-13', 16))
    expect(next.show).toBe(true)
    expect(next.weekKey).toBe('2026-09-13')
  })
})

describe('what the recap says', () => {
  const base = { week: week(), weekNum: 6, totalWeeks: 16, todayIso: '2026-09-06' }

  it('reports the real numbers and never invents any', () => {
    const r = buildWeeklyRecap({ ...base, compliance: compliance() })
    const miles = r.stats.find(s => s.label === 'Miles')!
    expect(miles.value).toBe('31')
    expect(miles.sub).toBe('of 32 planned')
    expect(r.stats.find(s => s.label === 'Sessions')!.value).toBe('5')
    expect(r.paragraphs.join(' ')).toContain('31 of 32 planned miles')
  })

  it('celebrates a streak only when there is one', () => {
    const history = [compliance({ weekNum: 4 }), compliance({ weekNum: 5 })]
    const withStreak = buildWeeklyRecap({ ...base, compliance: compliance(), history })
    expect(withStreak.headline).toMatch(/3 weeks in a row/i)

    const noStreak = buildWeeklyRecap({ ...base, compliance: compliance() })
    expect(noStreak.headline).not.toMatch(/in a row/i)
  })

  it('a bad week is named without scolding', () => {
    const r = buildWeeklyRecap({
      ...base,
      compliance: compliance({ completed: 1, missed: 4, actualMiles: 6 }),
    })
    const all = `${r.headline} ${r.paragraphs.join(' ')}`
    expect(all).toMatch(/6 of 32 planned miles/)
    expect(all).not.toMatch(/should have|failed|lazy|excuse|disappoint/i)
    expect(all).toMatch(/nothing to make up/i)
  })

  it('two consecutive short weeks offer a rebuild, one does not', () => {
    const short = compliance({ actualMiles: 12, completed: 2, missed: 3 })
    const two = buildWeeklyRecap({
      ...base, compliance: short, history: [compliance({ weekNum: 5, actualMiles: 10 })],
    })
    expect(two.suggestion).toMatch(/rebuilding the remainder/i)

    const one = buildWeeklyRecap({ ...base, compliance: short, history: [compliance({ weekNum: 5 })] })
    expect(one.suggestion).toBeUndefined()
  })

  it('reads zone discipline off measured sessions only', () => {
    const measured = buildWeeklyRecap({ ...base, compliance: compliance({ hrCompliance: 85 }) })
    expect(measured.paragraphs.join(' ')).toMatch(/85% time in the prescribed zones/)

    const unmeasured = buildWeeklyRecap({
      ...base, compliance: compliance({ hrCheckedWorkouts: 0, hrCompliance: 0 }),
    })
    expect(unmeasured.paragraphs.join(' ')).not.toMatch(/prescribed zones/)
    expect(unmeasured.stats.find(s => s.label === 'In zone')).toBeUndefined()
  })

  it('the digest hands the model numbers, not prose', () => {
    const r = buildWeeklyRecap({ ...base, compliance: compliance() })
    expect(r.digest).toContain('Week 6 of 16')
    expect(r.digest).toContain('5/5 sessions')
    expect(r.digest).toContain('31/32 mi')
  })

  it('the archived markdown carries the headline, the stats and the body', () => {
    const r = buildWeeklyRecap({ ...base, compliance: compliance() })
    const md = recapToMarkdown(r)
    expect(md).toContain(r.title)
    expect(md).toContain(r.headline)
    expect(md).toContain('Miles 31')
    for (const p of r.paragraphs) expect(md).toContain(p)
  })

  it('survives a week with nothing planned', () => {
    const r = buildWeeklyRecap({
      ...base,
      compliance: compliance({ totalWorkouts: 0, completed: 0, plannedMiles: 0, actualMiles: 0, hrCheckedWorkouts: 0 }),
    })
    expect(r.headline).toMatch(/quiet week/i)
    expect(r.paragraphs.length).toBeGreaterThan(0)
  })
})
