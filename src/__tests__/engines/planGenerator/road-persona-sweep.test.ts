/**
 * R2 — the road/trail persona sweep as a PERMANENT CI gate.
 *
 * The Hyrox path has had this since P5 (40 plans, zero validator errors,
 * five defect classes caught on first run); the road path — 9 methods ×
 * distances × runways, a far larger surface — had nothing, which is why
 * Jim found the volume cliffs in production. Twelve personas spanning
 * ages 24–79, first-timer→elite, 3–7 days/week, anchors, injuries,
 * menopause context, and no-gym setups regenerate across every suited
 * method×distance pairing at two runways, plus two multi-race seasons.
 * ZERO validator errors required, with the generating method's authored
 * invariants active (methodId).
 *
 * If a change makes this fail, the plan is wrong — not the gate. Fix the
 * generator or (with justification) the tolerance, never the persona.
 */
import { describe, it, expect } from 'vitest'
import { generatePlanFromMethod } from '../../../engines/planGenerator/generatePlan'
import { getMethodById } from '../../../data/methods'
import { bestMethodForDistance } from '../../../engines/planGenerator/methodSelection'
import { planSeason } from '../../../engines/season/planSeason'
import { spliceSeasonWeeks } from '../../../engines/season/spliceSeason'
import { validatePlan } from '../../../engines/planQA/validatePlan'
import type { OnboardingConfig, RaceDistance } from '../../../hooks/useOnboarding'
import type { RaceInfo, SeasonRace } from '../../../types'

const TODAY = '2026-08-17' // a Monday

/** The Saturday ending week N (week 1 = the current week). */
function satAfterWeeks(n: number): string {
  const d = new Date('2026-08-22T12:00:00') // Saturday of week 1
  d.setDate(d.getDate() + (n - 1) * 7)
  return d.toISOString().slice(0, 10)
}

const DIST_MILES: Record<string, number> = { '5k': 3.1, '10k': 6.2, half_marathon: 13.1, marathon: 26.2, '50k': 31.1 }

interface Persona {
  label: string
  methodId: string
  distance: RaceDistance
  runways: [number, number]
  cfg: Partial<OnboardingConfig>
}

