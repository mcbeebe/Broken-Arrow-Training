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
    // The personalization survives: weak-station extra work + sled note, and
    // P3 loads render from the division spec ("@ 152 kg", "@ 6 kg to 3.0 m").
    expect(circuit!.detail).toMatch(/extra set/)
    expect(circuit!.detail).toMatch(/@ 152 kg/)
    expect(circuit!.detail).toMatch(/Wall balls \d+ @ 6 kg to 3.0 m/)
  })

  it('long run + station finisher stays sentence-form (no " · ") so the Hyrox narrative renders', () => {
    const finisher = days.find(d => d.workout === 'Long run + station finisher')
    expect(finisher, 'no station-finisher long run found').toBeDefined()
    expect(finisher!.detail).not.toContain(' · ')
    expect(finisher!.detail).toMatch(/no break between run and stations/i)
  })

  it('the full race simulation is placed by race proximity with race-order framing (P3)', () => {
    // P3: simulations are scheduled by date arithmetic (10-17 days out),
    // not phase membership — the v1 phase-gated sim was unreachable on
    // clamped runways.
    const sim = days.find(d => /full race simulation/i.test(d.workout))
    expect(sim, 'no full race simulation found').toBeDefined()
    expect(sim!.detail).toMatch(/race order/)
    expect(sim!.detail).toMatch(/at full race spec/)
    // Compromised running exists as its own weekly session type now.
    const compromised = days.find(d => d.workout === 'Compromised running')
    expect(compromised, 'no compromised-running session found').toBeDefined()
    expect(compromised!.detail).toMatch(/no break between run and station/i)
  })
})

describe('cross-training rotation + structured intervals', () => {
  it('easy days rotate through the athlete\'s selected cross modes', () => {
    const plan = generateHyroxPlan(
      { ...config, trainingDaysPerWeek: 6, crossTrainingModes: ['cycling', 'swimming'] } as OnboardingConfig,
      '2026-08-03',
    )
    const crossDays = plan.weeks.flatMap(w => w.days).filter(d => d.workout.startsWith('Cross-train · '))
    expect(crossDays.length).toBeGreaterThan(0)
    const labels = new Set(crossDays.map(d => d.workout))
    expect(labels.has('Cross-train · Cycling')).toBe(true)
    expect(labels.has('Cross-train · Swimming')).toBe(true)
  })

  it('easy days keep the generic text when no modes were selected', () => {
    const plan = generateHyroxPlan({ ...config, trainingDaysPerWeek: 6 } as OnboardingConfig, '2026-08-03')
    const days = plan.weeks.flatMap(w => w.days)
    expect(days.some(d => d.workout === 'Easy run or cross-train')).toBe(true)
    expect(days.some(d => d.workout.startsWith('Cross-train · '))).toBe(false)
  })

  it('a 7-day request schedules 6 sessions + a mandatory rest day (P5 rest floor)', () => {
    const plan = generateHyroxPlan({ ...config, trainingDaysPerWeek: 7 } as OnboardingConfig, '2026-09-21')
    const fullWeek = plan.weeks[1]
    expect(fullWeek.days.filter(d => d.type !== 'rest').length).toBe(6)
    expect(fullWeek.days.filter(d => d.type === 'rest').length).toBeGreaterThanOrEqual(1)
    expect(plan.advisories?.some(a => a.id === 'hyrox_rest_floor')).toBe(true)
  })

  it('1km repeats carry a structured workout: warm-up, rep block with recovery, cool-down', () => {
    const plan = generateHyroxPlan(config, '2026-08-03')
    const repeats = plan.weeks.flatMap(w => w.days).find(d => d.workout === '1km repeats')!
    expect(repeats).toBeDefined()
    const pw = repeats.plannedWorkout!
    expect(pw).toBeDefined()
    expect(pw.segments.map(s => s.role)).toEqual(['warmup', 'main', 'cooldown'])
    const main = pw.segments[1]
    expect(main.reps).toBeGreaterThanOrEqual(4) // intermediate: 4 build / 6 peak
    expect(main.distance).toEqual({ value: 1, unit: 'km' })
    expect(main.recovery?.duration?.value).toBeGreaterThanOrEqual(60)
    // purpose/cues stay empty — the Hyrox coaching narrative owns those.
    expect(pw.purpose).toBe('')
    expect(pw.cues).toEqual([])
  })

  it('tempo runs carry a structured threshold block that progresses with the week (P3)', () => {
    // run_conditioning (the tempo slot) exists on 5+-day role sets.
    const plan = generateHyroxPlan({ ...config, trainingDaysPerWeek: 5 } as OnboardingConfig, '2026-08-03')
    const tempo = plan.weeks.flatMap(w => w.days).find(d => d.workout === 'Tempo run')!
    expect(tempo).toBeDefined()
    const main = tempo.plannedWorkout!.segments[1]
    // Duration interpolates 18 -> 30 min across the plan and the step must
    // agree with the advertised detail text (one duration per session).
    expect(main.duration!.unit).toBe('min')
    expect(main.duration!.value).toBeGreaterThanOrEqual(18)
    expect(main.duration!.value).toBeLessThanOrEqual(30)
    expect(tempo.detail).toContain(`${main.duration!.value} min @`)
    expect(main.paceZone).toBe('lactate_threshold')
  })

  it('station days stay text-based (no plannedWorkout)', () => {
    const plan = generateHyroxPlan(config, '2026-08-03')
    const station = plan.weeks.flatMap(w => w.days).find(d => /^Station circuit/.test(d.workout))!
    expect(station.plannedWorkout).toBeUndefined()
  })
})
