/**
 * P5 — the persona sweep as a permanent gate.
 *
 * The 2026-08 audit generated 10 varied personas × 4 runways and found
 * five defect classes (no rest day at 7 d/wk, no taper week, D-1
 * overload, header/step drift on quality days, estimated weekly totals).
 * This suite regenerates the same 40 plans on every CI run and requires
 * ZERO validator errors — plus targeted assertions for each P5 fix.
 */
import { describe, it, expect } from 'vitest'
import { generateHyroxPlan } from '../../../utils/planGenerator'
import { validatePlan } from '../../../engines/planQA/validatePlan'
import type { OnboardingConfig } from '../../../hooks/useOnboarding'

const TODAY = '2026-09-07' // a Monday
const RACE_BY_WEEKS: Record<number, string> = {
  4: '2026-10-03', 8: '2026-10-31', 12: '2026-11-28', 16: '2026-12-26', // Saturdays
}
const RUNWAYS = [4, 8, 12, 16]

const base = { raceType: 'hyrox' as const, raceName: 'Hyrox Test City', longRunDay: 'Saturday', wearable: 'garmin' as const, completedAt: '' }

const PERSONAS: (Partial<OnboardingConfig> & { label: string })[] = [
  { label: 'Ava 24F first_timer 3d no-gym no-anchor', athleteName: 'Ava', age: 24, sex: 'female', experienceLevel: 'first_timer', trainingDaysPerWeek: 3 },
  { label: 'Ben 35M beginner 4d gym easy-pace', athleteName: 'Ben', age: 35, sex: 'male', experienceLevel: 'beginner', trainingDaysPerWeek: 4, equipmentAccess: ['gym'], fitnessAnchor: { type: 'easy_pace', valueSeconds: 630 } },
  { label: 'Carmen 41F intermediate 5d gym 10k-anchor', athleteName: 'Carmen', age: 41, sex: 'female', experienceLevel: 'intermediate', trainingDaysPerWeek: 5, equipmentAccess: ['gym'], fitnessAnchor: { type: 'race_10k', valueSeconds: 52 * 60 }, weakStation: 'Sled Push' },
  { label: 'Dmitri 29M advanced 6d gym hm-anchor PRO', athleteName: 'Dmitri', age: 29, sex: 'male', experienceLevel: 'advanced', trainingDaysPerWeek: 6, equipmentAccess: ['gym'], fitnessAnchor: { type: 'race_hm', valueSeconds: 84 * 60 }, hyroxDivision: 'pro' },
  { label: 'Elena 52F intermediate 4d gym peri knee', athleteName: 'Elena', age: 52, sex: 'female', experienceLevel: 'intermediate', trainingDaysPerWeek: 4, equipmentAccess: ['gym'], menopauseStatus: 'perimenopause', injuryStatus: 'returning', injuryArea: 'knee' },
  { label: 'Frank 61M beginner 3d gym achilles', athleteName: 'Frank', age: 61, sex: 'male', experienceLevel: 'beginner', trainingDaysPerWeek: 3, equipmentAccess: ['gym'], injuryStatus: 'returning', injuryArea: 'achilles_calf' },
  { label: 'Grace 33F elite 7d gym PRO 5k-anchor', athleteName: 'Grace', age: 33, sex: 'female', experienceLevel: 'elite', trainingDaysPerWeek: 7, equipmentAccess: ['gym'], hyroxDivision: 'pro', fitnessAnchor: { type: 'race_5k', valueSeconds: 19 * 60 + 30 } },
  { label: 'Hiro 45M intermediate 5d NO-GYM', athleteName: 'Hiro', age: 45, sex: 'male', experienceLevel: 'intermediate', trainingDaysPerWeek: 5, fitnessAnchor: { type: 'easy_pace', valueSeconds: 540 } },
  { label: 'Isla 27F first_timer 4d gym shin-current', athleteName: 'Isla', age: 27, sex: 'female', experienceLevel: 'first_timer', trainingDaysPerWeek: 4, equipmentAccess: ['gym'], injuryStatus: 'current', injuryArea: 'shin' },
  { label: 'Jorge 38M advanced 5d gym cross-modes', athleteName: 'Jorge', age: 38, sex: 'male', experienceLevel: 'advanced', trainingDaysPerWeek: 5, equipmentAccess: ['gym'], crossTrainingModes: ['cycling', 'swimming'], crossTrainingDaysPerWeek: 1, weakStation: 'Wall Balls' },
]

const plan = (p: Partial<OnboardingConfig>, weeks: number) =>
  generateHyroxPlan({ ...base, ...p, raceDate: RACE_BY_WEEKS[weeks] } as unknown as OnboardingConfig, TODAY)

