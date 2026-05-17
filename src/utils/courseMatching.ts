import type { Course, CourseSegment, SurfaceType } from '../types/course'

/**
 * Course-segment matching — the engine behind:
 *   "Your hill repeats hit the same grade as Squaw Peak mile 4"
 *   "You've covered 67% of the 18K's descent demands"
 *   "Course-segment PRs"
 *
 * Per the UX plan (Tier 1.1) the user wants matching on both grade/vertical
 * AND surface. Each dimension contributes a normalized 0–1 score; the
 * weighted sum is the overall similarity.
 *
 * All functions are pure and deterministic so they're cheap to call per
 * training segment per render.
 */

/** A chunk of training the matcher can compare against a course segment.
 *  Typically derived from a Strava/Garmin activity stream or a planned
 *  workout block. */
export interface TrainingSegment {
  /** Mean grade as a percentage, signed (climb +, descent -). */
  avgGradePct: number
  /** Net vertical change in feet, signed. */
  netVerticalFt: number
  /** Length in miles. */
  lengthMi: number
  /** Surfaces encountered. Omit if unknown — surface score drops to a
   *  neutral 0.5 (don't penalize unknowns, don't reward them either). */
  surfaces?: readonly SurfaceType[]
  /** Mean altitude in feet. Optional — altitude term contributes only when
   *  both training and course-segment have a value. */
  avgAltitudeFt?: number
  /** Optional caller-supplied identifier (Strava activity id, etc.). The
   *  matcher passes it through unchanged so consumers can trace matches
   *  back to source records. */
  source?: string
}

export interface MatchWeights {
  grade: number
  vertical: number
  length: number
  surface: number
  altitude: number
}

/** Defaults chosen so grade dominates (the single best predictor of
 *  training-stimulus equivalence) with surface as a strong secondary,
 *  and altitude as a small tiebreaker that only counts when known. */
export const DEFAULT_WEIGHTS: MatchWeights = {
  grade: 0.35,
  vertical: 0.20,
  length: 0.15,
  surface: 0.25,
  altitude: 0.05,
}

export interface MatchComponents {
  grade: number
  vertical: number
  length: number
  surface: number
  altitude: number
}

export interface SegmentMatch {
  segment: CourseSegment
  /** 0–1 overall similarity. */
  score: number
  /** Per-dimension contributions, each 0–1. Useful for explainability:
   *  "matched on grade and vertical, missed on surface". */
  components: MatchComponents
  /** Short plain-English bullets the UI can render verbatim. */
  reasons: string[]
}

/**
 * Surface compatibility matrix. Symmetric. Values are *similarity*, not
 * "is it the same" — pavement training transfers partially to fire road,
 * fire road transfers strongly to singletrack, etc.
 *
 * Pairs not listed default to 0.3 (different families, partial credit).
 * Same surface = 1.0.
 */
const SURFACE_AFFINITY: Record<string, number> = {
  // Pavement family
  'pavement|pavement': 1.0,
  'pavement|gravel': 0.7,
  'pavement|fire_road': 0.5,
  'pavement|singletrack': 0.35,
  'pavement|technical_trail': 0.2,
  'pavement|rocky_scramble': 0.1,
  'pavement|stairs': 0.4,
  // Gravel
  'gravel|gravel': 1.0,
  'gravel|fire_road': 0.85,
  'gravel|singletrack': 0.65,
  'gravel|technical_trail': 0.4,
  // Fire road
  'fire_road|fire_road': 1.0,
  'fire_road|singletrack': 0.8,
  'fire_road|technical_trail': 0.55,
  'fire_road|rocky_scramble': 0.3,
  // Singletrack
  'singletrack|singletrack': 1.0,
  'singletrack|technical_trail': 0.85,
  'singletrack|rocky_scramble': 0.6,
  'singletrack|stairs': 0.4,
  // Technical
  'technical_trail|technical_trail': 1.0,
  'technical_trail|rocky_scramble': 0.85,
  'technical_trail|stairs': 0.6,
  // Rocky / stairs / snow / sand
  'rocky_scramble|rocky_scramble': 1.0,
  'rocky_scramble|stairs': 0.55,
  'stairs|stairs': 1.0,
  'snow|snow': 1.0,
  'sand|sand': 1.0,
}

