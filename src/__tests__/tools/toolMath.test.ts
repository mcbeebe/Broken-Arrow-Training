import { describe, it, expect } from 'vitest'
import {
  fuelingPlan,
  finishScenarios,
  vertMultiplier,
  formatHms,
  heatPlan,
  mileagePlan,
  MILEAGE_DISTANCES,
  MILEAGE_METHOD_ID,
} from '../../tools/toolMath'
import { carbTargetForRaceMiles } from '../../utils/fueling'
import { getMethodById } from '../../data/methods'
import { allocatePhaseWeeks, buildWeeklyMileage, capTaperBlocks, TAPER_WEEKS_CAP } from '../../engines/planGenerator/weekPlan'

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

describe('mileagePlan (initiative 003 PR 4c)', () => {
  const daniels = getMethodById(MILEAGE_METHOD_ID)!

  it('is the app’s own ramp: buildWeeklyMileage with the Daniels method, phase blocks and taper cap', () => {
    // Short plans included: that's where the generator's taper cap bites.
    for (const { id } of MILEAGE_DISTANCES) {
      for (const weeks of [6, 8, 10, 16]) {
        const blocks = allocatePhaseWeeks(daniels, weeks)
        const cap = TAPER_WEEKS_CAP[id]
        const expected = buildWeeklyMileage(daniels, weeks, cap != null ? capTaperBlocks(blocks, daniels, cap) : blocks, 20, {}, {
          raceDistance: id,
          maxTaperWeeks: cap,
          runningDays: 5,
        })
        const plan = mileagePlan(id, 20, weeks)!
        expect(plan.weeks.map(w => w.miles), `${id} ${weeks}`).toEqual(expected.map(w => w.totalMi))
        expect(plan.weeks.map(w => w.longRunMi), `${id} ${weeks}`).toEqual(expected.map(w => w.longRunMi))
        expect(plan.weeks.map(w => w.taper), `${id} ${weeks}`).toEqual(expected.map(w => w.isTaper))
      }
    }
  })

  it.each(MILEAGE_DISTANCES.map(d => d.id))('%s: no building week is more than 10% above the last full one (the footnote)', id => {
    for (const current of [5, 15, 30, 50]) {
      for (const weeks of [8, 12, 18, 24]) {
        const plan = mileagePlan(id, current, weeks)!
        let lastFull = current
        for (const w of plan.weeks) {
          if (w.taper) continue
          if (!w.easier) {
            // Shown to 0.1 mi, so allow each figure's rounding: the engine's own step is exactly ≤ 10%.
            expect(w.miles, `${id} ${current} mi ${weeks} wk, week ${w.week}`).toBeLessThanOrEqual((lastFull + 0.05) * 1.1 + 0.05)
            lastFull = w.miles
          }
        }
      }
    }
  })

  it('has an easier week every fourth week of the build, then a taper that steps down', () => {
    const plan = mileagePlan('marathon', 25, 18)!
    const build = plan.weeks.filter(w => !w.taper)
    const easier = build.filter(w => w.easier).map(w => w.week)
    expect(easier.length).toBeGreaterThan(0)
    for (const wk of easier) expect(wk % 4, `week ${wk}`).toBe(0)
    // ...and every fourth week before the peak is one of them.
    for (const w of build) if (w.week % 4 === 0 && w.week < plan.peakWeek) expect(w.easier, `week ${w.week}`).toBe(true)
    // Taper weeks are easier weeks too: the page draws them lighter.
    for (const w of plan.weeks.filter(w => w.taper)) expect(w.easier, `week ${w.week}`).toBe(true)
    const taper = plan.weeks.filter(w => w.taper).map(w => w.miles)
    expect(taper.length).toBeGreaterThan(0)
    for (let i = 1; i < taper.length; i++) expect(taper[i]).toBeLessThanOrEqual(taper[i - 1])
  })

  it('summarizes start, peak (and its week) and the longest run from the weeks', () => {
    const plan = mileagePlan('half_marathon', 20, 12)!
    expect(plan.startMi).toBe(plan.weeks[0].miles)
    expect(plan.peakMi).toBe(Math.max(...plan.weeks.map(w => w.miles)))
    expect(plan.weeks[plan.peakWeek - 1].miles).toBe(plan.peakMi)
    expect(plan.longestRunMi).toBe(Math.max(...plan.weeks.map(w => w.longRunMi)))
    expect(plan.weeks).toHaveLength(12)
  })

  it('caps a short race’s taper as the app does (a 6-week 5K tapers at most 2 weeks)', () => {
    expect(mileagePlan('5k', 20, 6)!.weeks.filter(w => w.taper).length).toBeLessThanOrEqual(TAPER_WEEKS_CAP['5k']!)
  })

  it('never opens more than one ramp step above what you run now', () => {
    for (const current of [5, 20, 40]) expect(mileagePlan('marathon', current, 16)!.startMi).toBeLessThanOrEqual(current * 1.1 + 0.05)
  })

  it('GUARD: bad input → null', () => {
    expect(mileagePlan('marathon', 0, 16)).toBeNull()
    expect(mileagePlan('marathon', -5, 16)).toBeNull()
    expect(mileagePlan('marathon', NaN, 16)).toBeNull()
    expect(mileagePlan('marathon', 20, 3)).toBeNull()
    expect(mileagePlan('marathon', 20, 25)).toBeNull()
    expect(mileagePlan('marathon', 20, 12.5)).toBeNull()
    expect(mileagePlan('marathon', 201, 12)).toBeNull()
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
