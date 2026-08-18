/**
 * Method-selection engine — Q2 of the plan-generator algorithm.
 *
 * Given user inputs from Onboarding and the full method library, returns the
 * top-3 training methods that best fit the user's race distance, experience
 * level, and inferred terrain — plus a plain-English rationale and any
 * non-blocking warnings carried over from each method's restrictions.
 *
 * Scoring (all from `method.applicability`):
 *   BEST=4, GOOD=3, OK=2, CAUTION=1, NOT_SUITED=0
 *   total = 3·distance + 2·experience + 1·terrain   // max 24
 *
 * Methods whose distance rating is NOT_SUITED are excluded from the top-3
 * unless fewer than 3 candidates remain (then they're returned with a warning).
 */
import type {
  TrainingMethod,
  ApplicabilityRating,
  ExperienceLevel as MethodExperienceLevel,
  RaceDistance,
  Terrain,
} from '../../types/training-method'
import type {
  OnboardingConfig,
  ExperienceLevel as OnboardingExperienceLevel,
  RaceType,
} from '../../hooks/useOnboarding'
import { configVertGainFt } from '../../utils/raceVert'
import { RECOMMENDABLE_METHODS } from '../../data/methods'
import { RACE_DISTANCE_MILES } from '../../utils/seasonConfig'

const RATING_POINTS: Record<ApplicabilityRating, number> = {
  BEST: 4,
  GOOD: 3,
  OK: 2,
  CAUTION: 1,
  NOT_SUITED: 0,
}

const DEFAULT_RATING: ApplicabilityRating = 'OK'

/**
 * R2 — the best recommendable method for a goal distance, by the
 * applicability rating alone (BEST > GOOD > OK > CAUTION; NOT_SUITED
 * never wins). Used by the season splicer's fallback and the suitability
 * gate's suggestion — a stable, deterministic pick with no athlete
 * context needed.
 */
export function bestMethodForDistance(distance: RaceDistance): TrainingMethod {
  let best = RECOMMENDABLE_METHODS[0]
  let bestPts = -1
  for (const m of RECOMMENDABLE_METHODS) {
    const rating = m.applicability?.byDistance?.[distance] ?? DEFAULT_RATING
    const pts = RATING_POINTS[rating]
    if (pts > bestPts && rating !== 'NOT_SUITED') {
      best = m
      bestPts = pts
    }
  }
  return best
}

const W_DISTANCE = 3
const W_EXPERIENCE = 2
const W_TERRAIN = 1

export interface AxisScore {
  key: string
  rating: ApplicabilityRating
  points: number
  weight: number
}

export interface MethodSelection {
  methodId: string
  method: TrainingMethod
  score: number
  axes: {
    distance: AxisScore
    experience: AxisScore
    terrain: AxisScore
  }
  rationale: string[]
  warnings: string[]
}

export interface SelectionInputs {
  raceDistance: RaceDistance
  experience: MethodExperienceLevel
  terrain: Terrain
}

/**
 * Map Onboarding's `ExperienceLevel` (which has `first_timer` and no
 * `recreational`) onto the method-library `ExperienceLevel`.
 */
export function mapExperience(level: OnboardingExperienceLevel): MethodExperienceLevel {
  // first_timer is novel to onboarding; methods don't distinguish first-timer
  // from beginner, so collapse them. Everything else is identity-mapped.
  return level === 'first_timer' ? 'beginner' : level
}

/**
 * Infer terrain from raceType + raceDistance. Trail races at ultra distance
 * (50K+) are typically rolling-to-vertical; mountain_ultra is the only one
 * we treat as `mountain_vertical` by default. Hyrox / general fitness fall
 * back to `road`.
 */
export function inferTerrain(
  raceType: RaceType,
  raceDistance: RaceDistance | undefined,
  vertFtPerMi = 0,
): Terrain {
  if (raceType !== 'trail') return 'road'
  if (raceDistance === 'mountain_ultra') return 'mountain_vertical'
  // P2 — vert density upgrades terrain: >240 ft/mi is "Colossal" on the
  // iRunFar tiers, where climbing endurance is the defining demand and
  // vertical-oriented methods should outscore rolling-trail ones.
  if (vertFtPerMi > 240) return 'mountain_vertical'
  return 'trail_rolling'
}

