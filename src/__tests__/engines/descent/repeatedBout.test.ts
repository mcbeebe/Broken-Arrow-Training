// PLAN-vs-CODE drift (PR-10, BA_Terrain_Descent_IT_Project_Plan_v1.0.md §PR-10):
//
// 1. Pure-function input. Plan signatures `repeatedBoutProtection(athlete,
//    today)` and `protectionFromBout(bout, today, athlete)` reference
//    AthleteProfile fields that don't exist (`eccentricBouts`,
//    `referenceDose`, `repeatedBoutTau`, `repeatedBoutMaxProtection`).
//    We pass an explicit input object: `{ today, bouts, referenceDose?,
//    maxProtection? }` for state, and `{ bout, today, ... }` for the
//    per-bout helper.
// 2. `tau` parameter dropped. Plan pseudocode declares it but never uses
//    it — the triangular curve `max(0, 1 - |d-7|/7)` has no tau term.
//    Cutting dead weight.
// 3. `referenceDose` defaults to 100 AU (anchored to spec §8.5's "≈110
//    AU" BA Skyrace dose). `maxProtection` defaults to 0.45 per Hyldahl
//    2017 mean. Both are T4 calibration knobs — defaults are reasonable
//    starting points; callers can override.
// 4. `peakAt` is populated with the date of the bout that produced the
//    peak protection. Plan declares the field optional but doesn't set
//    it; we set it when protection > 0 so downstream UI can label
//    "protected by your run on April 23".

import { describe, it, expect } from 'vitest'

import {
  protectionFromBout,
  repeatedBoutProtection,
  REPEATED_BOUT_DEFAULT_REFERENCE_DOSE,
  REPEATED_BOUT_DEFAULT_MAX_PROTECTION,
} from '../../../engines/descent/repeatedBout'
import type { EccentricBoutRecord, RepeatedBoutState } from '../../../types'

const TODAY = new Date('2026-05-01T12:00:00Z')

/** Build a bout dated `daysAgo` days before TODAY. */
function boutDaysAgo(daysAgo: number, doseAU = 110): EccentricBoutRecord {
  const d = new Date(TODAY)
  d.setUTCDate(d.getUTCDate() - daysAgo)
  return { date: d.toISOString().slice(0, 10), doseAU }
}

describe('protectionFromBout (PR-10)', () => {
  describe('triangular curve over [0, 14] days', () => {
    it('d=0 (today\'s bout) → protection 0', () => {
      const bout = boutDaysAgo(0)
      expect(protectionFromBout({ bout, today: TODAY })).toBe(0)
    })

    it('d=7 (peak) → protection = maxP × strength', () => {
      const bout = boutDaysAgo(7, 110)
      const expected = REPEATED_BOUT_DEFAULT_MAX_PROTECTION * 1
      expect(protectionFromBout({ bout, today: TODAY })).toBeCloseTo(expected, 6)
    })

    it('d=14 → protection 0 (window edge)', () => {
      const bout = boutDaysAgo(14)
      expect(protectionFromBout({ bout, today: TODAY })).toBe(0)
    })

    it('d=15 → protection 0 (out of window)', () => {
      const bout = boutDaysAgo(15)
      expect(protectionFromBout({ bout, today: TODAY })).toBe(0)
    })

    it('d=4 → ramps linearly toward peak', () => {
      const bout = boutDaysAgo(4, 110)
      // (1 - |4-7|/7) = 4/7
      const expected = REPEATED_BOUT_DEFAULT_MAX_PROTECTION * 1 * (4 / 7)
      expect(protectionFromBout({ bout, today: TODAY })).toBeCloseTo(expected, 6)
    })

    it('d=10 → decays linearly past peak', () => {
      const bout = boutDaysAgo(10, 110)
      // (1 - |10-7|/7) = 4/7
      const expected = REPEATED_BOUT_DEFAULT_MAX_PROTECTION * 1 * (4 / 7)
      expect(protectionFromBout({ bout, today: TODAY })).toBeCloseTo(expected, 6)
    })

    it('future bout (d<0) → protection 0', () => {
      const bout = boutDaysAgo(-3) // 3 days in the future
      expect(protectionFromBout({ bout, today: TODAY })).toBe(0)
    })
  })

  describe('strength scales with dose / referenceDose, capped at 1', () => {
    it('dose = referenceDose → strength = 1 (full protection)', () => {
      const bout = boutDaysAgo(7, 100) // matches default referenceDose
      expect(protectionFromBout({ bout, today: TODAY })).toBeCloseTo(0.45, 6)
    })

    it('dose = 50, referenceDose = 100 → strength = 0.5', () => {
      const bout = boutDaysAgo(7, 50)
      expect(protectionFromBout({ bout, today: TODAY })).toBeCloseTo(0.45 * 0.5, 6)
    })

    it('dose = 200, referenceDose = 100 → strength clamps to 1', () => {
      const bout = boutDaysAgo(7, 200)
      expect(protectionFromBout({ bout, today: TODAY })).toBeCloseTo(0.45, 6)
    })

    it('custom referenceDose works', () => {
      const bout = boutDaysAgo(7, 60)
      // strength = min(1, 60/120) = 0.5
      expect(protectionFromBout({ bout, today: TODAY, referenceDose: 120 })).toBeCloseTo(0.45 * 0.5, 6)
    })

    it('custom maxProtection works', () => {
      const bout = boutDaysAgo(7, 200)
      expect(protectionFromBout({ bout, today: TODAY, maxProtection: 0.6 })).toBeCloseTo(0.6, 6)
    })
  })

  describe('exposed defaults', () => {
    it('REPEATED_BOUT_DEFAULT_REFERENCE_DOSE = 100 (anchored to spec §8.5 ≈110 AU)', () => {
      expect(REPEATED_BOUT_DEFAULT_REFERENCE_DOSE).toBe(100)
    })

    it('REPEATED_BOUT_DEFAULT_MAX_PROTECTION = 0.45 (Hyldahl 2017 mean)', () => {
      expect(REPEATED_BOUT_DEFAULT_MAX_PROTECTION).toBe(0.45)
    })
  })
})