const PERSONAS: Persona[] = [
  { label: 'Ava 24F first_timer 3d 5k daniels', methodId: 'daniels', distance: '5k', runways: [8, 16],
    cfg: { athleteName: 'Ava', age: 24, sex: 'female', experienceLevel: 'first_timer', trainingDaysPerWeek: 3 } },
  { label: 'Ben 35M beginner 4d 10k higdon easy-pace', methodId: 'higdon', distance: '10k', runways: [8, 16],
    cfg: { athleteName: 'Ben', age: 35, sex: 'male', experienceLevel: 'beginner', trainingDaysPerWeek: 4, fitnessAnchor: { type: 'easy_pace', valueSeconds: 630 } } },
  { label: 'Carmen 41F intermediate 5d half pfitzinger 10k-anchor', methodId: 'pfitzinger', distance: 'half_marathon', runways: [10, 16],
    cfg: { athleteName: 'Carmen', age: 41, sex: 'female', experienceLevel: 'intermediate', trainingDaysPerWeek: 5, strengthDaysPerWeek: 1, equipmentAccess: ['gym'], fitnessAnchor: { type: 'race_10k', valueSeconds: 52 * 60 } } },
  { label: 'Dmitri 29M advanced 6d marathon hansons hm-anchor 45mi', methodId: 'hansons', distance: 'marathon', runways: [12, 18],
    cfg: { athleteName: 'Dmitri', age: 29, sex: 'male', experienceLevel: 'advanced', trainingDaysPerWeek: 6, currentWeeklyMileage: 45, fitnessAnchor: { type: 'race_hm', valueSeconds: 84 * 60 } } },
  { label: 'Elena 52F intermediate 4d half 80/20 peri knee-returning', methodId: 'fitzgerald_8020', distance: 'half_marathon', runways: [10, 16],
    cfg: { athleteName: 'Elena', age: 52, sex: 'female', experienceLevel: 'intermediate', trainingDaysPerWeek: 4, strengthDaysPerWeek: 1, equipmentAccess: ['gym'], menopauseStatus: 'perimenopause', injuryStatus: 'returning', injuryArea: 'knee' } },
  { label: 'Frank 61M beginner 3d 10k galloway', methodId: 'galloway', distance: '10k', runways: [8, 16],
    cfg: { athleteName: 'Frank', age: 61, sex: 'male', experienceLevel: 'beginner', trainingDaysPerWeek: 3 } },
  { label: 'Grace 33F elite 7d marathon daniels 5k-anchor 60mi', methodId: 'daniels', distance: 'marathon', runways: [12, 18],
    cfg: { athleteName: 'Grace', age: 33, sex: 'female', experienceLevel: 'elite', trainingDaysPerWeek: 7, currentWeeklyMileage: 60, strengthDaysPerWeek: 1, equipmentAccess: ['gym'], strengthExperience: 'experienced', fitnessAnchor: { type: 'race_5k', valueSeconds: 17 * 60 + 30 } } },
  { label: 'Hiro 45M intermediate 5d trail-half roche no-gym', methodId: 'roche_swap', distance: 'half_marathon', runways: [10, 16],
    cfg: { athleteName: 'Hiro', age: 45, sex: 'male', experienceLevel: 'intermediate', trainingDaysPerWeek: 5, strengthDaysPerWeek: 1, raceType: 'trail', elevationGainFt: 2500, fitnessAnchor: { type: 'easy_pace', valueSeconds: 540 } } },
  { label: 'Isla 27F first_timer 4d 5k higdon shin-current', methodId: 'higdon', distance: '5k', runways: [8, 16],
    cfg: { athleteName: 'Isla', age: 27, sex: 'female', experienceLevel: 'first_timer', trainingDaysPerWeek: 4, injuryStatus: 'current', injuryArea: 'shin' } },
  { label: 'Jim 79M beginner 6d 5k daniels (the originating case)', methodId: 'daniels', distance: '5k', runways: [7, 16],
    cfg: { athleteName: 'Jim', age: 79, sex: 'male', experienceLevel: 'beginner', trainingDaysPerWeek: 6, strengthDaysPerWeek: 1, equipmentAccess: ['gym'] } },
  { label: 'Kara 68F intermediate 5d half trainingpeaks recreational-lifter', methodId: 'trainingpeaks', distance: 'half_marathon', runways: [10, 16],
    cfg: { athleteName: 'Kara', age: 68, sex: 'female', experienceLevel: 'intermediate', trainingDaysPerWeek: 5, strengthDaysPerWeek: 1, equipmentAccess: ['gym'], strengthExperience: 'recreational', menopauseStatus: 'postmenopause' } },
  { label: 'Leo 55M advanced 6d trail-50k koop 40mi', methodId: 'koop', distance: '50k', runways: [14, 20],
    cfg: { athleteName: 'Leo', age: 55, sex: 'male', experienceLevel: 'advanced', trainingDaysPerWeek: 6, currentWeeklyMileage: 40, raceType: 'trail', elevationGainFt: 5000, equipmentAccess: ['hills', 'trails'] } },
]

function buildConfig(p: Persona, weeks: number): OnboardingConfig {
  return {
    raceType: 'road', raceName: `${p.cfg.athleteName}'s Race`, raceDate: satAfterWeeks(weeks),
    raceDistance: p.distance, raceDistanceMiles: DIST_MILES[p.distance],
    longRunDay: 'Saturday', wearable: 'garmin', completedAt: '',
    selectedMethodId: p.methodId,
    ...p.cfg,
  } as unknown as OnboardingConfig
}

