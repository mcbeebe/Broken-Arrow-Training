import { describe, it, expect } from 'vitest'
import {
  fuelingPlan,
  finishScenarios,
  vertMultiplier,
  formatHms,
  heatPlan,
} from '../../tools/toolMath'
import { carbTargetForRaceMiles } from '../../utils/fueling'

/**
 * G10 calculator tests. The core invariant: the free tools compute with the
 * SAME engines the app uses (no marketing-copy math), and the pages are
 * pure client — the last suite greps the tool sources for network/storage.
 */

describe('fuelingPlan', () => {
  it('uses the exact in-app carb tiers (shared function, not a copy)', () => {
    expect(fuelingPlan(31, 7)!.gPerHour).toBe(carbTargetForRaceMiles(31))
    expect(fuelingPlan(50, 12)!.gPerHour).toBe(90)
    expect(fuelingPlan(13.1, 2)!.gPerHour).toBe(45)
  })

  it('totals and gel-equivalents follow from g/hr × hours', () => {
    const p = fuelingPlan(31, 7)! // 31 mi = 50K → 75 g/hr tier
    expect(p.totalCarbsG).toBe(75 * 7)
    expect(p.gels).toBe(Math.ceil(525 / 25))
  })

  it('GUARD: short races get 0 g/hr (fuel afterward), bad input → null', () => {
    expect(fuelingPlan(6.2, 1)!.gPerHour).toBe(0)
    expect(fuelingPlan(0, 5)).toBeNull()
    expect(fuelingPlan(NaN, 5)).toBeNull()
  })
})

describe('vert-adjusted finish predictor', () => {
  it('vertMultiplier > 1 for climby courses, exactly 1 for flat', () => {
    expect(vertMultiplier(18, 5000)).toBeGreaterThan(1)
    expect(vertMultiplier(18, 0)).toBe(1)
    // More vert per mile costs more.
    expect(vertMultiplier(18, 8000)).toBeGreaterThan(vertMultiplier(18, 3000))
  })

  it('orders scenarios optimistic < realistic < conservative on a climby course', () => {
    const s = finishScenarios(13.1, 105 * 60, 18, 5000)!
    expect(s.optimisticSeconds).toBeLessThan(s.realisticSeconds)
    expect(s.realisticSeconds).toBeLessThan(s.conservativeSeconds)
    expect(s.realisticSeconds).toBeGreaterThan(s.flatSeconds)
    expect(s.vdot).toBeGreaterThan(30)
    expect(s.vdot).toBeLessThan(80)
  })

  it('GUARD: flat target → realistic equals the pure VDOT flat prediction', () => {
    const s = finishScenarios(13.1, 105 * 60, 26.2, 0)!
    expect(s.realisticSeconds).toBe(s.flatSeconds)
  })

  it('GUARD: nonsense input → null, never NaN scenarios', () => {
    expect(finishScenarios(0, 0, 18, 5000)).toBeNull()
    expect(finishScenarios(13.1, -5, 18, 5000)).toBeNull()
  })

  it('formatHms renders h:mm:ss and m:ss', () => {
    expect(formatHms(3661)).toBe('1:01:01')
    expect(formatHms(605)).toBe('10:05')
  })
})

describe('heatPlan', () => {
  it('hot race → acclimation timeline anchored 14 days out', () => {
    const p = heatPlan('2026-08-15', 90)!
    expect(p.hot).toBe(true)
    expect(p.steps[0].window).toContain('2026-08-01')
    expect(p.steps[0].action).toContain('7–10 consecutive days')
    expect(p.raceDayNote).toContain('90°F')
  })

  it('GUARD: mild race → no protocol, honest note instead', () => {
    const p = heatPlan('2026-08-15', 60)!
    expect(p.hot).toBe(false)
    expect(p.steps).toHaveLength(0)
  })

  it('GUARD: invalid date → null', () => {
    expect(heatPlan('not a date', 90)).toBeNull()
  })
})

describe('pure-client rule (plan §1-D6) — the guard that keeps G10 honest', () => {
  it('tool sources contain no fetch/XHR/storage/API references', () => {
    const sources = import.meta.glob('../../tools/*.{ts,tsx}', {
      query: '?raw', import: 'default', eager: true,
    }) as Record<string, string>
    expect(Object.keys(sources).length).toBeGreaterThanOrEqual(5)
    for (const [file, raw] of Object.entries(sources)) {
      for (const banned of ['fetch(', 'XMLHttpRequest', 'localStorage', 'sessionStorage', '/api/', 'coachApi']) {
        expect(raw.includes(banned), `${file} must not use ${banned}`).toBe(false)
      }
    }
  })
})
