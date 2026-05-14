/**
 * TrainingMethod schema — TypeScript types for the plan-generator data layer.
 *
 * One TrainingMethod = one running philosophy (Daniels, Pfitzinger, Hansons, …)
 * encoded as structured data. The engine consumes a TrainingMethod + user inputs
 * and emits a personalized week-by-week TrainingPlan.
 *
 * Paired with schema/training-method.schema.json (AJV validation at runtime).
 */

// ---------------------------------------------------------------------------
// Enumerations (literal unions — `erasableSyntaxOnly: true` blocks `enum`)
// ---------------------------------------------------------------------------

export type AnchorType =
  | 'recent_race_time'
  | 'estimated_5k_time'
  | 'lthr_bpm'
  | 'aet_bpm'
  | 'self_assessed_pace'
  | 'vdot'
  | 'none';

export type CanonicalPaceZone =
  | 'recovery'
  | 'easy'
  | 'aerobic_threshold'
  | 'marathon_pace'
  | 'lactate_threshold'
  | 'critical_velocity'
  | 'vo2max'
  | 'speed'
  | 'race_pace';

export type WorkoutCategory =
  | 'rest'
  | 'cross_training'
  | 'strength'
  | 'easy'
  | 'long'
  | 'recovery'
  | 'tempo'
  | 'cruise_intervals'
  | 'vo2_intervals'
  | 'speed_repetitions'
  | 'strides'
  | 'race_pace'
  | 'fartlek'
  | 'hills'
  | 'progression'
  | 'time_trial';

export type PaceStrategy =
  | 'vdot_table'
  | 'offset_from_anchor'
  | 'pct_of_hr'
  | 'rpe_only';

export type RecoveryType = 'jog' | 'stand' | 'walk';

export type DurationUnit = 'sec' | 'min';
export type DistanceUnit = 'm' | 'km' | 'mi';

export type ExperienceLevel =
  | 'beginner'
  | 'recreational'
  | 'intermediate'
  | 'advanced'
  | 'elite';

export type RaceDistance =
  | '5k'
  | '10k'
  | 'half_marathon'
  | 'marathon'
  | '50k'
  | '50_mile'
  | '100k'
  | '100_mile'
  | 'mountain_ultra';

export type Terrain =
  | 'road'
  | 'track'
  | 'trail_rolling'
  | 'mountain_vertical'
  | 'cross_country';

export type ApplicabilityRating = 'BEST' | 'GOOD' | 'OK' | 'CAUTION' | 'NOT_SUITED';

export type WeekType = 'standard' | 'recovery';
export type VolumeModifier = 'short' | 'medium' | 'long';
export type MileageBehavior = 'build' | 'peak' | 'taper';
export type RestrictionType = 'distance' | 'experience' | 'terrain' | 'time' | 'general';

// ---------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------

export interface Citation {
  source: string;
  title: string;
  year?: number;
  url?: string;
}

export interface RangeMinMax {
  min: number;
  max: number;
}

export interface RangeMinMaxDefault extends RangeMinMax {
  default: number;
}

export interface RangeWithIdeal extends RangeMinMax {
  ideal?: number;
}

export interface PctRange {
  min: number;
  default: number;
  max: number;
}

export interface RpeRange {
  min: number;
  max: number;
  description?: string;
}

export interface HrRange {
  minPctLthr?: number;
  maxPctLthr?: number;
}

export interface PaceFormula {
  anchorType: AnchorType;
  strategy: PaceStrategy;
  expression?: string;
  offsetSecPerMile?: RangeMinMax;
  pctOfLthr?: RangeMinMax;
}

export interface PaceZone {
  canonical: CanonicalPaceZone;
  displayName: string;
  abbreviation?: string;
  purpose: string;
  paceFormula: PaceFormula;
  rpeRange?: RpeRange;
  hrRange?: HrRange;
}

// ---------------------------------------------------------------------------
// Workout templates
// ---------------------------------------------------------------------------

export interface DurationValue {
  value: number;
  unit: DurationUnit;
}

export interface DistanceValue {
  value: number;
  unit: DistanceUnit;
}

export interface Recovery {
  type: RecoveryType;
  duration?: DurationValue;
  distance?: DistanceValue;
}

export interface WorkoutSegment {
  description: string;
  duration?: DurationValue;
  distance?: DistanceValue;
  paceZone?: CanonicalPaceZone;
  reps?: number;
  recovery?: Recovery;
  cue?: string;
}

export interface WorkoutStructure {
  warmup?: WorkoutSegment;
  mainSet: WorkoutSegment[];
  cooldown?: WorkoutSegment;
}

export interface Workout {
  id: string;
  name: string;
  shortDescription?: string;
  displayName?: string;
  category: WorkoutCategory;
  primaryZone: CanonicalPaceZone;
  structure: WorkoutStructure;
  approxDurationMinutes: RangeMinMax;
  approxDistanceMiles?: RangeMinMax;
  purpose: string;
  cues?: string[];
  validPhaseIds: string[];
  minimumExperience?: ExperienceLevel;
  requiresBaseMileage?: number;
}

