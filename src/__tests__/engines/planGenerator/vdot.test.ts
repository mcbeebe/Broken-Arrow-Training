/**
 * VDOT math and pace personalization tests.
 *
 * Cross-checks key values against Daniels' published tables and verifies the
 * paceTargets layer honors the fitnessAnchor captured in onboarding.
 */
import { describe, it, expect } from 'vitest'
import {
  vdotFromRace,
  paceSecPerMileFromVdot,
  paceBoundsForZone,
  FITNESS_ANCHOR_DISTANCES,
} from '../../../engines/planGenerator/vdot'
import { resolveAnchor, resolvePaces } from '../../../engines/planGenerator/paceTargets'
import { generatePlanFromMethod } from '../../../engines/planGenerator/generatePlan'

import type { TrainingMethod } from '../../../types/training-method'
import type { OnboardingConfig } from '../../../hooks/useOnboarding'

import danielsMethod from '../../../data/methods/daniels.json'
import koopMethod from '../../../data/methods/koop.json'
import pfitzingerMethod from '../../../data/methods/pfitzinger.json'

const daniels = danielsMethod as unknown as TrainingMethod
const koop = koopMethod as unknown as TrainingMethod
const pfitzinger = pfitzingerMethod as unknown as TrainingMethod

function cfg(overrides: Partial<OnboardingConfig> = {}): OnboardingConfig {
  return {
    raceType: 'trail',
    raceName: 'Test',
    raceDate: '2026-09-13',
    raceDistance: 'marathon',
    experienceLevel: 'intermediate',
    trainingDaysPerWeek: 5,
    wearable: 'none',
    athleteName: 'Test',
    age: 35,
    maxHR: 185,
    completedAt: '',
    ...overrides,
  }
}

describe('vdotFromRace', () => {
  it('20-min 5K → VDOT ≈ 50 (Daniels table)', () => {
    const vdot = vdotFromRace({ distanceMiles: 3.10686, timeSeconds: 20 * 60 })
    expect(vdot).toBeGreaterThan(48)
    expect(vdot).toBeLessThan(52)
  })

  it('faster 5K → higher VDOT', () => {
    const slow = vdotFromRace({ distanceMiles: 3.10686, timeSeconds: 24 * 60 })
    const fast = vdotFromRace({ distanceMiles: 3.10686, timeSeconds: 18 * 60 })
    expect(fast).toBeGreaterThan(slow)
  })

  it('3:30 marathon → VDOT ≈ 47 (Daniels table)', () => {
    const vdot = vdotFromRace({ distanceMiles: 26.21875, timeSeconds: 3 * 3600 + 30 * 60 })
    expect(vdot).toBeGreaterThan(44)
    expect(vdot).toBeLessThan(50)
  })

  it('returns 0 for degenerate inputs', () => {
    expect(vdotFromRace({ distanceMiles: 0, timeSeconds: 1000 })).toBe(0)
    expect(vdotFromRace({ distanceMiles: 5, timeSeconds: 0 })).toBe(0)
  })
})

describe('paceSecPerMileFromVdot', () => {
  it('VDOT 50 at E intensity (0.7) ≈ 8:30 /mi', () => {
    const pace = paceSecPerMileFromVdot(50, 0.7)
    expect(pace).toBeGreaterThan(8 * 60)
    expect(pace).toBeLessThan(9 * 60 + 30)
  })

  it('higher intensity → faster pace', () => {
    const easy = paceSecPerMileFromVdot(50, 0.70)
    const threshold = paceSecPerMileFromVdot(50, 0.88)
    expect(threshold).toBeLessThan(easy)
  })

  it('returns Infinity when the quadratic has no real solution', () => {
    // Absurdly negative VDOT → no real solution
    expect(paceSecPerMileFromVdot(-100, 0.7)).toBe(Infinity)
  })
})

