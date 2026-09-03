import { describe, it, expect, vi } from 'vitest'
import type { PlanQAFinding, PlanQAResult } from '../../engines/planQA/validatePlan'
import type { OnboardingConfig } from '../../hooks/useOnboarding'

/**
 * M2 — the QA-to-advisory wiring, in all three generator entrypoints.
 *
 * `validatePlan` is a pure linter; it changes nothing on its own. What
 * protects the athlete is the ONE LINE in each engine that turns its
 * findings into plan advisories. The audit deleted that line in each of the
 * three engines in turn and the whole suite still passed: every QA test
 * exercised the validator directly, and every generator test asserted on the
 * plan's weeks. A defective plan would have shipped in silence, exactly the
 * failure mode the gate exists to prevent.
 *
 * These tests stub the validator to return one known finding and assert the
 * finding reaches `plan.advisories`. Stubbing rather than engineering a
 * genuinely defective persona is deliberate: it makes the test about the
 * WIRING and nothing else, so it cannot start passing for an unrelated
 * reason (or stop passing when a persona is fixed).
 */

const SENTINEL: PlanQAFinding = {
  id: 'qa_wiring_sentinel',
  severity: 'error',
  title: 'Sentinel finding',
  detail: 'Injected by the QA-wiring test — if this is missing from the advisories, the engine dropped its findings on the floor.',
}
const STUB: PlanQAResult = {
  findings: [SENTINEL], errors: [SENTINEL], warnings: [], pass: false,
}

vi.mock('../../engines/planQA/validatePlan', async importOriginal => {
  const actual = await importOriginal<typeof import('../../engines/planQA/validatePlan')>()
  return { ...actual, validatePlan: vi.fn(() => STUB) }
})

// Imported AFTER the mock so each engine picks up the stub.
const { generateHyroxPlan } = await import('../../utils/planGenerator')
const { generatePlanFromMethod } = await import('../../engines/planGenerator/generatePlan')
const { generateGeneralFitnessPlan } = await import('../../engines/generalFitness/index')
const { getMethodById } = await import('../../data/methods')

const TODAY = '2026-09-07'

const base = {
  athleteName: 'X', age: 35, sex: 'male' as const, wearable: 'garmin' as const,
  experienceLevel: 'intermediate' as const, trainingDaysPerWeek: 5,
  longRunDay: 'Saturday', equipmentAccess: ['gym'], completedAt: '',
}

const hyroxConfig = { ...base, raceType: 'hyrox', raceName: 'Hyrox Test City', raceDate: '2026-11-28' } as unknown as OnboardingConfig
const roadConfig = { ...base, raceType: 'road', raceName: 'Test Half', raceDate: '2026-11-28', raceDistance: 'half_marathon', maxHR: 185, selectedMethodId: 'daniels' } as unknown as OnboardingConfig
const gfConfig = { ...base, raceType: 'general', generalGoal: 'stay_healthy' } as unknown as OnboardingConfig

describe('M2 — every generator surfaces its QA findings as advisories', () => {
  it('the Hyrox engine (generateHyroxPlan)', () => {
    const plan = generateHyroxPlan(hyroxConfig, TODAY)
    expect(plan.advisories?.map(a => a.id) ?? []).toContain(SENTINEL.id)
  })

  it('the running engine (generatePlanFromMethod)', () => {
    const method = getMethodById('daniels')!
    const plan = generatePlanFromMethod(method, roadConfig, TODAY)
    expect(plan.advisories?.map(a => a.id) ?? []).toContain(SENTINEL.id)
  })

  it('the general-fitness engine (generateGeneralFitnessPlan)', () => {
    const plan = generateGeneralFitnessPlan(gfConfig, TODAY)
    expect(plan.advisories?.map(a => a.id) ?? []).toContain(SENTINEL.id)
  })

  it('an ERROR finding arrives as a CRITICAL advisory, not a soft caution', () => {
    // The severity mapping is what makes the difference visible to the
    // athlete; a wiring that flattened everything to 'info' would be the
    // same defect wearing a nicer face.
    for (const plan of [
      generateHyroxPlan(hyroxConfig, TODAY),
      generatePlanFromMethod(getMethodById('daniels')!, roadConfig, TODAY),
      generateGeneralFitnessPlan(gfConfig, TODAY),
    ]) {
      const adv = plan.advisories?.find(a => a.id === SENTINEL.id)
      expect(adv?.severity).toBe('critical')
      expect(adv?.detail).toContain('dropped its findings on the floor')
    }
  })
})
