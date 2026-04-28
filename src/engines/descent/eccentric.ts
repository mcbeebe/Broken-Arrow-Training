/**
 * Eccentric (descent / braking) load engine.
 *
 * Energy cost (Minetti 2002 PMID 12183501) — modeled by `runningMIM` and
 * `hikingMIM` — captures the cardiovascular demand of moving on slopes,
 * but it does NOT reflect the mechanical damage that downhill running
 * imposes on the muscle-tendon unit. Sarcomere over-stretching during
 * eccentric quad contractions is the dominant cause of DOMS and the
 * driver of recovery time after hilly trail efforts.
 *
 * Eccentric-by-grade scale (1-5, qualitative) is taken from
 * `docs/research/Hill_Running_Load_Multipliers_v1.1.xlsx` (Multipliers
 * sheet, column G) which was derived per `PROJECT_PLAN.md §5.3` from:
 *
 *   • Minetti et al. 2002 (PMID 12183501) — energy cost polynomial; T3
 *     baseline that anchors the relative ordering across grades.
 *   • Vernillo et al. 2017 (PMID 27392180) — "Biomechanics and Physiology
 *     of Uphill and Downhill Running", Sports Med 47:615-629; T2 source
 *     for descent-specific eccentric load and recovery patterns.
 *   • Peake et al. 2017 (PMID 28035017) — "Muscle damage and inflammation
 *     during recovery from exercise", J Appl Physiol 122:559-570; T2
 *     source for the eccentric → DOMS mechanism, 24-48 h peak window,
 *     and 5-7 day return-to-baseline.
 *
 * The 1-5 scale is qualitative — relative ordering across grades is
 * evidence-grounded but the absolute magnitude of how much DOMS each
 * unit produces for a given athlete is calibrated downstream via
 * `useDOMSCalibration` from real soreness check-ins.
 *
 * Reference points from the v1.1 table:
 *
 *   grade  ecc  description                              gait
 *   -45%    5   extreme descent (scramble)               hike
 *   -30%    5   very steep descent                       power-hike
 *   -20%    4   steep descent (most economical to run)   run
 *   -10%    2   optimal descent (energy minimum)         run
 *    0%     1   flat                                     run
 *    +5%    1   gentle climb                             run
 *   +10%    2   moderate climb                           run
 *   +15%    2   steep climb (run/hike crossover)         run-or-hike
 *   +20%    2   very steep climb                         hike
 *   +30%    2   extreme climb                            power-hike
 *   +45%    3   scramble                                 hike/scramble
 *
 * Note that climbs and flat work register low-to-moderate eccentric
 * (1-3) — the muscle is shortening concentrically, not absorbing impact.
 * Eccentric peaks on descents because the quads contract while
 * lengthening to control the body's downward momentum.
 */

import { tier, type TieredValue } from '../evidence'
import type { StreamData } from '../../utils/strava'

const CITATION_VERNILLO = 'Vernillo et al. 2017 PMID 27392180'
const URL_VERNILLO = 'https://pubmed.ncbi.nlm.nih.gov/27392180/'
// Peake URL kept inline in citation since `tier` only takes a single
// canonical link; the Vernillo PubMed URL is the primary anchor.
const CITATION_PEAKE = 'Peake et al. 2017 PMID 28035017'
const CITATION_MINETTI = 'Minetti 2002 PMID 12183501'

/**
 * Eccentric score (1-5) at canonical grade points from the v1.1 table.
 * Values between rows are linearly interpolated by `eccentricScore`.
 */
export const ECCENTRIC_BY_GRADE: TieredValue<readonly { grade: number; score: number }[]> = tier(
  Object.freeze([
    { grade: -0.45, score: 5 },
    { grade: -0.30, score: 5 },
    { grade: -0.20, score: 4 },
    { grade: -0.10, score: 2 },
    { grade: 0.00,  score: 1 },
    { grade: 0.05,  score: 1 },
    { grade: 0.10,  score: 2 },
    { grade: 0.15,  score: 2 },
    { grade: 0.20,  score: 2 },
    { grade: 0.30,  score: 2 },
    { grade: 0.45,  score: 3 },
  ]),
  'T2',
  `${CITATION_VERNILLO} + ${CITATION_PEAKE} (baseline ${CITATION_MINETTI})`,
  URL_VERNILLO,
)

/**
 * Linearly interpolate the eccentric score (1-5) at the given signed
 * grade. Grades outside [-0.45, +0.45] clamp to the table endpoints.
 */
export function eccentricScore(grade: number): number {
  const table = ECCENTRIC_BY_GRADE.value
  if (grade <= table[0].grade) return table[0].score
  if (grade >= table[table.length - 1].grade) return table[table.length - 1].score
  for (let i = 0; i + 1 < table.length; i++) {
    const a = table[i]
    const b = table[i + 1]
    if (grade >= a.grade && grade <= b.grade) {
      const t = (grade - a.grade) / (b.grade - a.grade)
      return a.score + t * (b.score - a.score)
    }
  }
  return 1
}

export interface EccentricResult {
  /** Distance-weighted average eccentric score (1-5) across the activity. */
  averageScore: number
  /** Sum of (eccentricScore × dDistanceKm) — total braking-work units (km·score). */
  totalKmScore: number
  /** Distance covered at each eccentric severity bucket (meters). */
  buckets: {
    /** Score < 2 — flat / moderate climb. Eccentric load minimal. */
    mild: number
    /** Score 2 to < 3 — moderate climb / mild descent. */
    moderate: number
    /** Score ≥ 3 — steep descent / scramble. Drives most of the DOMS. */
    severe: number
  }
}

const MILD_MAX = 2
const MODERATE_MAX = 3

/**
 * Distance-weighted eccentric load over the activity's per-second
 * altitude+distance stream.
 *
 * Returns null when the stream is too short or has no usable data —
 * caller should fall back to the static `DOMS_CARRY` heuristic.
 */
export function computeEccentricLoad(stream: StreamData): EccentricResult | null {
  if (!stream || !stream.altitude || !stream.distance) return null
  if (stream.altitude.length !== stream.distance.length) return null
  if (stream.altitude.length < 2) return null

  let weightedNumer = 0
  let totalDist = 0
  let mildDist = 0
  let moderateDist = 0
  let severeDist = 0

  for (let i = 1; i < stream.distance.length; i++) {
    const dDist = stream.distance[i] - stream.distance[i - 1]
    if (dDist <= 0) continue
    const dAlt = stream.altitude[i] - stream.altitude[i - 1]
    const grade = dAlt / dDist
    const score = eccentricScore(grade)
    weightedNumer += score * dDist
    totalDist += dDist
    if (score < MILD_MAX) mildDist += dDist
    else if (score < MODERATE_MAX) moderateDist += dDist
    else severeDist += dDist
  }

  if (totalDist <= 0) return null

  return {
    averageScore: weightedNumer / totalDist,
    totalKmScore: weightedNumer / 1000,
    buckets: {
      mild: mildDist,
      moderate: moderateDist,
      severe: severeDist,
    },
  }
}
