/**
 * P2 — race intelligence: structured race profile (exact distance + vert)
 * unlocks the terrain/descent engines, finish-time-aware long-run sizing,
 * grade-adjusted durations, and terrain-aware method selection.
 * The reference scenario is the 2026-08-16 review: "Oakland Hills" entered
 * as a road-half lookalike got a flat 13.1 mi plan with an 88-min longest
 * run for a 2:15-3:00 mountain race.
 */
import { describe, it, expect } from 'vitest'
import { generatePlanFromMethod } from '../../../engines/planGenerator/generatePlan'
import { inferTerrain, inputsFromOnboarding } from '../../../engines/planGenerator/methodSelection'
import { validatePlan } from '../../../engines/planQA/validatePlan'
import { getMethodById } from '../../../data/methods'
import type { OnboardingConfig } from '../../../hooks/useOnboarding'

const TODAY = '2026-08-16'
const roche = () => getMethodById('roche_swap')!

function mikeConfig(overrides: Partial<OnboardingConfig> = {}): OnboardingConfig {
  return {
    raceType: 'trail',
    raceName: 'Oakland Hills Trail Run',
    raceDate: '2026-10-24',
    raceDistance: 'half_marathon',
    experienceLevel: 'intermediate',
    trainingDaysPerWeek: 5,
    longRunDay: 'Sunday',
    wearable: 'garmin',
    athleteName: 'Mike',
    age: 45,
    maxHR: 200,
    fitnessAnchor: { type: 'easy_pace', valueSeconds: 9 * 60 + 30 },
    completedAt: '',
    ...overrides,
  }
}

const structured = () => mikeConfig({ raceDistanceMiles: 13.3, elevationGainFt: 2900 })

const parseTimeHi = (t: string | undefined): number => {
  if (!t) return 0
  const m = t.match(/(?:\d+\s*[–-]\s*)?(\d+)\s*min/)
  return m ? parseInt(m[1], 10) : 0
}

describe('P2.1 — structured race inputs reach the engine', () => {
  it('exact distance overrides the enum snap (13.3, not 13.1)', () => {
    const plan = generatePlanFromMethod(roche(), structured(), TODAY)
    expect(plan.race.distanceMiles).toBe(13.3)
  })

  it('structured vert makes the plan climby: vert targets and descent work appear', () => {
    const plan = generatePlanFromMethod(roche(), structured(), TODAY)
    expect(plan.race.elevationGainFt).toBe(2900)
    const text = plan.weeks.flatMap(w => w.days.map(d => `${d.workout} ${d.detail}`)).join('\n')
    expect(text).toMatch(/ft gain/)
    expect(text).toMatch(/downhill|descen/i)
    // And the QA gate agrees: no vert-specificity error.
    expect(validatePlan(plan).errors.map(e => e.id)).toEqual([])
  })

  it('without the structured fields the plan is still flat (the v1 failure, unchanged)', () => {
    const plan = generatePlanFromMethod(roche(), mikeConfig(), TODAY)
    expect(plan.race.elevationGainFt).toBeUndefined()
  })
})

describe('P2.4 — finish-time-aware long run with grade-adjusted display', () => {
  it('the climby plan shows a longer peak long-run duration than the flat plan', () => {
    const flat = generatePlanFromMethod(roche(), mikeConfig(), TODAY)
    const climby = generatePlanFromMethod(roche(), structured(), TODAY)
    const peakLongMin = (p: typeof flat) =>
      Math.max(...p.weeks.flatMap(w => w.days.filter(d => d.type === 'long').map(d => parseTimeHi(d.time))))
    // Same miles take longer on 218 ft/mi ground — time on feet is honest.
    expect(peakLongMin(climby)).toBeGreaterThan(peakLongMin(flat))
  })

  it('peak long-run time on feet reaches at least half the predicted race duration', () => {
    const plan = generatePlanFromMethod(roche(), structured(), TODAY)
    // Predicted finish for 13.3 mi @ 9:30 easy anchor + 2900 ft ≈ 130-145 min.
    // The v1 plan peaked at 88 min; the QA gate's adequacy rule must be quiet.
    const findings = validatePlan(plan).findings.map(f => f.id)
    expect(findings).not.toContain('qa_long_run_adequacy')
    const peakLongMin = Math.max(
      ...plan.weeks.flatMap(w => w.days.filter(d => d.type === 'long').map(d => parseTimeHi(d.time))))
    expect(peakLongMin).toBeGreaterThanOrEqual(90)
  })
})

