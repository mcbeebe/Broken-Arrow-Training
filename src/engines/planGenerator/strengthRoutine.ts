/**
 * Parametric strength-routine builder. Picks a list of exercises and
 * formats sets/reps based on race type, distance, experience, equipment
 * access, injury status, and the current training phase.
 *
 * Output format matches `day.detail` consumed by the WorkoutModal's
 * `parseRoutine()`: one `·`-separated string of "Exercise N×R" tokens
 * (e.g. "Bulgarian Split Squat 3×10/leg"). Each exercise name maps to
 * a guide entry in `src/utils/exercises.ts` for in-modal form cues.
 */
import type { TrainingMethod, StrengthRoutineOverrides } from '../../types/training-method'
import type {
  OnboardingConfig,
  RaceType,
  RaceDistance,
  ExperienceLevel,
  InjuryStatus,
  EquipmentAccess,
} from '../../hooks/useOnboarding'

type Category =
  | 'lower_compound'
  | 'lower_singleleg'
  | 'posterior'
  | 'calves'
  | 'eccentric'
  | 'core'
  | 'plyo'
  | 'mobility'

type Equipment = 'bodyweight' | 'dumbbell' | 'barbell' | 'kettlebell' | 'bench' | 'box' | 'wall'
type Impact = 'low' | 'medium' | 'high'
type Skill = 'beginner' | 'intermediate' | 'advanced'

interface CatalogExercise {
  name: string
  category: Category
  equipment: Equipment[]
  impact: Impact
  skill: Skill
  /** Higher score = exercise is more valuable for this race profile. */
  raceWeight: Partial<Record<RaceProfile, number>>
  /** Default rep prescription per phase intent. `_leg` suffix appends "/leg". */
  reps: { base: string; build: string; peak: string; taper: string }
}

type RaceProfile =
  | 'mountain_ultra'
  | 'trail_ultra'
  | 'trail_short'
  | 'marathon'
  | 'half'
  | 'short_road'

/**
 * Public catalog. Keys are matched to `GUIDES` in `src/utils/exercises.ts`
 * by case-insensitive substring; "Bulgarian Split Squat" resolves to the
 * `bulgarian split squat` guide.
 */