/** Build typed inputs from an `OnboardingConfig`. Returns null if race distance is missing. */
export function inputsFromOnboarding(config: OnboardingConfig): SelectionInputs | null {
  if (!config.raceDistance) return null
  // P2 — method selection sees the race's climb density, not just the
  // trail/road radio: vert per mile from the structured field (or the
  // description fallback) against the exact distance when provided.
  const vertFt = configVertGainFt(config)
  const miles = config.raceDistanceMiles && config.raceDistanceMiles > 0
    ? config.raceDistanceMiles
    : RACE_DISTANCE_MILES[config.raceDistance] || 0
  const vertFtPerMi = vertFt > 0 && miles > 0 ? vertFt / miles : 0
  return {
    raceDistance: config.raceDistance,
    experience: mapExperience(config.experienceLevel),
    terrain: inferTerrain(config.raceType, config.raceDistance, vertFtPerMi),
  }
}

function scoreAxis<K extends string>(
  key: K,
  rating: ApplicabilityRating | undefined,
  weight: number,
): AxisScore {
  const r = rating ?? DEFAULT_RATING
  return { key, rating: r, points: RATING_POINTS[r], weight }
}

function ratingPhrase(rating: ApplicabilityRating): string {
  switch (rating) {
    case 'BEST': return 'best fit'
    case 'GOOD': return 'a good fit'
    case 'OK': return 'workable'
    case 'CAUTION': return 'a stretch'
    case 'NOT_SUITED': return 'not designed'
  }
}

function readableDistance(d: RaceDistance): string {
  const map: Record<RaceDistance, string> = {
    '5k': '5K',
    '10k': '10K',
    half_marathon: 'the half marathon',
    marathon: 'the marathon',
    '50k': '50K ultras',
    '50_mile': '50-mile ultras',
    '100k': '100K ultras',
    '100_mile': '100-mile ultras',
    mountain_ultra: 'mountain / vertical ultras',
  }
  return map[d]
}

function readableExperience(e: MethodExperienceLevel): string {
  const map: Record<MethodExperienceLevel, string> = {
    beginner: 'beginner',
    recreational: 'recreational',
    intermediate: 'intermediate',
    advanced: 'advanced',
    elite: 'elite',
  }
  return map[e]
}

function readableTerrain(t: Terrain): string {
  const map: Record<Terrain, string> = {
    road: 'road',
    track: 'track',
    trail_rolling: 'rolling trail',
    mountain_vertical: 'mountain / vertical',
    cross_country: 'cross-country',
  }
  return map[t]
}

/**
 * Build the human-readable rationale lines for one method given its three
 * axis scores. Highlights BEST / GOOD axes; mentions concern axes only when
 * the overall rating is weak (CAUTION / NOT_SUITED).
 */
function buildRationale(
  method: TrainingMethod,
  inputs: SelectionInputs,
  axes: MethodSelection['axes'],
): string[] {
  const lines: string[] = []
  lines.push(method.signature)

  const strong: string[] = []
  if (axes.distance.rating === 'BEST' || axes.distance.rating === 'GOOD') {
    strong.push(`${ratingPhrase(axes.distance.rating)} for ${readableDistance(inputs.raceDistance)}`)
  }
  if (axes.experience.rating === 'BEST' || axes.experience.rating === 'GOOD') {
    strong.push(`${ratingPhrase(axes.experience.rating)} for ${readableExperience(inputs.experience)} runners`)
  }
  if (axes.terrain.rating === 'BEST' || axes.terrain.rating === 'GOOD') {
    strong.push(`${ratingPhrase(axes.terrain.rating)} for ${readableTerrain(inputs.terrain)} terrain`)
  }
  if (strong.length > 0) {
    lines.push(`Why we picked it: ${strong.join('; ')}.`)
  }

  const concerns: string[] = []
  if (axes.distance.rating === 'CAUTION' || axes.distance.rating === 'NOT_SUITED') {
    concerns.push(`${ratingPhrase(axes.distance.rating)} for ${readableDistance(inputs.raceDistance)}`)
  }
  if (axes.experience.rating === 'CAUTION' || axes.experience.rating === 'NOT_SUITED') {
    concerns.push(`${ratingPhrase(axes.experience.rating)} for ${readableExperience(inputs.experience)} runners`)
  }
  if (axes.terrain.rating === 'CAUTION' || axes.terrain.rating === 'NOT_SUITED') {
    concerns.push(`${ratingPhrase(axes.terrain.rating)} for ${readableTerrain(inputs.terrain)} terrain`)
  }
  if (concerns.length > 0) {
    lines.push(`Heads-up: ${concerns.join('; ')}.`)
  }

  return lines
}