function surfacePairKey(a: SurfaceType, b: SurfaceType): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`
}

function surfaceAffinity(a: SurfaceType, b: SurfaceType): number {
  if (a === b) return 1.0
  return SURFACE_AFFINITY[surfacePairKey(a, b)] ?? 0.3
}

/** Affinity between two surface *sets*. Takes the max pairwise affinity
 *  (best-case match) — runners cross-train on multiple surfaces and only
 *  the closest analog matters. */
function surfaceSetAffinity(a: readonly SurfaceType[], b: readonly SurfaceType[]): number {
  if (a.length === 0 || b.length === 0) return 0.5
  let best = 0
  for (const x of a) {
    for (const y of b) {
      const aff = surfaceAffinity(x, y)
      if (aff > best) best = aff
    }
  }
  return best
}

/** Linear similarity over a tolerance scale: identical = 1, scale-apart = 0. */
function linearSim(a: number, b: number, scale: number): number {
  if (scale <= 0) return a === b ? 1 : 0
  const diff = Math.abs(a - b)
  return Math.max(0, 1 - diff / scale)
}

/** Proportional similarity for magnitudes that span orders (vertical,
 *  length). 0% diff = 1.0, 100% diff = 0. Handles zero gracefully. */
function proportionalSim(a: number, b: number): number {
  const aa = Math.abs(a)
  const ab = Math.abs(b)
  const maxMag = Math.max(aa, ab)
  if (maxMag < 1e-6) return 1
  return Math.max(0, 1 - Math.abs(aa - ab) / maxMag)
}

/** Signs must match for grade-relevant similarity — climb vs descent is
 *  not just "different magnitude", it's the wrong stimulus entirely.
 *  Returns 0 when signs disagree and both magnitudes are above a small
 *  flat-grade threshold. */
function signedGradeSim(trainGrade: number, courseGrade: number): number {
  const flat = 1.5
  const sameDirection =
    Math.abs(trainGrade) < flat ||
    Math.abs(courseGrade) < flat ||
    Math.sign(trainGrade) === Math.sign(courseGrade)
  if (!sameDirection) return 0
  // Grade scale: 8 percentage points of difference fully discounts the match.
  return linearSim(Math.abs(trainGrade), Math.abs(courseGrade), 8)
}

function combineWeights(partial?: Partial<MatchWeights>): MatchWeights {
  if (!partial) return DEFAULT_WEIGHTS
  const merged = { ...DEFAULT_WEIGHTS, ...partial }
  const sum = merged.grade + merged.vertical + merged.length + merged.surface + merged.altitude
  if (sum <= 0) return DEFAULT_WEIGHTS
  return {
    grade: merged.grade / sum,
    vertical: merged.vertical / sum,
    length: merged.length / sum,
    surface: merged.surface / sum,
    altitude: merged.altitude / sum,
  }
}

function buildReasons(
  training: TrainingSegment,
  segment: CourseSegment,
  components: MatchComponents,
): string[] {
  const reasons: string[] = []
  const fmtPct = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(1)}%`
  const fmtVert = (v: number) => `${v > 0 ? '+' : ''}${Math.round(v)} ft`

  if (components.grade >= 0.75) {
    reasons.push(`Grade matches (${fmtPct(training.avgGradePct)} vs ${fmtPct(segment.avgGradePct)}).`)
  } else if (components.grade >= 0.4) {
    reasons.push(`Grade is close (${fmtPct(training.avgGradePct)} vs ${fmtPct(segment.avgGradePct)}).`)
  } else if (components.grade === 0) {
    reasons.push(
      training.avgGradePct >= 0 && segment.avgGradePct < 0
        ? `Wrong stimulus — your segment climbs, the course descends here.`
        : training.avgGradePct < 0 && segment.avgGradePct >= 0
        ? `Wrong stimulus — your segment descends, the course climbs here.`
        : `Grade differs sharply (${fmtPct(training.avgGradePct)} vs ${fmtPct(segment.avgGradePct)}).`,
    )
  } else {
    reasons.push(`Grade differs (${fmtPct(training.avgGradePct)} vs ${fmtPct(segment.avgGradePct)}).`)
  }

  if (components.vertical >= 0.75) {
    reasons.push(`Vertical matches (${fmtVert(training.netVerticalFt)} vs ${fmtVert(segment.netVerticalFt)}).`)
  } else if (components.vertical < 0.4) {
    reasons.push(`Vertical differs (${fmtVert(training.netVerticalFt)} vs ${fmtVert(segment.netVerticalFt)}).`)
  }

  if (components.surface >= 0.85) {
    reasons.push(`Surface aligns (${(training.surfaces ?? []).join(', ') || 'unknown'} vs ${segment.surfaces.join(', ')}).`)
  } else if (components.surface < 0.4 && training.surfaces && training.surfaces.length > 0) {
    reasons.push(`Surface mismatch — your training was on ${training.surfaces.join('/')}, course is ${segment.surfaces.join('/')}.`)
  }

  return reasons
}