export const CATALOG: CatalogExercise[] = [
  // Lower compound
  {
    name: 'Goblet Squat',
    category: 'lower_compound',
    equipment: ['dumbbell', 'kettlebell'],
    impact: 'low',
    skill: 'beginner',
    raceWeight: { mountain_ultra: 2, trail_ultra: 2, trail_short: 3, marathon: 2, half: 3, short_road: 3 },
    reps: { base: '12', build: '10', peak: '8', taper: '10' },
  },
  {
    name: 'Barbell Back Squat',
    category: 'lower_compound',
    equipment: ['barbell'],
    impact: 'medium',
    skill: 'intermediate',
    raceWeight: { mountain_ultra: 1, trail_ultra: 1, trail_short: 2, marathon: 2, half: 3, short_road: 3 },
    reps: { base: '8', build: '6', peak: '5', taper: '6' },
  },
  {
    name: 'BW Squat',
    category: 'lower_compound',
    equipment: ['bodyweight'],
    impact: 'low',
    skill: 'beginner',
    raceWeight: { mountain_ultra: 1, trail_ultra: 1, trail_short: 2, marathon: 1, half: 2, short_road: 2 },
    reps: { base: '15', build: '12', peak: '10', taper: '10' },
  },

  // Lower single-leg
  {
    name: 'Bulgarian Split Squat',
    category: 'lower_singleleg',
    equipment: ['dumbbell', 'bench'],
    impact: 'low',
    skill: 'intermediate',
    raceWeight: { mountain_ultra: 3, trail_ultra: 3, trail_short: 3, marathon: 2, half: 2, short_road: 2 },
    reps: { base: '10/leg', build: '8/leg', peak: '6/leg', taper: '8/leg' },
  },
  {
    name: 'Step-Up',
    category: 'lower_singleleg',
    equipment: ['box'],
    impact: 'low',
    skill: 'beginner',
    raceWeight: { mountain_ultra: 3, trail_ultra: 2, trail_short: 2, marathon: 1, half: 1, short_road: 1 },
    reps: { base: '10/leg', build: '8/leg', peak: '6/leg', taper: '8/leg' },
  },
  {
    name: 'Walking Lunge',
    category: 'lower_singleleg',
    equipment: ['bodyweight', 'dumbbell'],
    impact: 'low',
    skill: 'beginner',
    raceWeight: { mountain_ultra: 2, trail_ultra: 2, trail_short: 2, marathon: 2, half: 2, short_road: 2 },
    reps: { base: '12/leg', build: '10/leg', peak: '8/leg', taper: '8/leg' },
  },
  {
    name: 'SL Deadlift',
    category: 'lower_singleleg',
    equipment: ['dumbbell'],
    impact: 'low',
    skill: 'intermediate',
    raceWeight: { mountain_ultra: 2, trail_ultra: 2, trail_short: 2, marathon: 2, half: 1, short_road: 1 },
    reps: { base: '8/leg', build: '6/leg', peak: '6/leg', taper: '6/leg' },
  },

  // Posterior chain
  {
    name: 'Romanian Deadlift (RDL)',
    category: 'posterior',
    equipment: ['dumbbell', 'barbell'],
    impact: 'low',
    skill: 'intermediate',
    raceWeight: { mountain_ultra: 3, trail_ultra: 3, trail_short: 2, marathon: 3, half: 3, short_road: 2 },
    reps: { base: '10', build: '8', peak: '6', taper: '8' },
  },
  {
    name: 'Glute Bridge',
    category: 'posterior',
    equipment: ['bodyweight'],
    impact: 'low',
    skill: 'beginner',
    raceWeight: { mountain_ultra: 1, trail_ultra: 1, trail_short: 2, marathon: 2, half: 2, short_road: 2 },
    reps: { base: '15', build: '12', peak: '10', taper: '12' },
  },
  {
    name: 'Weighted Hip Thrust',
    category: 'posterior',
    equipment: ['dumbbell', 'barbell', 'bench'],
    impact: 'low',
    skill: 'intermediate',
    raceWeight: { mountain_ultra: 2, trail_ultra: 2, trail_short: 2, marathon: 3, half: 3, short_road: 3 },
    reps: { base: '12', build: '8', peak: '6', taper: '8' },
  },

  // Calves
  {
    name: 'Calf Raise',
    category: 'calves',
    equipment: ['bodyweight'],
    impact: 'low',
    skill: 'beginner',
    raceWeight: { mountain_ultra: 3, trail_ultra: 2, trail_short: 2, marathon: 2, half: 2, short_road: 1 },
    reps: { base: '15', build: '12', peak: '12', taper: '12' },
  },
  {
    name: 'SL Calf Raise',
    category: 'calves',
    equipment: ['bodyweight', 'wall'],
    impact: 'low',
    skill: 'intermediate',
    raceWeight: { mountain_ultra: 3, trail_ultra: 3, trail_short: 2, marathon: 2, half: 1, short_road: 1 },
    reps: { base: '12/leg', build: '10/leg', peak: '8/leg', taper: '8/leg' },
  },

  // Eccentric (critical for downhill / trail)
  {
    name: 'Eccentric Step-Down',
    category: 'eccentric',
    equipment: ['box'],
    impact: 'low',
    skill: 'intermediate',
    raceWeight: { mountain_ultra: 3, trail_ultra: 3, trail_short: 2, marathon: 1, half: 1, short_road: 0 },
    reps: { base: '8/leg', build: '8/leg', peak: '6/leg', taper: '6/leg' },
  },
  {
    name: 'Eccentric Calf Drop',
    category: 'eccentric',
    equipment: ['bodyweight'],
    impact: 'low',
    skill: 'beginner',
    raceWeight: { mountain_ultra: 2, trail_ultra: 2, trail_short: 1, marathon: 1, half: 1, short_road: 1 },
    reps: { base: '12', build: '10', peak: '10', taper: '10' },
  },
  {
    name: 'Nordic Curl',
    category: 'eccentric',
    equipment: ['bodyweight'],
    impact: 'medium',
    skill: 'advanced',
    raceWeight: { mountain_ultra: 2, trail_ultra: 2, trail_short: 1, marathon: 2, half: 2, short_road: 1 },
    reps: { base: '6', build: '5', peak: '4', taper: '4' },
  },

  // Core
  {
    name: 'Plank',
    category: 'core',
    equipment: ['bodyweight'],
    impact: 'low',
    skill: 'beginner',
    raceWeight: { mountain_ultra: 2, trail_ultra: 2, trail_short: 2, marathon: 2, half: 2, short_road: 2 },
    reps: { base: '45s', build: '60s', peak: '45s', taper: '30s' },
  },
  {
    name: 'Side Plank',
    category: 'core',
    equipment: ['bodyweight'],
    impact: 'low',
    skill: 'beginner',
    raceWeight: { mountain_ultra: 2, trail_ultra: 2, trail_short: 2, marathon: 2, half: 2, short_road: 2 },
    reps: { base: '30s/side', build: '45s/side', peak: '30s/side', taper: '20s/side' },
  },
  {
    name: 'Dead Bug',
    category: 'core',
    equipment: ['bodyweight'],
    impact: 'low',
    skill: 'beginner',
    raceWeight: { mountain_ultra: 1, trail_ultra: 1, trail_short: 2, marathon: 2, half: 2, short_road: 2 },
    reps: { base: '10/side', build: '10/side', peak: '8/side', taper: '8/side' },
  },
  {
    name: 'Bird Dog',
    category: 'core',
    equipment: ['bodyweight'],
    impact: 'low',
    skill: 'beginner',
    raceWeight: { mountain_ultra: 2, trail_ultra: 2, trail_short: 2, marathon: 1, half: 1, short_road: 1 },
    reps: { base: '10/side', build: '10/side', peak: '8/side', taper: '8/side' },
  },

  // Plyo (skill + impact)
  {
    name: 'Squat Jump',
    category: 'plyo',
    equipment: ['bodyweight'],
    impact: 'high',
    skill: 'advanced',
    raceWeight: { mountain_ultra: 0, trail_ultra: 0, trail_short: 1, marathon: 1, half: 2, short_road: 3 },
    reps: { base: '8', build: '6', peak: '5', taper: '0' },
  },
]