describe('R2 — road persona sweep passes the QA gate (method invariants active)', () => {
  it.each(PERSONAS.map(p => [p.label, p] as const))('%s: zero validator errors at both runways', (_label, p) => {
    for (const weeks of p.runways) {
      const cfg = buildConfig(p, weeks)
      const plan = generatePlanFromMethod(getMethodById(p.methodId)!, cfg, TODAY)
      const qa = validatePlan({ ...plan, methodId: p.methodId })
      expect(
        qa.errors.map(e => `${weeks}wk ${e.id}@${e.weekNum}: ${e.detail}`),
        `${p.label} @ ${weeks} weeks`,
      ).toEqual([])
      // No suitability advisory — every sweep pairing is a suited one.
      expect(plan.advisories?.some(a => a.id === 'method_not_suited')).toBeFalsy()
    }
  })
})

describe('R2 — multi-race seasons pass the QA gate', () => {
  function raceInfo(name: string, date: string, distanceMiles: number): RaceInfo {
    return {
      name, date, startTime: '08:00', distance: `${distanceMiles} mi`, distanceMiles,
      elevation: '', elevationRange: '', course: '', cutoff: '', landmarks: [],
      gear: [], nutrition: '', format: 'road',
    }
  }

  const SEASONS: { label: string; persona: Persona; anchorWeeks: number; second: { distance: RaceDistance; weeks: number } }[] = [
    { label: 'Carmen: 10k → half', persona: PERSONAS[2], anchorWeeks: 8, second: { distance: 'half_marathon', weeks: 18 } },
    { label: 'Jim: 5k → 5k (the originating season)', persona: PERSONAS[9], anchorWeeks: 7, second: { distance: '5k', weeks: 16 } },
  ]

  it.each(SEASONS.map(s => [s.label, s] as const))('%s: zero validator errors on the spliced season', (_label, s) => {
    const cfg = {
      ...buildConfig(s.persona, s.anchorWeeks),
      raceDistance: s.persona.distance,
      goalMode: 'season',
    } as OnboardingConfig
    const anchor = generatePlanFromMethod(getMethodById(s.persona.methodId)!, cfg, TODAY)
    const races: SeasonRace[] = [
      { id: 'r1', priority: 'A', status: 'upcoming', raceInfo: raceInfo('Race One', satAfterWeeks(s.anchorWeeks), DIST_MILES[s.persona.distance]) },
      { id: 'r2', priority: 'A', status: 'upcoming', isPrimary: true, raceInfo: raceInfo('Race Two', satAfterWeeks(s.second.weeks), DIST_MILES[s.second.distance]) },
    ]
    const spliced = spliceSeasonWeeks(anchor.weeks, planSeason(races, TODAY), cfg, TODAY)
    expect(spliced.length).toBeGreaterThan(anchor.weeks.length)
    const qa = validatePlan({ ...anchor, weeks: spliced })
    expect(qa.errors.map(e => `${e.id}@${e.weekNum}: ${e.detail}`)).toEqual([])
  })
})

describe('R2 — suitability gate', () => {
  it('bestMethodForDistance never returns a NOT_SUITED method', () => {
    for (const d of ['5k', '10k', 'half_marathon', 'marathon', '50k'] as RaceDistance[]) {
      const m = bestMethodForDistance(d)
      expect(m.applicability?.byDistance?.[d], `${d} → ${m.id}`).not.toBe('NOT_SUITED')
    }
    // 5K must never come back as Hansons or Koop (both NOT_SUITED).
    expect(['hansons', 'koop']).not.toContain(bestMethodForDistance('5k').id)
  })

  it('generating a NOT_SUITED pairing raises a critical advisory naming a better method', () => {
    const cfg = buildConfig({ ...PERSONAS[3], methodId: 'hansons', distance: '5k', runways: [8, 16] } as Persona, 12)
    const plan = generatePlanFromMethod(getMethodById('hansons')!, { ...cfg, raceDistance: '5k', raceDistanceMiles: 3.1 } as OnboardingConfig, TODAY)
    const adv = plan.advisories?.find(a => a.id === 'method_not_suited')
    expect(adv?.severity).toBe('critical')
    expect(adv?.suggestion).toMatch(/Switch to/)
    expect(adv?.suggestion).not.toMatch(/Hansons/)
  })
})
