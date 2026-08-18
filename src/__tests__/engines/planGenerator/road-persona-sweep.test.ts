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
import { TODAY, satAfterWeeks, DIST_MILES, PERSONAS, buildConfig, type Persona } from '../../helpers/roadPersonas'

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