// ---------------------------------------------------------------------------
// Profile derivation
// ---------------------------------------------------------------------------

function deriveRaceProfile(raceType: RaceType, raceDistance: RaceDistance | undefined): RaceProfile {
  if (raceType === 'trail') {
    if (raceDistance === 'mountain_ultra') return 'mountain_ultra'
    if (raceDistance === '50k' || raceDistance === '50_mile' || raceDistance === '100k' || raceDistance === '100_mile') return 'trail_ultra'
    return 'trail_short'
  }
  // general or unspecified — fall through to road profile by distance
  if (raceDistance === 'marathon') return 'marathon'
  if (raceDistance === 'half_marathon') return 'half'
  return 'short_road'
}

const SKILL_RANK: Record<Skill, number> = { beginner: 1, intermediate: 2, advanced: 3 }

function maxAllowedSkill(level: ExperienceLevel): Skill {
  switch (level) {
    case 'first_timer': return 'beginner'
    case 'beginner': return 'beginner'
    case 'intermediate': return 'intermediate'
    case 'advanced': return 'advanced'
    case 'elite': return 'advanced'
  }
}

function availableEquipment(access: EquipmentAccess[] | undefined): Set<Equipment> {
  // Bodyweight, bench, box, wall, dumbbell, kettlebell are assumed minimally
  // present unless the athlete is in a constrained setting. Barbell requires
  // explicit gym access — that's the only equipment we treat as gated.
  const set = new Set<Equipment>(['bodyweight', 'bench', 'box', 'wall', 'dumbbell', 'kettlebell'])
  if (access && access.includes('gym')) {
    set.add('barbell')
  }
  return set
}