describe('paceBoundsForZone', () => {
  it('returns slow ≥ fast for every canonical zone', () => {
    const zones = ['recovery', 'easy', 'marathon_pace', 'lactate_threshold', 'vo2max', 'speed'] as const
    for (const z of zones) {
      const b = paceBoundsForZone(50, z)
      expect(b).not.toBeNull()
      expect(b!.paceSecPerMileLow).toBeGreaterThanOrEqual(b!.paceSecPerMileHigh)
    }
  })

  it('VDOT 50 marathon pace ≈ 7:30 /mi (Daniels table)', () => {
    const b = paceBoundsForZone(50, 'marathon_pace')!
    expect(b.paceSecPerMileHigh).toBeGreaterThan(7 * 60)
    expect(b.paceSecPerMileLow).toBeLessThan(8 * 60 + 30)
  })

  it('returns null for zones without intensity mapping', () => {
    // No canonical zone is unmapped today, but the function guards against it.
    // (Synthetic key — TypeScript-as-cast for the test.)
    expect(paceBoundsForZone(50, 'nonexistent' as never)).toBeNull()
  })

  it('FITNESS_ANCHOR_DISTANCES has the four race anchors', () => {
    expect(FITNESS_ANCHOR_DISTANCES.race_5k).toBeCloseTo(3.107, 2)
    expect(FITNESS_ANCHOR_DISTANCES.race_10k).toBeCloseTo(6.214, 2)
    expect(FITNESS_ANCHOR_DISTANCES.race_hm).toBeCloseTo(13.109, 2)
    expect(FITNESS_ANCHOR_DISTANCES.race_marathon).toBeCloseTo(26.219, 2)
  })
})

describe('resolveAnchor — fitnessAnchor consumption', () => {
  it('uses user-supplied LTHR for LTHR-anchored methods', () => {
    const a = resolveAnchor(koop, cfg({
      fitnessAnchor: { type: 'lthr', bpm: 168 },
    }))
    expect(a.type).toBe('lthr_bpm')
    expect(a.value).toBe(168)
    expect(a.sourceNote).toMatch(/user-supplied/i)
  })

  it('falls back to estimated LTHR when no user LTHR is given', () => {
    const a = resolveAnchor(koop, cfg({ maxHR: 184 }))
    expect(a.type).toBe('lthr_bpm')
    expect(a.value).toBe(Math.round(184 * 0.92))
    expect(a.sourceNote).toMatch(/estimated/i)
  })

  it('computes VDOT for race-time methods when a 5K time is provided', () => {
    const a = resolveAnchor(daniels, cfg({
      fitnessAnchor: { type: 'race_5k', valueSeconds: 20 * 60 }, // 20-min 5K
    }))
    expect(a.type).toBe('recent_race_time')
    expect(a.value).toBeGreaterThan(45)
    expect(a.value).toBeLessThan(55)
    expect(a.sourceNote).toMatch(/VDOT/i)
  })

  it('computes VDOT from a marathon time too', () => {
    const a = resolveAnchor(daniels, cfg({
      fitnessAnchor: { type: 'race_marathon', valueSeconds: 3 * 3600 + 30 * 60 },
    }))
    expect(a.value).toBeGreaterThan(40)
    expect(a.value).toBeLessThan(55)
  })

  it('returns null anchor value when no race time is captured', () => {
    const a = resolveAnchor(daniels, cfg({ fitnessAnchor: undefined }))
    expect(a.value).toBeNull()
  })

  it('returns null anchor for self-reported easy pace on a race-time method', () => {
    // easy_pace isn't a race time so we can't compute VDOT — falls back.
    const a = resolveAnchor(daniels, cfg({
      fitnessAnchor: { type: 'easy_pace', valueSeconds: 540 },  // 9:00/mi
    }))
    expect(a.value).toBeNull()
  })
})