const parseTime = (t: string | undefined): number => {
  if (!t) return 0
  const m = t.match(/(\d+)(?:\s*[–-]\s*(\d+))?\s*min/)
  if (m) return (parseInt(m[1]) + parseInt(m[2] ?? m[1])) / 2
  const hr = t.match(/(\d+)\s*hr(?:\s*(\d+)\s*min)?/)
  return hr ? parseInt(hr[1]) * 60 + parseInt(hr[2] ?? '0') : 0
}

describe('P5 — the full persona sweep passes the QA gate', () => {
  it.each(PERSONAS.map(p => [p.label, p] as const))('%s: zero validator errors at every runway', (_label, p) => {
    for (const weeks of RUNWAYS) {
      const result = validatePlan(plan(p, weeks))
      expect(result.errors.map(e => `${weeks}wk ${e.id}: ${e.detail}`)).toEqual([])
    }
  })
})

describe('P5 fix-specific properties', () => {
  it('7 d/wk keeps a weekly rest day and says so', () => {
    const g = plan(PERSONAS[6], 12) // Grace, elite 7d
    for (const w of g.weeks.filter(w => w.days.length === 7)) {
      expect(w.days.some(d => d.type === 'rest'), `week ${w.num}`).toBe(true)
    }
    expect(g.advisories?.some(a => a.id === 'hyrox_rest_floor')).toBe(true)
  })

  it('the final full week is a genuine taper: lighter than the peak build week, no station finisher', () => {
    for (const persona of [PERSONAS[3], PERSONAS[6]]) { // 6d advanced, 7d elite
      const g = plan(persona, 12)
      const fullWeeks = g.weeks.filter(w => w.days.length === 7)
      const taper = fullWeeks[fullWeeks.length - 1]
      const weekMin = (w: typeof taper) => w.days.reduce((s, d) => s + parseTime(d.time), 0)
      const peak = Math.max(...fullWeeks.slice(0, -1).map(weekMin))
      expect(weekMin(taper), `${persona.label} taper vs peak`).toBeLessThan(peak * 0.85)
      expect(taper.days.some(d => /station finisher/.test(d.workout))).toBe(false)
    }
  })

  it('the day before the race is a ≤25 min shakeout at every level', () => {
    for (const persona of PERSONAS) {
      const g = plan(persona, 12)
      const days = g.weeks.flatMap(w => w.days)
      const raceIdx = days.findIndex(d => d.type === 'race')
      const before = days[raceIdx - 1]
      if (before && before.type !== 'rest') {
        expect(parseTime(before.time), `${persona.label} D-1 "${before.workout}"`).toBeLessThanOrEqual(25)
      }
    }
  })

  it('unanchored athletes get a week-1 pacing benchmark; anchored and injured do not', () => {
    const ava = plan(PERSONAS[0], 12)
    expect(ava.weeks.slice(0, 2).flatMap(w => w.days).some(d => /BENCHMARK/i.test(d.workout))).toBe(true)
    expect(ava.advisories?.some(a => a.id === 'zones_estimated' && a.severity === 'info')).toBe(true)
    const carmen = plan(PERSONAS[2], 12) // 10k anchor
    expect(carmen.weeks.flatMap(w => w.days).some(d => /BENCHMARK/i.test(d.workout))).toBe(false)
    const isla = plan(PERSONAS[8], 12) // current injury
    expect(isla.weeks.flatMap(w => w.days).some(d => /BENCHMARK/i.test(d.workout))).toBe(false)
    expect(isla.advisories?.some(a => a.id === 'zones_estimated' && a.severity === 'caution')).toBe(true)
  })

  it('wall-ball loads come from the division spec only — no stale level-template weights', () => {
    const jorge = plan(PERSONAS[9], 12) // advanced OPEN male: template used to say 9 kg
    const text = jorge.weeks.flatMap(w => w.days).map(d => d.detail).join('\n')
    expect(text).not.toMatch(/9 kg/)
    expect(text).toMatch(/6 kg to 3\.0 m/)
  })

  it('masters athletes recover on a tighter cadence, with the advisory', () => {
    const frank = plan(PERSONAS[5], 12) // 61
    const ben = plan(PERSONAS[1], 12) // 35
    const recoveries = (g: typeof frank) => g.weeks.filter(w => /RECOVERY WEEK/.test(w.focus)).length
    expect(recoveries(frank)).toBeGreaterThan(recoveries(ben))
    expect(frank.advisories?.some(a => a.id === 'masters_recovery')).toBe(true)
  })

  it('erg baselines become concrete race targets in the prescriptions', () => {
    const g = generateHyroxPlan({
      ...base, ...PERSONAS[2], raceDate: RACE_BY_WEEKS[12], skiErg1kSeconds: 250, row1kSeconds: 235,
    } as unknown as OnboardingConfig, TODAY)
    const text = g.weeks.flatMap(w => w.days).map(d => d.detail).join('\n')
    expect(text).toContain('SkiErg 1km baseline 4:10')
    expect(text).toContain('Row 1km baseline 3:55')
  })
})
