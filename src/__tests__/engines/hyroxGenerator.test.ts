import { describe, it, expect } from 'vitest'
import type { OnboardingConfig } from '../../hooks/useOnboarding'
import { generateHyroxPlan } from '../../utils/planGenerator'
import { parseDayToDate } from '../../utils/planDates'

/**
 * Field P0s in the Hyrox generator:
 *  - weeks anchored to race weekday (Fri→Thu weeks) instead of Monday;
 *  - no race day emitted — the plan just stopped a week before the race;
 *  - fixed template recovery indices survived the runway clamp, landing a
 *    "volume drops 40%" week immediately before the taper/race;
 *  - string `miles` ("~7") double-rendered as "~~7 mi" in the UI.
 */

const config = {
  raceType: 'hyrox', raceName: 'Hyrox - Anaheim', raceDate: '2026-12-12',
  experienceLevel: 'intermediate', trainingDaysPerWeek: 4, wearable: 'none',
  athleteName: 'M', age: 45, maxHR: 178, completedAt: '',
} as OnboardingConfig

function dayIso(day: { day: string }, anchor: string): string | null {
  return parseDayToDate(day.day, undefined, anchor)
}

describe('generateHyroxPlan — Monday-anchored calendar with a real race week', () => {
  it('every week starts on a Monday and the final week ends ON race day', () => {
    const plan = generateHyroxPlan(config, '2026-11-04') // the field runway
    for (const w of plan.weeks) {
      const first = dayIso(w.days[0], '2026-12-12')!
      const dow = new Date(`${first}T12:00:00`).getDay()
      expect(dow, `week ${w.num} starts ${first} (getDay ${dow}), not a Monday`).toBe(1)
    }
    const lastWeek = plan.weeks[plan.weeks.length - 1]
    const lastDay = lastWeek.days[lastWeek.days.length - 1]
    expect(dayIso(lastDay, '2026-12-12')).toBe('2026-12-12')
  })

  it('emits exactly one RACE DAY card, on the race date, named for the race', () => {
    const plan = generateHyroxPlan(config, '2026-11-04')
    const raceDays = plan.weeks.flatMap(w => w.days).filter(d => d.type === 'race')
    expect(raceDays).toHaveLength(1)
    expect(raceDays[0].workout).toContain('RACE DAY — Hyrox - Anaheim')
    expect(dayIso(raceDays[0], '2026-12-12')).toBe('2026-12-12')
    // Nothing is scheduled after the race — post-race belongs to recovery.
    const allIsos = plan.weeks.flatMap(w => w.days).map(d => dayIso(d, '2026-12-12')!).filter(Boolean)
    expect(allIsos.every(iso => iso <= '2026-12-12')).toBe(true)
  })

  it('THE INVERSION: a clamped plan has no recovery week in the final 2 pre-race weeks', () => {
    const plan = generateHyroxPlan(config, '2026-11-04') // clamped to ~5-6 weeks
    expect(plan.weeks.some(w => /RECOVERY WEEK/.test(w.focus))).toBe(false) // ≤6 weeks → none at all
    expect(plan.advisories?.some(a => a.id === 'runway_short')).toBe(true)
  })

  it('an exact-runway plan keeps its template recovery weeks, none in the final 2 weeks', () => {
    const plan = generateHyroxPlan(config, '2026-09-21') // exactly the 12-week template
    expect(plan.weeks).toHaveLength(12)
    const recoveryNums = plan.weeks.filter(w => /RECOVERY WEEK/.test(w.focus)).map(w => w.num)
    expect(recoveryNums).toEqual([4, 8]) // intermediate template, unclamped
    const total = plan.weeks.length
    expect(recoveryNums.every(n => n <= total - 2)).toBe(true)
  })

  it('a LONG runway extends base weeks so the plan starts when the athlete does (capped +8)', () => {
    // Field bug: an Aug start + Dec race produced a plan that idled until
    // mid-September because the 12-week template back-counted from race day.
    const plan = generateHyroxPlan(config, '2026-06-01')
    expect(plan.weeks).toHaveLength(20) // 12 core + 8 extension cap
    // Recovery re-derived for the actual length — spaced, none in final 2.
    const recoveryNums = plan.weeks.filter(w => /RECOVERY WEEK/.test(w.focus)).map(w => w.num)
    expect(recoveryNums.length).toBeGreaterThan(2)
    expect(recoveryNums.every(n => n <= plan.weeks.length - 2)).toBe(true)
    // Race week still ends on race day.
    const lastWeek = plan.weeks[plan.weeks.length - 1]
    expect(dayIso(lastWeek.days[lastWeek.days.length - 1], '2026-12-12')).toBe('2026-12-12')
  })

  it('miles are numeric on every week (the "~~7 mi" bug)', () => {
    const plan = generateHyroxPlan(config, '2026-06-01')
    expect(plan.weeks.every(w => typeof w.miles === 'number')).toBe(true)
  })

  it('race week shakeout days are light — no quality work inside race week', () => {
    const plan = generateHyroxPlan(config, '2026-11-04')
    const raceWeek = plan.weeks[plan.weeks.length - 1]
    const beforeRace = raceWeek.days.filter(d => d.type !== 'race')
    expect(beforeRace.every(d => d.type === 'rest' || d.type === 'run' || d.type === 'cross')).toBe(true)
    expect(raceWeek.days.some(d => d.type === 'quality' || d.type === 'strength')).toBe(false)
  })

  it('P0 invariants hold: first day ≥ today across weekday starts', () => {
    for (const today of ['2026-11-01', '2026-11-02', '2026-11-04', '2026-11-08']) {
      const plan = generateHyroxPlan(config, today)
      const firstIso = dayIso(plan.weeks[0].days[0], today)!
      expect(firstIso >= today, `today=${today} produced first day ${firstIso}`).toBe(true)
    }
  })

  it('today falling inside race week still never schedules the past', () => {
    const plan = generateHyroxPlan(config, '2026-12-09') // Wed of race week
    const firstIso = dayIso(plan.weeks[0].days[0], '2026-12-09')!
    expect(firstIso >= '2026-12-09').toBe(true)
    const raceDays = plan.weeks.flatMap(w => w.days).filter(d => d.type === 'race')
    expect(raceDays).toHaveLength(1)
  })
})