describe('resolvePaces — concrete pace bounds', () => {
  it('emits paceSecPerMile bounds for every zone when a race time is supplied', () => {
    const paces = resolvePaces(daniels, cfg({
      fitnessAnchor: { type: 'race_5k', valueSeconds: 21 * 60 + 30 },
    }))
    let pacedZones = 0
    for (const z of daniels.paceZones) {
      const t = paces.byZone[z.canonical]
      if (t?.paceSecPerMileLow != null && t.paceSecPerMileHigh != null) {
        pacedZones++
        // Slow end ≥ fast end (more seconds per mile)
        expect(t.paceSecPerMileLow).toBeGreaterThanOrEqual(t.paceSecPerMileHigh)
        expect(t.preferredMode).toBe('pace')
      }
    }
    expect(pacedZones).toBeGreaterThan(0)
  })

  it('emits HR bpm bounds for HR-anchored methods using user LTHR', () => {
    const paces = resolvePaces(koop, cfg({
      fitnessAnchor: { type: 'lthr', bpm: 170 },
    }))
    const easy = paces.byZone.easy
    expect(easy).toBeDefined()
    if (easy?.hrBpmLow != null && easy.hrBpmHigh != null) {
      // The easy zone HR range is configured around %LTHR — bounds should
      // be in a sensible region for LTHR=170 (typically 60-80% LTHR).
      expect(easy.hrBpmLow).toBeGreaterThan(100)
      expect(easy.hrBpmHigh).toBeLessThan(170)
    }
  })

  it('falls back to RPE-only when no anchor is available', () => {
    const paces = resolvePaces(daniels, cfg({ fitnessAnchor: undefined }))
    for (const z of daniels.paceZones) {
      const t = paces.byZone[z.canonical]
      expect(t).toBeDefined()
      expect(t!.paceSecPerMileLow).toBeUndefined()
    }
  })

  it('uses VDOT from race time for HR-anchored methods too (to set pace bounds)', () => {
    // Koop is HR-anchored, but if the user gave a race time we should still
    // be able to emit pace numbers alongside the bpm targets.
    const paces = resolvePaces(koop, cfg({
      fitnessAnchor: { type: 'race_10k', valueSeconds: 45 * 60 },
    }))
    const easy = paces.byZone.easy
    expect(easy).toBeDefined()
    expect(easy?.paceSecPerMileLow).toBeDefined()
    expect(easy?.hrBpmLow).toBeDefined() // HR still derived from estimated LTHR
  })

  it('uses easy_pace anchor when no race time is provided', () => {
    const paces = resolvePaces(daniels, cfg({
      fitnessAnchor: { type: 'easy_pace', valueSeconds: 540 },  // 9:00/mi
    }))
    const easy = paces.byZone.easy
    expect(easy?.paceSecPerMileLow).toBeDefined()
    expect(easy?.paceSecPerMileHigh).toBeDefined()
    // Faster zones should have shorter pace numbers than easy (i.e. quicker)
    const threshold = paces.byZone.lactate_threshold
    if (easy?.paceSecPerMileHigh && threshold?.paceSecPerMileHigh) {
      expect(threshold.paceSecPerMileHigh).toBeLessThan(easy.paceSecPerMileHigh)
    }
  })
})

describe('generatePlanFromMethod — end-to-end with fitnessAnchor', () => {
  it('attaches concrete pace targets to planned workouts when race time is set', () => {
    const plan = generatePlanFromMethod(daniels, cfg({
      fitnessAnchor: { type: 'race_5k', valueSeconds: 21 * 60 + 30 },
    }), '2026-05-11')
    let segmentsWithPace = 0
    for (const w of plan.weeks) {
      for (const d of w.days) {
        for (const seg of d.plannedWorkout?.segments ?? []) {
          if (seg.paceTarget?.paceSecPerMileLow != null) segmentsWithPace++
        }
      }
    }
    expect(segmentsWithPace).toBeGreaterThan(0)
  })

  it('plan day.zone string includes pace numbers when fitnessAnchor is a race time', () => {
    const plan = generatePlanFromMethod(daniels, cfg({
      fitnessAnchor: { type: 'race_5k', valueSeconds: 21 * 60 + 30 },
    }), '2026-05-11')
    const anyDayWithPace = plan.weeks.flatMap(w => w.days).find(d => /\d+:\d+.*\/mi/i.test(d.zone))
    expect(anyDayWithPace).toBeDefined()
  })

  it('plan day.zone falls back to bpm-only string when only LTHR is supplied', () => {
    const plan = generatePlanFromMethod(pfitzinger, cfg({
      fitnessAnchor: { type: 'lthr', bpm: 170 },
    }), '2026-05-11')
    const anyDayWithBpm = plan.weeks.flatMap(w => w.days).find(d => /\d+-\d+\s*bpm/.test(d.zone))
    expect(anyDayWithBpm).toBeDefined()
  })
})