describe('repeatedBoutProtection (PR-10)', () => {
  describe('AC1: bout 7 days ago → protectionFactor === maxP × min(1, dose/ref)', () => {
    it('bout doseAU=110 (above ref 100) → 0.45', () => {
      const state: RepeatedBoutState = repeatedBoutProtection({
        today: TODAY,
        bouts: [boutDaysAgo(7, 110)],
      })
      expect(state.protectionFactor).toBeCloseTo(0.45, 6)
    })

    it('bout doseAU=50 → 0.45 × 0.5 = 0.225', () => {
      const state = repeatedBoutProtection({
        today: TODAY,
        bouts: [boutDaysAgo(7, 50)],
      })
      expect(state.protectionFactor).toBeCloseTo(0.225, 6)
    })
  })

  describe('AC2: bout 15 days ago → protectionFactor === 0', () => {
    it('out of 14-day window', () => {
      const state = repeatedBoutProtection({
        today: TODAY,
        bouts: [boutDaysAgo(15, 110)],
      })
      expect(state.protectionFactor).toBe(0)
      expect(state.recentBouts).toHaveLength(0)
    })
  })

  describe('AC3: multiple bouts → max protection (not sum)', () => {
    it('one strong (d=7, dose 110), one weak (d=3, dose 50)', () => {
      const strong = boutDaysAgo(7, 110)
      const weak = boutDaysAgo(3, 50)
      const state = repeatedBoutProtection({
        today: TODAY,
        bouts: [strong, weak],
      })
      // Strong bout: 0.45 × 1 × 1 = 0.45
      // Weak bout: 0.45 × 0.5 × (3/7) ≈ 0.096
      // Max is 0.45, not 0.546.
      expect(state.protectionFactor).toBeCloseTo(0.45, 6)
      expect(state.recentBouts).toHaveLength(2)
    })

    it('peakAt names the date of the strongest bout', () => {
      const strong = boutDaysAgo(7, 110)
      const weak = boutDaysAgo(3, 50)
      const state = repeatedBoutProtection({
        today: TODAY,
        bouts: [strong, weak],
      })
      expect(state.peakAt).toBe(strong.date)
    })

    it('peakAt is undefined when protection is zero', () => {
      const state = repeatedBoutProtection({
        today: TODAY,
        bouts: [boutDaysAgo(15, 110)],
      })
      expect(state.protectionFactor).toBe(0)
      expect(state.peakAt).toBeUndefined()
    })
  })

  describe('recentBouts filtering', () => {
    it('keeps bouts in the [0, 14] window, drops the rest', () => {
      const state = repeatedBoutProtection({
        today: TODAY,
        bouts: [
          boutDaysAgo(0),    // edge: keep
          boutDaysAgo(5),    // keep
          boutDaysAgo(14),   // edge: keep
          boutDaysAgo(15),   // drop
          boutDaysAgo(30),   // drop
          boutDaysAgo(-1),   // future → drop
        ],
      })
      expect(state.recentBouts).toHaveLength(3)
    })
  })

  describe('empty / null cases', () => {
    it('no bouts → zero protection', () => {
      const state = repeatedBoutProtection({ today: TODAY, bouts: [] })
      expect(state.protectionFactor).toBe(0)
      expect(state.recentBouts).toEqual([])
      expect(state.peakAt).toBeUndefined()
    })
  })

  describe('Hyldahl 2017 figure-3 sanity check', () => {
    it('protection rises from 0 (d=0) to peak (d=7) and back to 0 (d=14)', () => {
      const samples: number[] = []
      for (let d = 0; d <= 14; d++) {
        const state = repeatedBoutProtection({
          today: TODAY,
          bouts: [boutDaysAgo(d, 110)],
        })
        samples.push(state.protectionFactor)
      }
      expect(samples[0]).toBe(0)
      expect(samples[14]).toBe(0)
      expect(samples[7]).toBeCloseTo(0.45, 6)
      // Strict monotonicity on each side of the peak.
      for (let i = 1; i <= 7; i++) expect(samples[i]).toBeGreaterThan(samples[i - 1])
      for (let i = 8; i <= 14; i++) expect(samples[i]).toBeLessThan(samples[i - 1])
    })
  })
})