describe('P2 — season splice carries the race profile to non-anchor blocks', () => {
  it('an added race with structured vert gets climbing/descent work in its own block', async () => {
    const { planSeason } = await import('../../../engines/season/planSeason')
    const { spliceSeasonWeeks } = await import('../../../engines/season/spliceSeason')
    const { seasonRaceId } = await import('../../../engines/season')
    const { normalizeSeasonConfig } = await import('../../../utils/seasonConfig')

    // Anchor: a flat road 10k in September. Added race: the Oakland Hills
    // trail half with structured miles + vert (the v1 field case where the
    // added race's block was generated flat).
    const entered = mikeConfig({
      raceType: 'road',
      raceName: 'Flat City 10k',
      raceDate: '2026-09-13',
      raceDistance: '10k',
      goalMode: 'season',
      anchorIsPrimary: false,
      additionalRaces: [{
        name: 'Oakland Hills Trail Run', date: '2026-11-21', priority: 'A', isPrimary: true,
        distanceMiles: 13.3, elevationGainFt: 2900, format: 'trail' as const,
      }],
    } as Partial<OnboardingConfig>) as OnboardingConfig
    const normalized = { ...normalizeSeasonConfig(entered), selectedMethodId: 'roche_swap' }
    const base = generatePlanFromMethod(roche(), normalized, TODAY)
    const races = [
      { id: seasonRaceId(base.race), priority: 'B' as const, status: 'upcoming' as const, isPrimary: false, raceInfo: base.race },
      ...normalized.additionalRaces!.map(r => ({
        id: seasonRaceId({ name: r.name, date: r.date } as never),
        priority: r.priority, status: 'upcoming' as const, isPrimary: r.isPrimary,
        raceInfo: {
          name: r.name, date: r.date, startTime: '',
          distance: `${r.distanceMiles} mi`, distanceMiles: r.distanceMiles ?? 0,
          elevation: r.elevationGainFt ? `${r.elevationGainFt} ft` : '',
          ...(r.elevationGainFt ? { elevationGainFt: r.elevationGainFt } : {}),
          elevationRange: '', course: '', cutoff: '', landmarks: [], gear: [], nutrition: '',
          format: r.format,
        },
      })),
    ]
    const season = planSeason(races, TODAY)
    const weeks = spliceSeasonWeeks(base.weeks, season, normalized, TODAY)
    const trailBlockText = weeks
      .filter(w => /Oakland Hills/i.test(w.focus))
      .flatMap(w => w.days.map(d => `${d.workout} ${d.detail}`))
      .join('\n')
    expect(trailBlockText.length).toBeGreaterThan(0)
    expect(trailBlockText).toMatch(/ft gain|downhill|descen/i)
  })
})

describe('P2.5 — terrain-aware method selection', () => {
  it('vert density upgrades trail terrain to mountain_vertical above 240 ft/mi', () => {
    expect(inferTerrain('trail', 'half_marathon', 0)).toBe('trail_rolling')
    expect(inferTerrain('trail', 'half_marathon', 218)).toBe('trail_rolling')
    expect(inferTerrain('trail', 'half_marathon', 300)).toBe('mountain_vertical')
    expect(inferTerrain('road', 'half_marathon', 300)).toBe('road') // the radio still wins for road
  })

  it('inputsFromOnboarding derives density from the structured fields', () => {
    const colossal = inputsFromOnboarding(mikeConfig({ raceDistanceMiles: 13.3, elevationGainFt: 4000 }))
    expect(colossal?.terrain).toBe('mountain_vertical')
    const rolling = inputsFromOnboarding(structured()) // 218 ft/mi
    expect(rolling?.terrain).toBe('trail_rolling')
  })
})