// ---------------------------------------------------------------------------
// Routine assembly
// ---------------------------------------------------------------------------

type PhaseIntent = 'base' | 'build' | 'peak' | 'taper'

interface BuildOpts {
  raceType: RaceType
  raceDistance: RaceDistance | undefined
  experience: ExperienceLevel
  equipment: EquipmentAccess[] | undefined
  injury: InjuryStatus | undefined
  phaseIntent: PhaseIntent
  isTaper: boolean
  overrides?: StrengthRoutineOverrides
}

/** Number of exercises to pick per (profile, phase). Tapers always drop one. */
function exerciseCount(profile: RaceProfile, isTaper: boolean): number {
  if (isTaper) return 4
  switch (profile) {
    case 'mountain_ultra': return 7
    case 'trail_ultra': return 6
    case 'trail_short': return 6
    case 'marathon': return 6
    case 'half': return 6
    case 'short_road': return 5
  }
}

/** Category priority weights by race profile — used to bias category coverage. */
const CATEGORY_PRIORITY: Record<RaceProfile, Partial<Record<Category, number>>> = {
  mountain_ultra: { eccentric: 3, lower_singleleg: 3, calves: 2, core: 2, posterior: 2, lower_compound: 1 },
  trail_ultra: { lower_singleleg: 3, posterior: 2, eccentric: 2, calves: 2, core: 2, lower_compound: 1 },
  trail_short: { lower_singleleg: 2, lower_compound: 2, posterior: 2, calves: 2, core: 2 },
  marathon: { posterior: 3, lower_singleleg: 2, lower_compound: 2, core: 2, calves: 1 },
  half: { lower_compound: 2, posterior: 2, lower_singleleg: 2, core: 2, plyo: 1, calves: 1 },
  short_road: { lower_compound: 3, posterior: 2, lower_singleleg: 2, plyo: 2, core: 2 },
}

/** Sets per (experience, phase, taper). */
function setsFor(level: ExperienceLevel, phase: PhaseIntent, isTaper: boolean): number {
  if (isTaper) return 2
  if (level === 'first_timer' || level === 'beginner') return phase === 'base' ? 2 : 3
  if (level === 'intermediate') return 3
  return phase === 'build' || phase === 'peak' ? 4 : 3
}

/**
 * Decide whether an exercise is usable given experience, equipment, and
 * injury constraints. Bodyweight is always available as a fallback.
 */
function isUsable(
  ex: CatalogExercise,
  level: ExperienceLevel,
  eq: Set<Equipment>,
  injury: InjuryStatus | undefined,
): boolean {
  const maxSkill = maxAllowedSkill(level)
  if (SKILL_RANK[ex.skill] > SKILL_RANK[maxSkill]) return false

  // Current injury: skip medium/high-impact moves and lifts requiring barbell loading.
  if (injury === 'current') {
    if (ex.impact === 'medium' || ex.impact === 'high') return false
  }
  // Returning from injury: skip high-impact only (plyo).
  if (injury === 'returning' && ex.impact === 'high') return false

  // Equipment: pass if ANY of the exercise's equipment options is available.
  return ex.equipment.some(e => eq.has(e))
}

interface ScoredExercise {
  ex: CatalogExercise
  score: number
}

/**
 * Build a strength routine as `·`-separated "Exercise N×R" string. Pure
 * function — deterministic for the same inputs.
 */
