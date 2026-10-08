import { describe, it, expect } from 'vitest'
import {
  fuelingPlan,
  finishScenarios,
  vertMultiplier,
  formatHms,
  formatMiles,
  heatPlan,
  MAX_VDOT,
  parseFinishTime,
} from '../../tools/toolMath'
import { RACE_PACE_SEARCH } from '../../engines/planGenerator/feasibility'
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

  // Field bug (2026-10-08, live site): a half typed as "1:35" was read as 95 s,
  // giving "VDOT 17300.5" and a marathon pinned at the solver's 4:00/mi floor
  // (26 × 4:00 = 1:44:00) in all three cards.
  it('reads a half typed as "1:35" (95 s, faster than any human) as 1:35:00, like the app does', () => {
    const typed = finishScenarios(13.1, 95, 26, 100)!
    expect(typed).toEqual(finishScenarios(13.1, 95 * 60, 26, 100))
    expect(typed.recentSeconds).toBe(95 * 60)
    // Pinned values: the Daniels formula's own answer for this race.
    expect(typed.vdot).toBe(47.8)
    expect(formatHms(typed.flatSeconds)).toBe('3:16:08')
  })

  it('leaves a real time alone, fast or slow', () => {
    expect(finishScenarios(3.1, 19 * 60 + 30, 13.1, 0)!.recentSeconds).toBe(19 * 60 + 30)
    expect(finishScenarios(50, 11 * 3600, 100, 15000)!.recentSeconds).toBe(11 * 3600)
    expect(finishScenarios(26.2, 6.5 * 3600, 13.1, 0)!.recentSeconds).toBe(6.5 * 3600)
  })

  it('takes the world records: VDOT 85.6 at most, under MAX_VDOT', () => {
    for (const [miles, seconds] of [[3.10686, 755], [13.1094, 3450], [26.2188, 7235]]) {
      expect(finishScenarios(miles, seconds, 10, 0)!.vdot).toBeLessThanOrEqual(85.6)
    }
    expect(MAX_VDOT).toBe(86)
  })

  it('GUARD: refuses faster than any world record, e.g. a half marathon in kilometres typed as miles', () => {
    expect(finishScenarios(21.1, 95 * 60, 26.2, 0)).toBeNull() // VDOT 86.2
    expect(finishScenarios(13.1, 54 * 60, 26.2, 0)).toBeNull()
    expect(finishScenarios(13.1, 1, 26, 100)).toBeNull()
  })

  it('GUARD: refuses slower than 25:00/mi, mistyped or not, instead of pinning at the solver’s ceiling', () => {
    expect(finishScenarios(13.1, 830, 18, 5000)).toBeNull() // "1350" → 13:50 → 13:50:00
    expect(finishScenarios(13.1, 390, 18, 5000)).toBeNull() // "6:30" → 6:30:00
    expect(finishScenarios(3.1, 80 * 60, 13.1, 0)).toBeNull() // a 5K in 1:20:00
    // Walking pace even where the solver could still answer (a 23:32/mi mile).
    expect(finishScenarios(100, 26 * 60 * 100, 1, 0)).toBeNull()
  })

  it('GUARD: refuses an answer the solver can only pin at its 4:00/mi or 25:00/mi bound', () => {
    expect(finishScenarios(26.2, 2 * 3600 + 5 * 60, 1, 0)).toBeNull() // a 2:05 marathoner over 1 mi
    expect(finishScenarios(3.1, 75 * 60, 26.2, 0)).toBeNull() // a 24:11/mi 5K over a marathon
  })

  it('PROPERTY: every answer it gives is inside the solver’s range and under MAX_VDOT', () => {
    let answered = 0
    for (const recentMi of [1, 3.1, 6.2, 13.1, 26.2, 50, 100]) {
      for (const seconds of [60, 95, 240, 600, 1170, 1800, 3600, 5700, 9000, 14400, 36000, 108000, 200000]) {
        for (const targetMi of [1, 3.1, 13.1, 26.2, 100]) {
          const s = finishScenarios(recentMi, seconds, targetMi, 2000)
          if (!s) continue
          answered++
          const pace = s.flatSeconds / targetMi
          expect(pace, `${recentMi} mi in ${seconds} s → ${targetMi} mi`).toBeGreaterThan(RACE_PACE_SEARCH.fastest + 1)
          expect(pace).toBeLessThan(RACE_PACE_SEARCH.slowest - 1)
          expect(s.vdot).toBeLessThanOrEqual(MAX_VDOT)
          expect(s.recentSeconds / recentMi).toBeLessThanOrEqual(RACE_PACE_SEARCH.slowest)
        }
      }
    }
    expect(answered).toBeGreaterThan(50)
  })

  it('GUARD: an emptied field (NaN) → null, never NaN cards', () => {
    expect(finishScenarios(NaN, 5700, 26, 100)).toBeNull()
    expect(finishScenarios(13.1, NaN, 26, 100)).toBeNull()
    expect(finishScenarios(13.1, 5700, NaN, 100)).toBeNull()
    expect(finishScenarios(13.1, 5700, 26, NaN)).toBeNull()
    expect(finishScenarios(13.1, Infinity, 26, 100)).toBeNull()
  })

  it('parseFinishTime: the app’s forms, plus decimal seconds and a trailing colon', () => {
    expect(parseFinishTime('1:35:00')).toBe(5700)
    expect(parseFinishTime(' 1:35 ')).toBe(95)
    expect(parseFinishTime('13500')).toBe(5700)
    expect(parseFinishTime('19:30.4')).toBeCloseTo(1170.4, 5)
    expect(parseFinishTime('1:35:22.45')).toBeCloseTo(5722.45, 5)
    expect(parseFinishTime('19:30,4')).toBeCloseTo(1170.4, 5)
    expect(parseFinishTime('1:35:')).toBe(95)
    for (const bad of ['', '1', '1:', '13.1', 'fast', '1:35:00:00', '1.5.2', ':35', '-1:35']) {
      expect(parseFinishTime(bad), bad).toBeNull()
    }
  })

  it('formatMiles shows miles as a number, not as typed', () => {
    expect(formatMiles(13.1)).toBe('13.1')
    expect(formatMiles(parseFloat('013.10'))).toBe('13.1')
    expect(formatMiles(parseFloat('1e1'))).toBe('10')
    expect(formatMiles(26.21875)).toBe('26.22')
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
