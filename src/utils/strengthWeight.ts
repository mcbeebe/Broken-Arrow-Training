/**
 * Compute a personalized starting weight for a strength exercise based on
 * the athlete's body weight and self-reported weight-lifting experience.
 *
 * Formula: `roundTo5(bodyWeightLb × bwRatio × experienceMultiplier)`
 *
 * - `bwRatio` is exercise-specific (e.g. Goblet Squat = 0.20 × BW per
 *   dumbbell, Barbell Back Squat = 0.65 × BW on the bar).
 * - `experienceMultiplier` scales loads down for novices and up for
 *   experienced lifters: 0.55 / 0.75 / 1.00 / 1.20 for none / beginner /
 *   intermediate / advanced respectively.
 * - Returns `null` when either input is missing or the exercise has no
 *   weight prescription (bodyweight-only moves). Callers should fall back
 *   to the static `guide.weight` text in that case.
 *
 * The exercise lookup matches the same substring strategy used by
 * `findGuide()` in `src/utils/exercises.ts` so that any name variant
 * the plan-generator produces ("Goblet Squat 3×12", "RDL 3×10",
 * "BB Back Squat 3×8") resolves to the right BW ratio.
 */
import type { StrengthExperience } from '../hooks/useOnboarding'

type LoadShape = 'db_pair' | 'db_single' | 'barbell' | 'bw'

interface ExerciseLoad {
  shape: LoadShape
  /** Pounds-per-implement as a fraction of body weight at intermediate. */
  ratio: number
}

/**
 * Per-exercise load profile. Keys are matched against the lowercased
 * exercise name via substring (`name.includes(key)`), longest-key-first.
 * Bodyweight-only moves carry `shape: 'bw'` and `ratio: 0` — the engine
 * returns `null` for those rather than a fabricated weight.
 */
const LOADS: Record<string, ExerciseLoad> = {
  // Compound — barbell
  'bb back squat': { shape: 'barbell', ratio: 0.65 },
  'back squat': { shape: 'barbell', ratio: 0.65 },
  'bb squat': { shape: 'barbell', ratio: 0.65 },
  'weighted hip thrust': { shape: 'barbell', ratio: 0.50 },
  // Compound — dumbbell single
  'goblet squat': { shape: 'db_single', ratio: 0.20 },
  // Single-leg — dumbbell pair
  'bulgarian split squat': { shape: 'db_pair', ratio: 0.10 },
  'walking lunge': { shape: 'db_pair', ratio: 0.10 },
  'step-up': { shape: 'db_pair', ratio: 0.10 },
  // Single-leg — dumbbell single
  'sl deadlift': { shape: 'db_single', ratio: 0.18 },
  // Posterior
  'rdl': { shape: 'db_pair', ratio: 0.18 },
  // Calves
  'weighted calf raise': { shape: 'db_single', ratio: 0.20 },
  // Bodyweight-only — explicit so unmatched-by-default cases (Plank, etc.)
  // still produce `null` and fall back to the static guide text.
  'bw squat': { shape: 'bw', ratio: 0 },
  'calf raise': { shape: 'bw', ratio: 0 },
  'sl calf raise': { shape: 'bw', ratio: 0 },
  'glute bridge': { shape: 'bw', ratio: 0 },
  'eccentric calf drop': { shape: 'bw', ratio: 0 },
  'eccentric step-down': { shape: 'bw', ratio: 0 },
  'nordic curl': { shape: 'bw', ratio: 0 },
  'plank': { shape: 'bw', ratio: 0 },
  'side plank': { shape: 'bw', ratio: 0 },
  'dead bug': { shape: 'bw', ratio: 0 },
  'bird dog': { shape: 'bw', ratio: 0 },
  'squat jump': { shape: 'bw', ratio: 0 },
}

const EXPERIENCE_MULT: Record<StrengthExperience, number> = {
  none: 0.55,
  beginner: 0.75,
  intermediate: 1.0,
  advanced: 1.2,
}

function roundToPlate(lb: number, shape: LoadShape): number {
  // Barbells in 5-lb increments (most public-gym bars); dumbbells in 5-lb pairs.
  const step = shape === 'barbell' ? 5 : 5
  return Math.max(5, Math.round(lb / step) * step)
}

function findLoad(exerciseName: string): { key: string; load: ExerciseLoad } | null {
  const lower = exerciseName.toLowerCase()
  const keys = Object.keys(LOADS).sort((a, b) => b.length - a.length)
  for (const key of keys) {
    if (lower.includes(key)) return { key, load: LOADS[key] }
  }
  return null
}

/**
 * Compute a personalized starting weight string for an exercise.
 *
 * Returns `null` when:
 *   - `bodyWeightLb` is missing or non-positive
 *   - the exercise isn't in the load catalog (caller falls back to guide.weight)
 *   - the exercise is bodyweight-only (caller falls back to guide.weight,
 *     which carries the BW prescription text)
 */
export function computeStartingWeight(
  exerciseName: string,
  bodyWeightLb: number | undefined,
  experience: StrengthExperience | undefined,
): string | null {
  if (!bodyWeightLb || bodyWeightLb <= 0) return null
  const matched = findLoad(exerciseName)
  if (!matched) return null
  const { load } = matched
  if (load.shape === 'bw') return null

  const mult = EXPERIENCE_MULT[experience ?? 'beginner']
  const lb = roundToPlate(bodyWeightLb * load.ratio * mult, load.shape)

  switch (load.shape) {
    case 'db_single':
      return `${lb} lb dumbbell`
    case 'db_pair':
      return `${lb} lb dumbbells (each hand)`
    case 'barbell':
      return `${lb} lb barbell`
  }
}
