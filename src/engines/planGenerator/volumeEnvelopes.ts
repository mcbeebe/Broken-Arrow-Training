/**
 * R4 — published-program volume benchmarks for the road methods, and the
 * envelope the generator is held to (the road analog of the Hyrox
 * six-source benchmark matrix).
 *
 * Each entry records the PEAK weekly-mileage band a method's own published
 * plan prescribes for a given distance and audience, plus the weekly base
 * that plan assumes its athlete already runs. The enforcement envelope is
 * the published band ± ADAPTATION_TOLERANCE: our generator personalizes to
 * the athlete's stated base, day count, and age, so honest adaptation can
 * sit a little outside the book's fixed table — but a generated 5K plan
 * peaking at half or double the published program is a category error the
 * envelope test must catch.
 *
 * Evidence discipline (see docs/running-evidence-audit.md): every band is
 * tier T4 — transcribed from the published plan tables from coaching
 * knowledge, NOT yet page-verified against the printed editions. The
 * expert-review packet asks a reviewer to confirm or correct each band;
 * a corrected band ships as a one-line change here.
 */

import type { RaceDistance } from '../../hooks/useOnboarding'

export type BenchmarkLevel = 'beginner' | 'intermediate' | 'advanced'

export interface VolumeBenchmark {
  /** Published peak weekly miles [lo, hi] for this plan/audience. */
  peakMi: [number, number]
  /** Weekly base the published plan assumes its athlete starts from. */
  assumesBaseMi: number
  /** Which published program the band is transcribed from. */
  source: string
}

/** Honest-adaptation margin around the published band (fraction). */
export const ADAPTATION_TOLERANCE = 0.2

export const PUBLISHED_VOLUME_BENCHMARKS: Partial<
  Record<string, Partial<Record<RaceDistance, Partial<Record<BenchmarkLevel, VolumeBenchmark>>>>>
> = {
  daniels: {
    '5k': {
      beginner: { peakMi: [12, 20], assumesBaseMi: 10, source: "Daniels' Running Formula (3rd ed.) — novice/'white' time-based plans, ~30–45 min sessions" },
      intermediate: { peakMi: [22, 35], assumesBaseMi: 22, source: "Daniels' Running Formula (3rd ed.) — 5K–10K plans, stated audience 20–40 mi/wk" },
      advanced: { peakMi: [35, 55], assumesBaseMi: 38, source: "Daniels' Running Formula (3rd ed.) — 5K–10K plans, upper mileage band" },
    },
    '10k': {
      beginner: { peakMi: [13, 21], assumesBaseMi: 10, source: "Daniels' Running Formula (3rd ed.) — novice time-based plans" },
      intermediate: { peakMi: [24, 36], assumesBaseMi: 22, source: "Daniels' Running Formula (3rd ed.) — 5K–10K plans" },
      advanced: { peakMi: [36, 56], assumesBaseMi: 38, source: "Daniels' Running Formula (3rd ed.) — 5K–10K plans, upper band" },
    },
  },
  higdon: {
    '5k': {
      beginner: { peakMi: [11, 17], assumesBaseMi: 9, source: 'Hal Higdon 5K Novice — 8 weeks, ~9–11 → ~15 mi/wk' },
      intermediate: { peakMi: [20, 27], assumesBaseMi: 17, source: 'Hal Higdon 5K Intermediate — 8 weeks, 400 m repeats + pace + long' },
      advanced: { peakMi: [25, 35], assumesBaseMi: 26, source: 'Hal Higdon 5K Advanced — 8 weeks, speedwork + tempo, ~25–30 mi/wk audience' },
    },
    '10k': {
      beginner: { peakMi: [14, 20], assumesBaseMi: 10, source: 'Hal Higdon 10K Novice — 8 weeks' },
      intermediate: { peakMi: [22, 30], assumesBaseMi: 18, source: 'Hal Higdon 10K Intermediate — 8 weeks' },
      advanced: { peakMi: [28, 38], assumesBaseMi: 27, source: 'Hal Higdon 10K Advanced — 8 weeks' },
    },
  },
  fitzgerald_8020: {
    '5k': {
      beginner: { peakMi: [15, 23], assumesBaseMi: 12, source: '80/20 Running — 5K Level 1 plan' },
      intermediate: { peakMi: [24, 34], assumesBaseMi: 22, source: '80/20 Running — 5K Level 2 plan' },
      advanced: { peakMi: [35, 50], assumesBaseMi: 36, source: '80/20 Running — 5K Level 3 plan' },
    },
    '10k': {
      beginner: { peakMi: [16, 24], assumesBaseMi: 12, source: '80/20 Running — 10K Level 1 plan' },
      intermediate: { peakMi: [25, 36], assumesBaseMi: 22, source: '80/20 Running — 10K Level 2 plan' },
      advanced: { peakMi: [36, 52], assumesBaseMi: 36, source: '80/20 Running — 10K Level 3 plan' },
    },
  },
  galloway: {
    '5k': {
      beginner: { peakMi: [10, 17], assumesBaseMi: 8, source: 'Galloway 5K run-walk-run — 3 days/wk, 30-min sessions + weekend long' },
      intermediate: { peakMi: [16, 27], assumesBaseMi: 16, source: 'Galloway 5K time-goal plan' },
    },
    '10k': {
      beginner: { peakMi: [12, 19], assumesBaseMi: 8, source: 'Galloway 10K run-walk-run' },
      intermediate: { peakMi: [18, 29], assumesBaseMi: 16, source: 'Galloway 10K time-goal plan' },
    },
  },
  pfitzinger: {
    // Faster Road Racing publishes no true-beginner 5K plan — its lowest
    // 5K schedule assumes ~30 mi/wk. Our beginner adaptation deliberately
    // runs below the published floor (suitability for 5K is OK, not BEST),
    // so only the audiences the book actually addresses are benchmarked.
    '5k': {
      intermediate: { peakMi: [28, 42], assumesBaseMi: 26, source: 'Pfitzinger & Latter, Faster Road Racing — 5K to 30 mi/wk & 30–42 mi/wk schedules' },
      advanced: { peakMi: [40, 58], assumesBaseMi: 40, source: 'Faster Road Racing — 5K 42–58 mi/wk schedule' },
    },
    '10k': {
      intermediate: { peakMi: [30, 44], assumesBaseMi: 27, source: 'Faster Road Racing — 8K–10K schedules, lower bands' },
      advanced: { peakMi: [42, 60], assumesBaseMi: 42, source: 'Faster Road Racing — 8K–10K 44–60 mi/wk schedule' },
    },
  },
}

export interface VolumeEnvelope {
  peakLoMi: number
  peakHiMi: number
  benchmark: VolumeBenchmark
}

/** The enforcement envelope: published band ± the adaptation tolerance. */
export function volumeEnvelopeFor(
  methodId: string,
  distance: RaceDistance,
  level: BenchmarkLevel,
): VolumeEnvelope | null {
  const b = PUBLISHED_VOLUME_BENCHMARKS[methodId]?.[distance]?.[level]
  if (!b) return null
  return {
    peakLoMi: b.peakMi[0] * (1 - ADAPTATION_TOLERANCE),
    peakHiMi: b.peakMi[1] * (1 + ADAPTATION_TOLERANCE),
    benchmark: b,
  }
}