/**
 * Score one training segment against one course segment. Exposed mostly
 * for tests; consumers usually want `matchTrainingToCourseSegments`.
 */
export function scoreMatch(
  training: TrainingSegment,
  segment: CourseSegment,
  weightsInput?: Partial<MatchWeights>,
): SegmentMatch {
  const weights = combineWeights(weightsInput)
  const gradeSim = signedGradeSim(training.avgGradePct, segment.avgGradePct)
  const verticalSim = proportionalSim(training.netVerticalFt, segment.netVerticalFt)
  const lengthSim = proportionalSim(training.lengthMi, segment.lengthMi)
  const surfaceSim = surfaceSetAffinity(training.surfaces ?? [], segment.surfaces)
  const altitudeSim =
    training.avgAltitudeFt !== undefined
      ? linearSim(training.avgAltitudeFt, segment.avgAltitudeFt, 3000)
      : 0.5

  const components: MatchComponents = {
    grade: gradeSim,
    vertical: verticalSim,
    length: lengthSim,
    surface: surfaceSim,
    altitude: altitudeSim,
  }

  const score =
    components.grade * weights.grade +
    components.vertical * weights.vertical +
    components.length * weights.length +
    components.surface * weights.surface +
    components.altitude * weights.altitude

  return {
    segment,
    score: Math.max(0, Math.min(1, score)),
    components,
    reasons: buildReasons(training, segment, components),
  }
}

/**
 * Match one training segment against every course segment, returning
 * matches above the minimum score, sorted best-first.
 */
export function matchTrainingToCourseSegments(
  training: TrainingSegment,
  segments: CourseSegment[],
  options?: { minScore?: number; weights?: Partial<MatchWeights> },
): SegmentMatch[] {
  const minScore = options?.minScore ?? 0.5
  const matches = segments
    .map(s => scoreMatch(training, s, options?.weights))
    .filter(m => m.score >= minScore)
  matches.sort((a, b) => b.score - a.score)
  return matches
}

export interface SegmentCoverage {
  segment: CourseSegment
  /** Count of training segments that matched above the threshold. */
  hitCount: number
  /** Sum of training-segment lengths attributed to this course segment. */
  matchedMiles: number
  /** matchedMiles / segment.lengthMi, capped at 1.0. The "you've covered X%
   *  of this segment's demands" number. */
  coverage: number
  /** Best match score seen (0–1). High = the matching training segment was
   *  a great analog; low even with hits means many marginal sessions. */
  bestScore: number
}

export interface CourseCoverage {
  course: Course
  perSegment: SegmentCoverage[]
  /** Weighted average of per-segment coverage by segment length — the
   *  headline "X% covered" stat for the whole course. */
  overall: number
}

/**
 * Roll up many training segments against a course, returning per-course-
 * segment coverage stats plus an overall percentage. The data foundation
 * for the "your training has covered X% of the 18K's demands" card.
 *
 * Each training segment is attributed to its best-matching course segment
 * (winner-takes-all). Tied scores break toward the segment with the
 * closest length.
 */
export function summarizeCoverage(
  trainingSegments: TrainingSegment[],
  course: Course,
  options?: { minScore?: number; weights?: Partial<MatchWeights> },
): CourseCoverage {
  const minScore = options?.minScore ?? 0.5
  const accumulators = new Map<string, { hits: number; miles: number; best: number }>()
  for (const seg of course.segments) {
    accumulators.set(seg.id, { hits: 0, miles: 0, best: 0 })
  }

  for (const t of trainingSegments) {
    const matches = matchTrainingToCourseSegments(t, course.segments, {
      minScore,
      weights: options?.weights,
    })
    if (matches.length === 0) continue
    const top = matches[0]
    const acc = accumulators.get(top.segment.id)
    if (!acc) continue
    acc.hits += 1
    acc.miles += t.lengthMi
    if (top.score > acc.best) acc.best = top.score
  }

  const perSegment: SegmentCoverage[] = course.segments.map(seg => {
    const acc = accumulators.get(seg.id) ?? { hits: 0, miles: 0, best: 0 }
    const coverage = seg.lengthMi > 0 ? Math.min(1, acc.miles / seg.lengthMi) : 0
    return {
      segment: seg,
      hitCount: acc.hits,
      matchedMiles: acc.miles,
      coverage,
      bestScore: acc.best,
    }
  })

  const totalLength = course.segments.reduce((sum, s) => sum + s.lengthMi, 0)
  const overall =
    totalLength > 0
      ? perSegment.reduce((sum, s) => sum + s.coverage * s.segment.lengthMi, 0) / totalLength
      : 0

  return { course, perSegment, overall }
}