// ---------------------------------------------------------------------------
// Phases
// ---------------------------------------------------------------------------

export interface IntensityDistribution {
  easyPct: number;
  moderatePct: number;
  hardPct: number;
}

export interface WeekBounds {
  minWeeks: number;
  maxWeeks: number;
}

export interface Phase {
  id: string;
  name: string;
  order: number;
  pctOfPlan: PctRange;
  weekBounds: WeekBounds;
  focus: string;
  intensityDistribution: IntensityDistribution;
  keyWorkoutIds: string[];
  mileageBehavior: MileageBehavior;
  athleteNarrative?: string;
}

// ---------------------------------------------------------------------------
// Weekly patterns / day schedules
// ---------------------------------------------------------------------------

export interface DaySchedule {
  dayOfWeek: number;
  category: WorkoutCategory;
  preferredWorkoutIds?: string[];
  volumeModifier?: VolumeModifier;
  notes?: string;
}

export interface WeeklyPattern {
  phaseId: string;
  daysPerWeek: number;
  weekType: WeekType;
  schedule: DaySchedule[];
  notes?: string;
}

// ---------------------------------------------------------------------------
// Mileage progression / taper
// ---------------------------------------------------------------------------

export interface PeakMileageRule {
  type: 'multiplier_of_current' | 'absolute' | 'pct_of_target';
  value: number;
}

export interface MileageProgression {
  startMileagePctOfPeak: number;
  peakMileageRule: PeakMileageRule;
  maxWeeklyIncreasePct: number;
  cutbackEveryNWeeks: number;
  cutbackPct: number;
  longRunPctCap: number;
}

export interface Taper {
  durationWeeks: number;
  weeklyVolumePcts: number[];
  preserveIntensity: boolean;
  raceWeekSchedule: DaySchedule[];
  notes?: string;
}

// ---------------------------------------------------------------------------
// Recommendations / applicability / restrictions
// ---------------------------------------------------------------------------

export type StrengthCategory =
  | 'lower_compound'
  | 'lower_singleleg'
  | 'posterior'
  | 'calves'
  | 'eccentric'
  | 'core'
  | 'plyo'
  | 'mobility';

export interface StrengthRoutineOverrides {
  /** Cap the exercise count below the default for the race profile. */
  exerciseCap?: number;
  /** Restrict the routine to bodyweight movements (minimal/equipment-free). */
  bodyweightOnly?: boolean;
  /** Categories the method emphasizes — picked first when assembling. */
  emphasizeCategories?: StrengthCategory[];
}

export interface StrengthRecommendation {
  daysPerWeek: RangeMinMaxDefault;
  workoutIds: string[];
  philosophy: string;
  /** Optional per-method overrides for the parametric routine builder. */
  routineOverrides?: StrengthRoutineOverrides;
}

export interface CrossTrainingRecommendation {
  approvedModalities: string[];
  daysPerWeek: RangeMinMaxDefault;
  intensityGuidance: string;
}

export type ByDistance = Partial<Record<RaceDistance, ApplicabilityRating>>;
export type ByExperience = Partial<Record<ExperienceLevel, ApplicabilityRating>>;
export type ByTerrain = Partial<Record<Terrain, ApplicabilityRating>>;

export interface Applicability {
  byDistance: ByDistance;
  byExperience: ByExperience;
  byTerrain: ByTerrain;
  weeklyHoursRange?: RangeMinMax;
  daysPerWeekRange?: RangeWithIdeal;
}

export interface Restriction {
  type: RestrictionType;
  rule: string;
  blocking: boolean;
  suggestedAlternativeId?: string;
  warningMessage?: string;
}

// ---------------------------------------------------------------------------
// Generation rules
// ---------------------------------------------------------------------------

export interface GenerationRules {
  defaultPlanWeeks: number;
  supportedPlanWeeks: number[];
  qualityWorkoutsPerWeek: RangeMinMaxDefault;
  minDaysBetweenHardSessions: number;
  allowsDoubles: boolean;
  compressionPriority: string[];
  expansionPriority: string[];
  invariants?: string[];
}

// ---------------------------------------------------------------------------
// Top-level
// ---------------------------------------------------------------------------

export interface TrainingMethod {
  id: string;
  name: string;
  coach: string;
  yearOfOrigin: number;
  keyBook: string;
  citations: Citation[];
  description: string;
  signature: string;
  philosophyNarrative: string;
  primaryAnchor: AnchorType;
  fallbackAnchor: AnchorType;
  paceZones: PaceZone[];
  workouts: Workout[];
  phases: Phase[];
  weeklyPatterns: WeeklyPattern[];
  mileageProgression: MileageProgression;
  taper: Taper;
  strengthRecommendation: StrengthRecommendation;
  crossTrainingRecommendation: CrossTrainingRecommendation;
  applicability: Applicability;
  restrictions: Restriction[];
  generationRules: GenerationRules;
  schemaVersion: string;
  lastUpdated: string;
}