export function buildRoutine(opts: BuildOpts): string {
  const profile = deriveRaceProfile(opts.raceType, opts.raceDistance)
  const eq = availableEquipment(opts.equipment)
  const overrides = opts.overrides

  // Bodyweight-only override forces the equipment set down to bodyweight
  // + wall (still bodyweight-equivalent). This is the Higdon/minimal path.
  const filterEq = overrides?.bodyweightOnly ? new Set<Equipment>(['bodyweight', 'wall']) : eq
  const usable = CATALOG.filter(e => isUsable(e, opts.experience, filterEq, opts.injury))

  // Score by category priority × race weight, with an emphasis boost for
  // method-preferred categories (Koop emphasizes single-leg, Roche posterior, etc.)
  const catPri = CATEGORY_PRIORITY[profile]
  const emphasisSet = new Set(overrides?.emphasizeCategories ?? [])
  const scored: ScoredExercise[] = usable.map(ex => {
    const catScore = catPri[ex.category] ?? 0
    const raceScore = ex.raceWeight[profile] ?? 0
    const emphasisBoost = emphasisSet.has(ex.category) ? 20 : 0
    return { ex, score: catScore * 10 + raceScore + emphasisBoost }
  }).sort((a, b) => b.score - a.score)

  const defaultCount = exerciseCount(profile, opts.isTaper)
  const wantCount = overrides?.exerciseCap ? Math.min(defaultCount, overrides.exerciseCap) : defaultCount
  const phase: PhaseIntent = opts.isTaper ? 'taper' : opts.phaseIntent
  const picked: CatalogExercise[] = []

  // First pass: emphasized categories, then default priority categories
  const priorityCats = [
    ...(overrides?.emphasizeCategories ?? []),
    ...Object.entries(catPri).sort((a, b) => b[1]! - a[1]!).map(([c]) => c as Category),
  ]
  const seenCats = new Set<Category>()
  for (const cat of priorityCats) {
    if (seenCats.has(cat)) continue
    seenCats.add(cat)
    if (picked.length >= wantCount) break
    if (phase === 'taper' && cat === 'plyo') continue
    const next = scored.find(s => s.ex.category === cat && !picked.includes(s.ex))
    if (next) {
      picked.push(next.ex)
    }
  }

  // Second pass: fill remaining slots from the top of the scored list
  for (const s of scored) {
    if (picked.length >= wantCount) break
    if (picked.includes(s.ex)) continue
    if (phase === 'taper' && s.ex.category === 'plyo') continue
    picked.push(s.ex)
  }

  const sets = setsFor(opts.experience, phase, opts.isTaper)
  return picked.map(ex => `${ex.name} ${sets}×${ex.reps[phase]}`).join(' · ')
}

/**
 * Map a method's phase + a week's flag set to a `PhaseIntent`. The method's
 * own phase definitions are coarse (Base / Build / Peak / Taper-ish) but
 * each method names them differently — we pattern-match on the phase id.
 */
export function inferPhaseIntent(phaseId: string, isTaper: boolean): PhaseIntent {
  if (isTaper) return 'taper'
  const id = phaseId.toLowerCase()
  if (id.includes('taper')) return 'taper'
  if (id.includes('peak') || id.includes('race')) return 'peak'
  if (id.includes('build') || id.includes('specific') || id.includes('lactate') || id.includes('threshold')) return 'build'
  return 'base'
}

/**
 * Top-level convenience: produce the strength detail string from a method
 * + onboarding config + week context. Method overrides aren't honored yet
 * (TBD: per-method `strengthOverrides` field).
 */
export function buildStrengthRoutineFor(
  method: TrainingMethod,
  config: OnboardingConfig,
  ctx: { phaseId: string; isTaper: boolean; weekNumber: number },
): string {
  return buildRoutine({
    raceType: config.raceType,
    raceDistance: config.raceDistance,
    experience: config.experienceLevel,
    equipment: config.equipmentAccess,
    injury: config.injuryStatus,
    phaseIntent: inferPhaseIntent(ctx.phaseId, ctx.isTaper),
    isTaper: ctx.isTaper,
    overrides: method.strengthRecommendation.routineOverrides,
  })
}