describe('station-day details name the real stations', () => {
  // A long runway gives the plan a full build phase to inspect.
  const plan = generateHyroxPlan(config, '2026-08-03')
  const days = plan.weeks.flatMap(w => w.days)

  it('build-phase station circuits list race-order stations plus the load prescriptions', () => {
    const circuit = days.find(d => /^Station circuit \(\d+ stations\)$/.test(d.workout))
    expect(circuit, 'no build-phase station circuit found').toBeDefined()
    expect(circuit!.detail).toMatch(/SkiErg/)
    expect(circuit!.detail).toMatch(/Sled push/)
    expect(circuit!.detail).toMatch(/Sled pull/)
    expect(circuit!.detail).toMatch(/Burpee broad jumps/)
    // The personalization survives: weak-station extra work + sled note + wall-ball weight.
    expect(circuit!.detail).toMatch(/extra set/)
    expect(circuit!.detail).toMatch(/\(6 kg\)/)
  })

  it('long run + station finisher stays sentence-form (no " · ") so the Hyrox narrative renders', () => {
    const finisher = days.find(d => d.workout === 'Long run + station finisher')
    expect(finisher, 'no station-finisher long run found').toBeDefined()
    expect(finisher!.detail).not.toContain(' · ')
    expect(finisher!.detail).toMatch(/no break between run and stations/i)
  })

  it('peak simulation detail is fragment-form with race-order framing', () => {
    const sim = days.find(d => /^Simulation \(\d+ stations\)$/.test(d.workout))
    expect(sim, 'no peak simulation found').toBeDefined()
    expect(sim!.detail).toContain(' · ')
    expect(sim!.detail).toMatch(/race order/)
    expect(sim!.detail).toMatch(/roxzone/i)
  })
})