/**
 * Pull warnings from a method's `restrictions` array when the restriction's
 * `type` matches an axis where the user has a CAUTION or NOT_SUITED rating.
 * Restrictions are non-blocking by Q6 design — they're informational.
 */
function buildWarnings(
  method: TrainingMethod,
  axes: MethodSelection['axes'],
): string[] {
  const warnings: string[] = []
  for (const r of method.restrictions) {
    const weak =
      (r.type === 'distance' && (axes.distance.rating === 'CAUTION' || axes.distance.rating === 'NOT_SUITED')) ||
      (r.type === 'experience' && (axes.experience.rating === 'CAUTION' || axes.experience.rating === 'NOT_SUITED')) ||
      (r.type === 'terrain' && (axes.terrain.rating === 'CAUTION' || axes.terrain.rating === 'NOT_SUITED'))
    if (weak && r.warningMessage) {
      warnings.push(r.warningMessage)
    }
  }
  return warnings
}

/**
 * Score every method against the user inputs. Pure function — methods are
 * passed in so this is trivially testable.
 */
export function scoreMethods(
  methods: ReadonlyArray<TrainingMethod>,
  inputs: SelectionInputs,
): MethodSelection[] {
  return methods.map(method => {
    const axes = {
      distance: scoreAxis('distance', method.applicability.byDistance[inputs.raceDistance], W_DISTANCE),
      experience: scoreAxis('experience', method.applicability.byExperience[inputs.experience], W_EXPERIENCE),
      terrain: scoreAxis('terrain', method.applicability.byTerrain[inputs.terrain], W_TERRAIN),
    }
    const score =
      axes.distance.points * axes.distance.weight +
      axes.experience.points * axes.experience.weight +
      axes.terrain.points * axes.terrain.weight

    return {
      methodId: method.id,
      method,
      score,
      axes,
      rationale: buildRationale(method, inputs, axes),
      warnings: buildWarnings(method, axes),
    }
  })
}

/**
 * Top-3 method picks. Filters out methods whose distance rating is
 * NOT_SUITED unless fewer than 3 viable candidates remain (in which case
 * the lowest-scoring viable methods round out the slate). Equal total scores
 * break on profile fit — experience, then terrain, then distance — so a tie is
 * decided by how well the method suits the athlete, not the alphabet; the id is
 * only the final, deterministic fallback when every axis is identical too.
 */
export function selectMethods(
  methods: ReadonlyArray<TrainingMethod>,
  inputs: SelectionInputs,
): MethodSelection[] {
  const all = scoreMethods(methods, inputs)
  const viable = all.filter(s => s.axes.distance.rating !== 'NOT_SUITED')
  const pool = viable.length >= 3 ? viable : all
  const sorted = [...pool].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    if (b.axes.experience.points !== a.axes.experience.points) return b.axes.experience.points - a.axes.experience.points
    if (b.axes.terrain.points !== a.axes.terrain.points) return b.axes.terrain.points - a.axes.terrain.points
    if (b.axes.distance.points !== a.axes.distance.points) return b.axes.distance.points - a.axes.distance.points
    return a.methodId.localeCompare(b.methodId)
  })
  return sorted.slice(0, 3)
}
