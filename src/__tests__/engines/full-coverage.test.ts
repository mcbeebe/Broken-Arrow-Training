/**
 * "Substantial → Full" coverage for the last two onboarding-logic weaknesses:
 *   #6  Hyrox blind spots — the engine now reads fitnessAnchor (run-day paces)
 *       and is honest about gym access (home substitutions + advisory).
 *   #12 Experience over-leverage — a self-reported level that clearly disagrees
 *       with measured weekly mileage now surfaces an honest advisory.
 */
import { describe, it, expect } from 'vitest'
import { assessFeasibility } from '../../engines/planGenerator/feasibility'
import { generateHyroxPlan } from '../../utils/planGenerator'
import type { OnboardingConfig } from '../../hooks/useOnboarding'

const TODAY = '2026-06-14'

// Clean method-based-running config: no goal, no anchor, no method passed — so
// the ONLY advisory that can fire is the experience/mileage one under test.
function runCfg(o: Partial<OnboardingConfig> = {}): OnboardingConfig {
  return {
    raceType: 'road', raceName: 'X', raceDate: '2026-10-18', raceDistance: 'marathon',
    experienceLevel: 'intermediate', trainingDaysPerWeek: 5, wearable: 'none',
    athleteName: 'T', age: 35, completedAt: '', ...o,
  }
}
const ids = (c: OnboardingConfig) => assessFeasibility(c, TODAY).map(a => a.id)
const advisory = (c: OnboardingConfig, id: string) => assessFeasibility(c, TODAY).find(a => a.id === id)

function hyroxCfg(o: Partial<OnboardingConfig> = {}): OnboardingConfig {
  return {
    raceType: 'hyrox', raceName: 'X', raceDate: '2026-10-18', raceDistance: undefined,
    experienceLevel: 'intermediate', trainingDaysPerWeek: 4, wearable: 'none',
    athleteName: 'T', age: 35, completedAt: '', ...o,
  }
}
const allDays = (plan: ReturnType<typeof generateHyroxPlan>) => plan.weeks.flatMap(w => w.days)

describe('#12 → Full: experience vs. measured mileage', () => {
  it('flags an over-claimed level (advanced @ 10 mi/wk) as a caution', () => {
    const c = runCfg({ experienceLevel: 'advanced', currentWeeklyMileage: 10 })
    expect(ids(c)).toContain('experience_mismatch')
    expect(advisory(c, 'experience_mismatch')?.severity).toBe('caution')
  })
  it('notes an under-claimed level (beginner @ 45 mi/wk) as info, not caution', () => {
    const c = runCfg({ experienceLevel: 'beginner', currentWeeklyMileage: 45 })
    expect(advisory(c, 'experience_mismatch')?.severity).toBe('info')
  })
  it('stays quiet when the stated level matches the mileage', () => {
    expect(ids(runCfg({ experienceLevel: 'intermediate', currentWeeklyMileage: 22 }))).not.toContain('experience_mismatch')
  })
  it('does not fire on a single-band (adjacent) gap', () => {
    // elite (idx 4) @ 30 mi/wk implies advanced (idx 3) — a 1-level gap, no noise.
    expect(ids(runCfg({ experienceLevel: 'elite', currentWeeklyMileage: 30 }))).not.toContain('experience_mismatch')
  })
  it('needs a measured mileage to compare against', () => {
    expect(ids(runCfg({ experienceLevel: 'advanced', currentWeeklyMileage: undefined }))).not.toContain('experience_mismatch')
  })
})

describe('#6 → Full: Hyrox anchors run paces to a tested effort', () => {
  it('shows /mi pace targets on run days when a recent race is given', () => {
    const plan = generateHyroxPlan(hyroxCfg({ fitnessAnchor: { type: 'race_10k', valueSeconds: 45 * 60 } }))
    expect(allDays(plan).some(d => /\/mi/.test(d.zone))).toBe(true)
  })
  it('stays heart-rate-only when there is no anchor', () => {
    const plan = generateHyroxPlan(hyroxCfg())
    expect(allDays(plan).some(d => /\/mi/.test(d.zone))).toBe(false)
  })
})

describe('#6 → Full: Hyrox is honest about gym access', () => {
  it('warns + substitutes when the athlete has no gym', () => {
    const plan = generateHyroxPlan(hyroxCfg({ equipmentAccess: ['treadmill'] }))
    expect((plan.advisories ?? []).some(a => a.id === 'hyrox_no_gym')).toBe(true)
    expect(allDays(plan).some(d => /No gym\?/.test(d.detail))).toBe(true)
  })
  it('does neither when the athlete has gym access', () => {
    const plan = generateHyroxPlan(hyroxCfg({ equipmentAccess: ['gym'] }))
    expect((plan.advisories ?? []).some(a => a.id === 'hyrox_no_gym')).toBe(false)
    expect(allDays(plan).some(d => /No gym\?/.test(d.detail))).toBe(false)
  })
})
