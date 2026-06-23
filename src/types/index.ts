import type { GeneralGoal } from '../hooks/useOnboarding';

export type WorkoutType =
  | "strength"
  | "run"
  | "quality"
  | "long"
  | "cross"
  | "rest"
  | "limited"
  | "travel"
  | "race";

export type ViewId = "plan" | "summary" | "dashboard" | "zones" | "method" | "info" | "settings" | "coach" | "journal";

export interface StravaTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  athleteId: number;
  athleteName: string;
}

export interface StravaActivity {
  id: number;
  name: string;
  type: string;
  sport_type: string;
  distance: number;
  moving_time: number;
  elapsed_time: number;
  total_elevation_gain: number;
  average_heartrate?: number;
  max_heartrate?: number;
  average_cadence?: number;
  average_speed?: number;
  max_speed?: number;
  suffer_score?: number;
  calories?: number;
  elev_high?: number;
  elev_low?: number;
  start_date_local: string;
  start_date: string;
  splits_metric?: StravaSplit[];
  laps?: StravaLap[];
  device_name?: string;
  gear_id?: string;
  description?: string;
  // Power-meter fields — Strava populates these only on activities recorded
  // with a connected power meter (cycling activities almost exclusively).
  // Cycling MIM uses normalized > average > HR-reserve in priority order.
  average_watts?: number;
  weighted_average_watts?: number;
  device_watts?: boolean;
}

export interface StravaSplit {
  distance: number;
  elapsed_time: number;
  moving_time: number;
  average_heartrate?: number;
  average_speed: number;
  elevation_difference: number;
  split: number;
}

export interface StravaLap {
  name: string;
  distance: number;
  moving_time: number;
  elapsed_time: number;
  average_heartrate?: number;
  max_heartrate?: number;
  average_cadence?: number;
  average_speed: number;
  total_elevation_gain: number;
  lap_index: number;
}

export interface HRZone {
  zone: string;
  hr: string;
  pct: string;
  desc: string;
}

export interface PlannedDay {
  day: string;
  type: WorkoutType;
  workout: string;
  detail: string;
  zone: string;
  route: string;
  time: string;
  actual?: ActualWorkout;
  /** Other Garmin activities recorded the same day that aren't the primary
   *  match. Common when the user does multiple sessions in a day (e.g.
   *  morning warm-up walk + evening strength). UI can surface these so
   *  nothing recorded silently disappears. Excludes sync-stub activities
   *  under 2 min. */
  secondaryActuals?: ActualWorkout[];
  /** Structured, personalized workout attached by the plan-generator engine.
   *  Optional — hand-authored legacy plans (mike-18k-plan, etc.) don't have
   *  this; UI should fall back to the flat `workout` / `detail` strings. */
  plannedWorkout?: import('../engines/planGenerator/types').PlannedWorkout;
  /** True on the one day each week chosen to carry the running-drills + Myrtl
   *  add-on (the first easy run of the week). Stamped by the plan generator so
   *  the UI doesn't need a hard-coded calendar of drill dates. */
  isDrillDay?: boolean;
}

/**
 * Structured targets derived from a PlannedDay's zone/detail/time strings.
 * Populated by `parsePlannedTargets()` — not hand-authored in plan data, so
 * the existing plan format (mike-18k-plan.ts) remains unchanged.
 */
export interface PlannedTargets {
  distanceMi?: number    // e.g. 3.0
  durationMin?: number   // e.g. 45 (total plan time incl. warmup/drills)
  // Estimated RUNNING-time range for run days (e.g. 32-38 min for a 3.0mi
  // easy run). When present, grader uses this instead of durationMin so
  // run duration isn't penalized for drill/warmup time not tracked in GPS.
  durationMinLow?: number
  durationMinHigh?: number
  hrLow?: number         // e.g. 108
  hrHigh?: number        // e.g. 148
  elevationFt?: number   // parsed from detail ("~760 ft gain")
  // Planned drill/warmup items — parsed from detail. When present, Drills
  // is graded as an extra compliance metric.
  drillItems?: string[]
}

export type ComplianceGrade = 'hit' | 'close' | 'miss' | 'skipped' | 'over' | 'na'

/**
 * Per-day compliance vs the parsed targets. Each metric is graded
 * independently so the UI can show 3-4 dots/bars per workout.
 */
export interface DayCompliance {
  date: string
  day: string
  workoutType: WorkoutType
  hasActual: boolean
  targets: PlannedTargets
  // Distance (miles)
  distanceActual?: number
  distancePct?: number     // actual / target (1.0 = exact)
  distanceGrade: ComplianceGrade
  // Duration (minutes, moving time)
  durationActual?: number
  durationPct?: number
  durationGrade: ComplianceGrade
  // Elevation (feet of vertical gain). Graded only when the planned
  // `detail` string carries a numeric target ("~760 ft gain") AND the
  // race is climby enough to make weekly vert tracking meaningful
  // (see utils/raceReadiness.shouldTrackVerticalGain).
  elevationActual?: number
  elevationPct?: number
  elevationGrade: ComplianceGrade
  // HR: time-in-zone % (from hrZoneSummary when available, avgHR fallback)
  hrInZonePct?: number     // 0-100
  hrAvg?: number
  hrGrade: ComplianceGrade
  // Raw zone distribution (seconds per zone 1..5) — for proportional bars
  hrZoneSummary?: { zone: number; seconds: number; lowHR?: number; highHR?: number }[]
  // Drills grade — 'hit' if completed, 'miss' if planned + not done, 'na' if not planned
  drillGrade: ComplianceGrade
  drillsPlanned: boolean
  drillsCompleted: boolean
  // Overall flag — any major miss?
  flagged: boolean
  flagReasons: string[]
}

export interface ActualWorkout {
  stravaId: number;
  garminId?: number;
  source?: 'strava' | 'garmin' | 'manual';
  distance: number;
  movingTime: number;
  elapsedTime: number;
  avgHR?: number;
  maxHR?: number;
  avgCadence?: number;
  avgSpeed?: number;
  maxSpeed?: number;
  sufferScore?: number;
  calories?: number;
  elevationGain: number;
  elevHigh?: number;
  elevLow?: number;
  type: string;
  name: string;
  startDate: string;
  notes?: string;
  rpe?: number;  // 1-10 Rate of Perceived Exertion (muscular + cardiovascular)
  strengthLog?: StrengthExerciseLog[];
  splits?: { split: number; pace: string; hr?: number; elev: number }[];
  laps?: { name: string; distance: number; pace: string; hr?: number; elev?: number }[];
  deviceName?: string;
  aerobicTE?: number;
  anaerobicTE?: number;
  epoc?: number;
  recoveryTimeHours?: number;
  vo2max?: number;
  hrZoneSummary?: { zone: number; seconds: number; lowHR?: number; highHR?: number }[];
  // Drills / warmup / cooldown that typically happen off-GPS. Logged manually.
  drills?: DrillLog;
}

export interface DrillLog {
  completed: boolean                       // did you do the drill block at all?
  items?: { name: string; done: boolean }[]  // per-item checkboxes (optional)
  durationMin?: number                     // optional manual entry — credited to total run time
  notes?: string
}

export interface StrengthExerciseLog {
  name: string;
  focus: "upper" | "lower" | "core" | "full";
  sets: StrengthSet[];
}

export interface StrengthSet {
  reps: number;
  weight: string;
  notes?: string;
}

export interface TrainingWeek {
  num: number;
  dates: string;
  miles: number | string;
  focus: string;
  days: PlannedDay[];
}

// ─── Structural plan edits (Coach + manual) ─────────────────────
// The plan is edited via an ordered op-log replayed over the immutable
// base plan (see usePlanEdits). One op = one add/delete/update at the day
// or week level. Strength edits (sets/reps/weight) ride inside an
// `updateDay` op's rewritten `detail` string — no dedicated op kind.

/** Fields of a planned day the coach/user may patch. `day` (the date
 *  label) and `actual` (logged data) are never edited this way. */
export type DayUpdates = Partial<Omit<PlannedDay, 'day' | 'actual' | 'secondaryActuals' | 'plannedWorkout'>>;

/** Week-level fields editable as a unit (focus text, weekly volume, dates). */
export type WeekUpdates = Partial<Pick<TrainingWeek, 'dates' | 'miles' | 'focus'>>;

export type PlanEditOp =
  | { kind: 'updateDay'; weekNum: number; dayIndex: number; updates: DayUpdates }
  | { kind: 'addDay'; weekNum: number; atIndex: number; day: PlannedDay }
  | { kind: 'deleteDay'; weekNum: number; dayIndex: number }
  | { kind: 'updateWeek'; weekNum: number; updates: WeekUpdates }
  | { kind: 'addWeek'; atNum: number; week: TrainingWeek }
  | { kind: 'deleteWeek'; weekNum: number };

/** A single op as proposed by the coach, with its own one-line rationale. */
export interface PlanEditOpInput {
  op: PlanEditOp;
  rationale?: string;
}

/** A persisted edit: one op, tagged with the batch it was applied in so a
 *  whole coach proposal can be undone as a unit. */
export interface PlanEdit {
  id: string;
  batchId: string;
  op: PlanEditOp;
  rationale?: string;
  appliedAt: number;
}

export interface RaceInfo {
  name: string;
  date: string;
  startTime: string;
  distance: string;
  distanceMiles: number;
  elevation: string;
  /** Structured total vertical gain (feet) for the race. Populated from the
   *  onboarding `elevationGainFt` or parsed from the free-text description.
   *  Drives the climbing/descending prescription (R1). Undefined when unknown. */
  elevationGainFt?: number;
  elevationRange: string;
  course: string;
  cutoff: string;
  landmarks: { segment: string; description: string }[];
  gear: { item: string; required: boolean }[];
  nutrition: string;
  /** Athlete's free-text description of the race/event (terrain, elevation,
   *  climate, context) from onboarding. The coach reads it on every surface. */
  description?: string;
  /** Athlete's free-text goal/target for the race/event, from onboarding. */
  athleteGoal?: string;
  loriNote?: string;
  /** Sprint 5 — race-day coordinates. Drives the Open-Meteo Forecast +
   *  Archive calls (14-day forecast as race approaches, 10-year typical
   *  conditions for the race date). Optional so legacy plans without
   *  coordinates keep loading; weather features no-op when absent. */
  coordinates?: {
    latitude: number;
    longitude: number;
    /** Approximate elevation in meters above sea level. Used to label
     *  the forecast as "altitude" when relevant (>2000m). */
    elevationMeters?: number;
    /** Human-readable label like "Palisades Tahoe, CA" — surfaced in
     *  the RaceConditionsForecast card. */
    label?: string;
  };
}

export interface AthleteProfile {
  name: string;
  maxHR: number;
  currentBase: string;
  weeklyStructure: string;
  // Functional Threshold Power (watts) — 1-hour max sustainable cycling power.
  // Used as the denominator of Intensity Factor (IF = NP / FTP) for the
  // cycling MIM formula. Optional; HR-reserve fallback applies when absent
  // or when an activity has no power data.
  ftpWatts?: number;
  // Equipment / terrain the athlete has access to (from onboarding). Surfaces
  // to the coach so it can recommend appropriate venues for intervals, hill
  // work, indoor swaps, and strength routines.
  equipmentAccess?: readonly string[];
  // ── R7: structured individualization (all optional). The backend derives a
  // binding ATHLETE_PROFILE_DIRECTIVE from these; the readiness engine (R8)
  // also tunes by age/experience. Absent fields → the coach makes no claim. ──
  /** ISO 'YYYY-MM-DD'. Age is computed on read so it never goes stale. */
  birthDate?: string;
  sex?: 'male' | 'female' | 'other';
  weightLb?: number;
  /** Total height in inches (the profile editor edits it as feet + inches). */
  heightIn?: number;
  /** Persisted from onboarding so the coach can tune progression/recovery. */
  experienceLevel?: 'first_timer' | 'beginner' | 'intermediate' | 'advanced' | 'elite';
  trainingAgeYears?: number;
  /** Structured injury history — the coach avoids loading active/chronic regions. */
  injuryHistory?: { region: string; status: 'active' | 'chronic' | 'resolved'; note?: string }[];
  /** The 'why' behind training (race facts live in RaceInfo). */
  goals?: { text: string; priority?: 'primary' | 'secondary' }[];
}

/**
 * An honest, plan-level note surfaced to the athlete: feasibility of the goal,
 * how tight the runway is, whether paces are goal-derived (no recent result),
 * cross-distance pace extrapolation, etc. Computed by the feasibility module
 * (`src/engines/planGenerator/feasibility.ts`) and attached to the plan + shown
 * at the decision point (MethodSelection) and on the plan/coach surfaces.
 */
export interface PlanAdvisory {
  /** Stable id so the UI can de-dupe / dismiss (e.g. 'runway', 'goal_ambitious'). */
  id: string;
  /** Drives tone: info (neutral fact), caution (notable gap), critical (likely wrong). */
  severity: 'info' | 'caution' | 'critical';
  /** Short headline, e.g. "Tight runway" or "Ambitious goal". */
  title: string;
  /** One- or two-sentence plain-language explanation. */
  detail: string;
  /** Optional concrete, realistic alternative the athlete can act on. */
  suggestion?: string;
}

export interface TrainingPlan {
  athlete: AthleteProfile;
  weeks: TrainingWeek[];
  zones: HRZone[];
  race: RaceInfo;
  /** Set only by the General Fitness engine (raceType === 'general'). Marks
   *  this as a goal-based, method-less plan and carries which goal preset was
   *  chosen, so downstream content (workout coaching, methodology pages) can
   *  swap race/mountain copy for goal-appropriate, general-fitness copy.
   *  Absent on trail/hyrox/hand-authored plans. */
  generalGoal?: GeneralGoal;
  /** Honest, plan-level notes (feasibility, runway, goal-derived paces). Surfaced
   *  at method selection and on the plan/coach surfaces. Empty/absent = no concerns. */
  advisories?: PlanAdvisory[];
}

export interface WorkoutStyle {
  bg: string;
  border: string;
  label: string;
}

// ─── Garmin Health Data Types ───────────────────────────────────

export interface HRVData {
  weeklyAvg: number;       // RMSSD in ms
  lastNightAvg: number;    // last night's RMSSD in ms
  status: string;          // Garmin status: 'BALANCED' | 'LOW' | 'UNBALANCED' etc.
}

export interface SleepData {
  durationSeconds: number;
  quality: string;         // 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR'
  deepSeconds: number;
  remSeconds: number;
  lightSeconds: number;
  awakeSeconds: number;
  score?: number;          // 0-100 if available
}

export interface BodyBatteryData {
  highest: number;   // 0-100
  lowest: number;
  current: number;
  charged: number;
  drained: number;
}

export interface GarminHealthData {
  date: string;            // YYYY-MM-DD
  hrv?: HRVData;
  rhr?: number;            // resting heart rate bpm
  sleep?: SleepData;
  bodyBattery?: BodyBatteryData;
}

export interface GarminActivity {
  date: string;
  activityId?: number;     // Garmin's stable per-activity id (used to de-dupe on merge)
  type: string;            // Garmin activity type string
  name: string;
  durationMinutes: number;
  avgHR?: number;
  maxHR?: number;
  elevationGainFt: number;
  distanceMi?: number;
  trainingEffect?: number;          // Garmin aerobic TE (0-5.0)
  anaerobicTrainingEffect?: number; // Garmin anaerobic TE (0-5.0)
  activityTrainingLoad?: number;    // Garmin EPOC-based training load
  calories?: number;
  vigorousIntensityMinutes?: number;
  moderateIntensityMinutes?: number;
  // Power fields populated for cycling activities recorded with a power
  // meter. Used by cycling MIM in the same priority as Strava's fields.
  avgPowerW?: number;
  normalizedPowerW?: number;
}

export interface GarminHRZone {
  zoneNumber: number
  zoneLowBoundary: number
  secsInZone: number
}

export interface GarminExerciseSet {
  exerciseName: string
  category: string
  setType: string
  repetitionCount?: number
  weight?: number
  duration?: number
}

export interface GarminSplit {
  distance?: number       // meters
  duration?: number       // seconds
  averageHR?: number
  maxHR?: number
  averageSpeed?: number   // m/s
  elevationGain?: number  // meters
  splitType?: string      // "INTERVAL_ACTIVE", "INTERVAL_REST", etc.
}

export interface GarminActivityDetail {
  activityId: number
  name: string
  type: string
  startTimeLocal: string
  durationSeconds: number
  movingDurationSeconds: number
  averageHR?: number
  maxHR?: number
  distanceMeters: number
  elevationGainMeters: number
  elevationLossMeters: number
  aerobicTrainingEffect?: number
  anaerobicTrainingEffect?: number
  trainingEffectLabel?: string
  activityTrainingLoad?: number
  calories: number
  activeCalories?: number
  vO2MaxValue?: number
  recoveryTime?: number
  moderateIntensityMinutes?: number
  vigorousIntensityMinutes?: number
  hrZones?: GarminHRZone[]
  exerciseSets?: GarminExerciseSet[]
  splits?: GarminSplit[]
  averageSpeed?: number
  maxSpeed?: number
}

export interface GarminConnectionState {
  connected: boolean;
  lastSync: string | null;
  dataRange: { from: string; to: string } | null;
}

// ─── Readiness Engine Types (ATE-aligned) ─────────────────────────

export type ReadinessStatus = "PEAK" | "GREEN" | "YELLOW" | "RED";

export type TrainingState = "A" | "B" | "C" | "D";

export interface ReadinessScoreComponents {
  hrv: number;             // -1 to +2 (ATE bucket score)
  rhr: number;             // -1 to +2
  sleep: number;           // -1 to +2
  trainingLoad: number;    // -1 to +2
}

export interface ReadinessScore {
  date: string;
  composite: number;       // ATE scale: -2.0 to +2.0
  displayScore: number;    // UI scale: 0-100 (mapped from composite)
  status: ReadinessStatus;
  trainingState: TrainingState;
  components: ReadinessScoreComponents;
  message: string;         // conversational "AI coach" style interpretation
  adjustment?: string;     // workout modification suggestion
  acwr?: number;           // for guardrail visibility
  guardrailsTriggered?: string[];  // which guardrails fired
}

export interface TrainingStateInfo {
  state: TrainingState;
  consecutiveRedDays: number;
  stateDDurationDays: number;
  medicalFlagLevel: "none" | "info" | "warning" | "critical";
}

export interface DeloadDay {
  dayNumber: number;       // 1-7
  intensityCap: number;    // 0, 0.6, 0.7, 0.5
  maxMinutes: number;      // 0, 35, 45, 0 (reassess)
  zoneLimit: string;       // "rest", "Z1", "Z1-2", "reassess"
  description: string;
}

export interface Baseline {
  mean: number;
  stdDev: number;
  sampleSize: number;
}

export interface ReadinessBaselines {
  lnRmssd: Baseline;
  rhr: Baseline;
  sleepDuration: Baseline;
  sleepScore: Baseline;
  dailyTrimp: Baseline;
}

// ─── TRIMP & Training Load Types ────────────────────────────────

export type SportType =
  | "running"
  | "trail_running"
  | "running_steep"
  | "cycling"
  | "ebike"
  | "mountain_biking"
  | "hiking"
  | "hiking_steep"
  | "walking"
  | "swimming"
  | "lap_swimming"
  | "aqua_jogging"
  | "strength_upper"
  | "strength_lower"
  | "strength_full"
  | "hiit"
  | "cardio"
  | "elliptical"
  | "rowing"
  | "indoor_rowing"
  | "yoga"
  | "pilates"
  | "breathwork"
  | "myrtl"
  | "running_drills"
  | "other";

/**
 * Source of the Intensity Factor used to derive an activity's MIM.
 *   power      — IF = NormalizedPower / FTP (or avgPower / FTP)
 *   hr_reserve — IF = (avgHR - rHR) / (mHR - rHR), the Banister fHR
 *   grade      — hiking MIM derived from avg grade (no IF involved)
 *   static     — fixed lookup, no intensity input
 */
/**
 * `grade`     = MIM derived from activity-average grade (single elev_gain
 *               / distance number). Cheap, ignores within-activity variance.
 * `grade_gps` = MIM derived from per-second GPS altitude+distance via
 *               `computeWholeActivityGAP` — captures peaks the average
 *               smooths out (hill repeats, technical descents).
 */
export type IFSource = 'power' | 'hr_reserve' | 'grade' | 'grade_gps' | 'static'

export interface TRIMPRecord {
  date: string;
  activityName: string;
  sportType: SportType;
  baseTRIMP: number;
  sportMultiplier: number;
  elevationBonus: number;
  adjustedTRIMP: number;
  // Intensity Factor (or grade-derived multiplier input) used to compute
  // sportMultiplier. Present for cycling and hiking when a dynamic MIM
  // was applied; absent for sports that still use a static MIM.
  intensityFactor?: number;
  ifSource?: IFSource;
  /** When ifSource='static' for a dynamic-capable sport, explains which
   *  inputs the engine had vs missed. Used by WorkoutModal's diagnostic. */
  staticReason?: string;
}

export interface DailyTRIMP {
  date: string;
  total: number;           // sum of adjustedTRIMP for all activities
  records: TRIMPRecord[];
}

// ─── Performance Model Types (Banister) ─────────────────────────

export interface PerformanceMetrics {
  date: string;
  ctl: number;             // chronic training load (fitness) — 42-day EWMA
  atl: number;             // acute training load (fatigue) — 7-day EWMA
  tsb: number;             // training stress balance (form) — CTL - ATL
  acwr: number;            // acute:chronic workload ratio — ATL / CTL
}

export type TSBState =
  | "peaked"         // +15 to +25
  | "well_rested"    // +5 to +15
  | "productive"     // -10 to +5
  | "overreaching"   // -30 to -10
  | "danger";        // < -30

export type ACWRRisk =
  | "detraining"     // < 0.8
  | "sweet_spot"     // 0.8 - 1.3
  | "caution"        // 1.3 - 1.5
  | "high_risk";     // > 1.5

export interface WeeklyRecommendation {
  type: "overreaching" | "acwr_spike" | "acwr_low" | "ctl_plateau" | "taper_early" | "on_track" | "recovery_needed" | "hrv_unstable" | "weekly_trimp_overload" | "medical_flag";
  severity: "info" | "warning" | "alert";
  message: string;
  weekNum?: number;
}

// ─── AI Coach Types ─────────────────────────────────────────────

export type CoachTimeOfDay = 'morning' | 'evening'

export interface CoachRecommendation {
  timeOfDay: CoachTimeOfDay
  headline: string
  body: string
  sleepTarget?: string  // e.g., "8+ hours tonight"
  action?: CoachAction
  inputs: string[]  // which data points drove this (e.g., "HRV above baseline", "TSB -42")
}

export interface CoachAction {
  type: 'execute' | 'modify' | 'skip' | 'swap' | 'sleep_target' | 'propose_edit'
  label: string  // button label
  detail: string  // explanation
  swapFromIndex?: number
  swapToIndex?: number
  swapWeekNum?: number
  /** For 'propose_edit' actions: the batch of plan edits to apply. `ops`
   *  is the source of truth (length ≥ 1) and may include any structural
   *  op (add/delete/update at day or week level). The legacy
   *  `weekNum`/`dayIndex`/`updates` mirror is populated ONLY when the
   *  batch is a single `updateDay` op, so older single-edit UI/state code
   *  keeps working unchanged. */
  proposedEdit?: {
    ops: PlanEditOpInput[]
    rationale?: string
    weekNum?: number
    dayIndex?: number
    updates?: DayUpdates
  }
}

// ─── Phase B: Conversational Coach + proactive surfaces ─────────

export type CoachTurnRole = 'user' | 'assistant' | 'coach' | 'system-handoff'

export interface ConversationTurn {
  id: string
  role: CoachTurnRole
  content: string
  ts: number
  unread?: boolean
  trigger?: string  // set on role='coach' when produced by a ping
  /** Structured action parsed from message content (e.g. a `proposal`
   *  fenced block). Renders as an approve/reject card below the bubble. */
  action?: CoachAction
  /** UI state for inline actions: pending | applied | rejected. */
  actionStatus?: 'pending' | 'applied' | 'rejected'
  /** When an action has been applied, the persisted override id so the
   *  user can undo it. */
  actionOverrideId?: string
}

export interface PendingInference {
  id: string
  text: string
  sourceTurnId?: string
  proposedAt: number
}

export interface ConversationSummary {
  text: string
  throughTurnId: string
  ts: number
}

export interface CoachPersona {
  /** Display name, e.g. "Coach Chuck" */
  name: string
  /** Active personality trait keywords from the available set. */
  traits: string[]
}

/** Default coach name shown until the athlete renames it in Settings.
 *  Stored persona.name stays empty until renamed; this is the display fallback. */
export const DEFAULT_COACH_NAME = 'Mira'

/** Available trait chips for the persona picker. Each trait shapes the
 *  coach's voice via the system prompt. Multiple can be active. */
export const COACH_TRAITS = [
  { id: 'funny', label: 'Funny', emoji: '😄', desc: 'Uses humor and wit' },
  { id: 'strict', label: 'Strict', emoji: '🎯', desc: 'Holds you accountable' },
  { id: 'lighthearted', label: 'Light-hearted', emoji: '☀️', desc: 'Positive and breezy' },
  { id: 'demanding', label: 'Demanding', emoji: '💪', desc: 'Pushes you hard' },
  { id: 'motivational', label: 'Motivational', emoji: '📣', desc: 'Fires you up, believes in you' },
  { id: 'warm', label: 'Warm', emoji: '🤗', desc: 'Empathetic, supportive' },
  { id: 'direct', label: 'Direct', emoji: '⚡', desc: 'No fluff, straight talk' },
  { id: 'nerdy', label: 'Data Nerd', emoji: '🤓', desc: 'Loves numbers and research' },
  { id: 'old-school', label: 'Old School', emoji: '🧓', desc: 'Classic coaching wisdom' },
  { id: 'high-energy', label: 'High Energy', emoji: '🔥', desc: 'Pump-you-up vibes' },
  { id: 'chill', label: 'Chill', emoji: '🧘', desc: 'Calm, low-key approach' },
  { id: 'positive', label: 'Positive', emoji: '😊', desc: 'Upbeat, encouraging' },
  { id: 'relaxed', label: 'Relaxed', emoji: '😌', desc: 'Easygoing, no pressure' },
  { id: 'concise', label: 'Concise', emoji: '✂️', desc: 'Short and to the point' },
  { id: 'detailed', label: 'Detailed', emoji: '🔍', desc: 'Thorough, covers the why' },
  { id: 'bullets', label: 'Bullets', emoji: '📋', desc: 'Scannable lists' },
  { id: 'narrative', label: 'Narrative', emoji: '📝', desc: 'Flowing prose' },
] as const

/** Trait pairs that contradict each other — selecting one clears the
 *  other so the coach never gets opposing format/length instructions. */
export const COACH_TRAIT_EXCLUSIVE_GROUPS: readonly (readonly string[])[] = [
  ['concise', 'detailed'],
  ['bullets', 'narrative'],
] as const

// ---------------------------------------------------------------------------
// Platform personalization — "detail level" + display preferences.
//
// A single axis the athlete picks at onboarding and refines in Settings that
// drives how much data/jargon the whole app shows. A preset expands into a set
// of granular display flags; explicit per-flag and per-section overrides layer
// on top (overrides win). `balanced` is a no-op equal to today's behavior so
// existing users see no change until they opt in.
// ---------------------------------------------------------------------------

export type DetailLevel = 'simple' | 'balanced' | 'detailed'

export interface DisplayFlags {
  /** CTL/ATL vs Fitness/Fatigue. Mirrored to the legacy ba_show_technical_terms key. */
  showTechnicalNames: boolean
  /** EPOC, Aerobic/Anaerobic TE, IF/MIM source, ACWR internals, raw metric cards. */
  showAdvancedMetrics: boolean
  /** Extra chart series/overlays/toggles (CTL/ATL trend bands, load-mode toggle…). */
  showAdvancedCharts: boolean
  numericPrecision: 'low' | 'normal' | 'high'
  /** Depth of glossary / "what does this answer?" explanation blocks. */
  explanationVerbosity: 'high' | 'normal' | 'low'
}

/** Data-heavy units that can be hidden to declutter. Essentials (today's
 *  workout, race card, briefing, compliance grid) are intentionally absent so
 *  they can never be hidden into a broken empty screen. */
export type SectionId =
  | 'dash.descentCapacity'
  | 'dash.volume'
  | 'dash.tabReadiness'
  | 'dash.tabPerformance'
  | 'dash.performanceChart'
  | 'dash.trimpBreakdown'
  | 'dash.strengthProgress'
  | 'summary.perfSnapshot'
  | 'summary.whatChanged'
  | 'summary.trainingLoad'
  | 'summary.readinessTrend'

export interface DisplayPreferences {
  detailLevel: DetailLevel
  /** Sparse map of explicit per-flag overrides. Absent keys follow the preset. */
  overrides?: Partial<DisplayFlags>
  /** Sparse map of explicit show/hide. Absent keys follow the preset for the level. */
  sectionOverrides?: Partial<Record<SectionId, boolean>>
}

/** Customer-language options for the onboarding question + Settings picker. */
export const DETAIL_LEVELS: ReadonlyArray<{
  id: DetailLevel
  label: string
  emoji: string
  desc: string
}> = [
  { id: 'simple', label: 'Just the basics', emoji: '🌱', desc: 'Plain language, fewer numbers, more guidance. Great if you are new.' },
  { id: 'balanced', label: 'Balanced', emoji: '⚖️', desc: 'A clear mix of guidance and data. Recommended for most people.' },
  { id: 'detailed', label: 'Show me everything', emoji: '🔬', desc: 'Technical names, full precision, every chart and metric.' },
] as const

export const DETAIL_LEVEL_PRESETS: Record<DetailLevel, DisplayFlags> = {
  simple: { showTechnicalNames: false, showAdvancedMetrics: false, showAdvancedCharts: false, numericPrecision: 'low', explanationVerbosity: 'high' },
  balanced: { showTechnicalNames: false, showAdvancedMetrics: true, showAdvancedCharts: true, numericPrecision: 'normal', explanationVerbosity: 'normal' },
  detailed: { showTechnicalNames: true, showAdvancedMetrics: true, showAdvancedCharts: true, numericPrecision: 'high', explanationVerbosity: 'low' },
}

/** One-line directive injected into the coach snapshot so the AI Coach matches
 *  the athlete's preferred depth. */
export const DETAIL_DIRECTIVES: Record<DetailLevel, string> = {
  simple: 'The athlete prefers plain language. Avoid acronyms and raw numbers; explain in everyday terms, concrete and encouraging.',
  balanced: 'The athlete wants a clear mix of guidance and key numbers. Plain terms first, cite metrics sparingly when they matter.',
  detailed: 'The athlete is a data enthusiast. Use technical terms (CTL/ATL/TSB/ACWR), exact numbers, and deeper physiological reasoning freely.',
}

/** A conversation archived under a specific date so it can be reviewed
 *  later. Populated when the live conversation rolls over to a new day. */
export interface DailyChatArchive {
  /** YYYY-MM-DD of the day's activity */
  date: string
  /** Snapshot of the turns that belonged to that day */
  turns: ConversationTurn[]
  /** Short one-line preview generated from the last turn for the list */
  preview: string
  /** Total number of visible turns (excludes system-handoff) */
  turnCount: number
}

export interface AboutMeFact {
  /** Stable id assigned at creation. Used for edit/delete operations
   *  in the CoachMemoryPanel and for reconciling between client &
   *  server. */
  id: string
  text: string
  /** Unix ms — when this fact was first added. Inferences accepted
   *  silently from chat carry their original `proposedAt`. */
  learnedAt: number
  /** Last edit timestamp if the athlete tweaked the wording in the
   *  panel. Absent when the fact has never been edited. */
  editedAt?: number
  /** Id of the user turn that produced this fact, when known. Lets
   *  the panel link a fact back to the conversation that taught it. */
  sourceTurnId?: string
}

export interface CoachMemory {
  /** Canonical join of `aboutMeFacts` — the prompt builder reads this
   *  directly so it remains stable across the schema migration. Do NOT
   *  write to this field from the client; mutate `aboutMeFacts` instead
   *  and the server re-syncs the join. */
  aboutMe: string
  /** Sprint 4 structured About Me. Each fact carries a learnedAt
   *  timestamp + optional sourceTurnId for provenance. The legacy
   *  flat-string memory is migrated to this shape on first server
   *  read. */
  aboutMeFacts?: AboutMeFact[]
  conversation: ConversationTurn[]
  conversationSummary: ConversationSummary | null
  pendingInferences: PendingInference[]
  coachPersona?: CoachPersona
  /** Auto-archived daily conversations — accessible via the Coach
   *  history drawer. Newest first. */
  dailyArchives?: DailyChatArchive[]
  /** Sprint 4 — the moment the coach-athlete relationship started.
   *  Server stamps this on first memory load (using oldest turn /
   *  fact ts if available, otherwise current time). Drives the
   *  anniversary ping trigger. */
  athleteSinceMs?: number
}

export type CoachPingTriggerType =
  | 'new_workout'
  | 'readiness_shift'
  | 'skipped_workout'
  | 'weekly_recap'
  | 'weekly_arc'
  | 'hrv_drop'
  | 'acwr_spike'
  | 'compliance_drift'
  | 'anniversary'
  | 'weather_alert'

export interface CoachPingTrigger {
  type: CoachPingTriggerType
  payload?: Record<string, unknown>
}

// Client-assembled snapshot sent with every LLM call
export interface CoachSnapshotAnalytics {
  weekToDate: {
    miles: number
    durationSec: number
    trimp: number
    timeInZones: { z1: number; z2: number; z3: number; z4: number; z5: number }
  }
  last7dPerZone: {
    z1Sec: number
    z2Sec: number
    z3Sec: number
    z4Sec: number
    z5Sec: number
  }
  complianceSummary: {
    distancePct: number
    durationPct: number
    hrPct: number
    flagged: number
  }
  loadTrend: {
    ctl: number
    atl: number
    tsb: number
    acwr: number
    ctlDelta7d: number
  }
  raceProjection: {
    estimatedSeconds: number | null
    confidence: 'low' | 'med' | 'high'
    basis: string
  }
  planProgress: {
    weeksElapsed: number
    weeksRemaining: number
    onTrack: boolean
    reason: string
  }
}

/**
 * Compact, LLM-friendly view of raw Garmin health metrics. The readiness
 * engine already consumes the raw stream and emits a normalized component
 * score (-1 to +2), but that normalized number hides the actual hours /
 * bpm / ms the coach needs to speak in human terms ("you slept 6.2h").
 * So we pass a trimmed, serializable copy of the relevant fields through
 * to the LLM too.
 */
export interface CoachHealthToday {
  date: string                          // YYYY-MM-DD
  sleepHours?: number                   // total sleep in hours (1 decimal)
  sleepScore?: number                   // 0-100 if Garmin supplied it
  sleepQuality?: string                 // 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR'
  rhr?: number                          // resting HR bpm
  hrvLastNightMs?: number               // RMSSD last night
  hrvWeeklyAvgMs?: number               // RMSSD 7-day avg
  hrvStatus?: string                    // Garmin HRV status string
  bodyBatteryCurrent?: number           // 0-100
  bodyBatteryCharged?: number           // amount charged overnight
  bodyBatteryDrained?: number           // amount drained today
}

/**
 * Sprint 5 — weather block attached to the CoachSnapshot when race
 * coordinates exist. Drives the two-tier WARN/SWAP doctrine in
 * COACH_ROLE and the RaceConditionsForecast UI surface.
 *
 * Two locations: the `label`/`latitude`/`longitude` on this block is
 * the *training* location (athlete's home base, or the race location
 * when home is unset). `raceDay` carries forecast/climatology for the
 * race location, which may differ from training.
 */
export interface CoachWeatherBlock {
  /** Coordinates the daily forecast was fetched for. Equal to the
   *  athlete's configured home/training location when set; falls back
   *  to race coordinates otherwise. Surfaced as a label in the prompt
   *  so the coach mentions the place. */
  label: string
  latitude: number
  longitude: number
  /** ISO date when the forecast was last refreshed client-side. */
  fetchedAt: number
  /** True when the daily forecast was fetched from the athlete's
   *  configured home location (not race fallback). The prompt uses
   *  this to phrase the forecast as "where you train" vs. "race
   *  location" — different framing changes the recommendation. */
  isHomeLocation?: boolean
  /** Up to 14 days of daily-resolution forecast at the training
   *  location. */
  daily: Array<{
    date: string
    tempHighF: number
    tempLowF: number
    precipIn: number
    precipProbPct: number
    windMaxMph: number
    windGustMaxMph?: number
    weatherCode: number
    thunderRisk: boolean
    /** Pre-classified severity so the prompt can lean on the labels
     *  rather than reimplementing the thresholds. */
    severity: 'normal' | 'warn' | 'swap'
    reasons: string[]
  }>
  /** Hourly resolution for ~7 days at the training location. Lets the
   *  day-card chip show the forecast AT the athlete's training hour
   *  rather than the daily high — Oakland 7am is 55°F vs the 77°F
   *  daily peak. Empty array when the fetch didn't return hourly data.
   *  Pre-classified per-hour severity matches the daily array's
   *  format. */
  hourly?: Array<{
    time: string
    date: string
    hour: number
    tempF: number
    precipIn: number
    precipProbPct: number
    windMph: number
    weatherCode: number
    thunderRisk: boolean
    severity: 'normal' | 'warn' | 'swap'
    reasons: string[]
  }>
  /** Athlete's preferred training hour (0-23) propagated through the
   *  snapshot so the server prompt and any consumer can frame the
   *  per-hour forecast correctly. Absent when the athlete picked the
   *  "varies" option. */
  preferredHour?: number
  /** Race-day info. Present when race date is parseable. Carries
   *  race-location coordinates + climatology + (within 14 days) a live
   *  race-location forecast. */
  raceDay?: {
    /** ISO date (YYYY-MM-DD) of the race. */
    date: string
    /** Label for the race location (e.g. "Palisades Tahoe, CA"). May
     *  differ from the training-location label above. */
    label?: string
    /** True when race day is within the 14-day forecast window. */
    inForecastWindow: boolean
    /** 10-year aggregate (mean across past decade ± 2 days). Null when
     *  fetching the archive failed. */
    typical?: {
      meanHighF: number
      meanLowF: number
      meanPrecipIn: number
      precipDayFraction: number
      meanWindMph: number
      conditionsLabel: 'hot+dry' | 'hot+humid' | 'warm+dry' | 'warm+wet' | 'cool+wet' | 'cool+dry' | 'cold+wet' | 'cold+dry'
      yearsSampled: number
    }
    /** Live single-day forecast at the race coordinates. Populated
     *  when race day is within 14 days. Distinct from the training-
     *  location daily block above. */
    forecast?: {
      tempHighF: number
      tempLowF: number
      precipIn: number
      precipProbPct: number
      windMaxMph: number
      weatherCode: number
      thunderRisk: boolean
    }
  }
}

export interface CoachSnapshot {
  today: { date: string; period?: 'morning' | 'evening' }
  currentWeekNum?: number
  readiness?: ReadinessScore | null
  performance?: PerformanceMetrics | null
  /** Raw-ish health metrics for today (hours/bpm/ms) so the LLM can
   *  narrate sleep & recovery in natural units instead of the readiness
   *  engine's normalized bucket score. */
  todayHealth?: CoachHealthToday | null
  plannedToday?: PlannedDay | null
  plannedTomorrow?: PlannedDay | null
  /** Planned workouts for the next ~14 days (today + 13 more), one
   *  entry per planned day. Included by default so the coach can
   *  reason about the short-term schedule without being asked. */
  plannedUpcoming?: PlannedDay[]
  /** Exact plan coordinates (weekNum + dayIndex) for today / tomorrow, so
   *  the coach targets the right slot for a plan edit instead of inferring
   *  a day index from the weekday name. */
  todayCoord?: { weekNum: number; dayIndex: number; dayLabel: string } | null
  tomorrowCoord?: { weekNum: number; dayIndex: number; dayLabel: string } | null
  /** Full plan skeleton — every day across all 10 weeks as a compact
   *  one-line-per-day summary. Each day carries its (weekNum, dayIndex)
   *  plan coordinates for precise edit targeting. Only rendered on demand
   *  (triggered by keywords like "full plan", "all weeks") but the data is
   *  always present so the brief can map any date → coordinates. */
  fullPlan?: {
    weeks: { num: number; dates: string; miles: number | string; focus: string }[]
    days: { day: string; date?: string; type: string; workout: string; zone: string; weekNum: number; dayIndex: number }[]
  } | null
  recentActivities?: {
    startDate: string
    name: string
    distance: number
    movingTime: number
    avgHR?: number
    maxHR?: number
    elevationGain?: number
    rpe?: number
    /** Athlete's free-text note/comment on the workout (manual log, or a
     *  synced Strava description). The coach reads these as subjective signal. */
    notes?: string
    /** Per-lap/split breakdown (from Strava laps or Garmin splits). */
    laps?: { distance: number; movingTime: number; avgHR?: number; avgSpeed?: number; elev?: number }[]
    /** Time-in-zone breakdown (from Garmin activity detail). */
    hrZones?: { zone: number; seconds: number }[]
    /** Garmin training effects. */
    aerobicTE?: number
    anaerobicTE?: number
    vo2max?: number
  }[]
  recentSoreness?: { date: string; summary: string }[]
  /** Pre-computed direction of recent reported soreness so the coach states
   *  it correctly instead of inferring "trending up/down" from the raw
   *  levels above. `falling` = the athlete is recovering (soreness easing). */
  sorenessTrend?: {
    direction: 'rising' | 'falling' | 'flat'
    /** Any recent reported day at level 3+ (moderate-or-worse soreness). */
    elevated: boolean
    latestLevel: number | null
    /** Reported levels over the recent window, oldest→newest. */
    recent: { date: string; level: number }[]
  }
  /** The most recently completed planned day — the target of the
   *  post-workout debrief ping. Carries planned-vs-actual, the letter
   *  grade, and the athlete's subjective inputs (RPE + notes) so the coach
   *  can reconcile objective execution against how the session felt. `key`
   *  is a stable id the client uses to fire the debrief exactly once per
   *  completion (covers Strava / Garmin / manual logs). */
  lastCompletedWorkout?: {
    key: string
    dayLabel: string
    date: string
    weekNum: number
    dayIndex: number
    type: string
    plannedWorkout: string
    plannedDetail?: string
    plannedZone?: string
    plannedTime?: string
    grade?: { grade: string; score: number; reason: string } | null
    actual: {
      name?: string
      distance?: number
      movingTime?: number
      avgHR?: number
      maxHR?: number
      elevationGain?: number
      rpe?: number
      notes?: string
      drillNotes?: string
      aerobicTE?: number
      vo2max?: number
      hrZones?: { zone: number; seconds: number }[]
    }
  } | null
  /** Compact training-block framing — current phase, weeks to race, and the
   *  full phase arc — so proactive pings can situate a workout in the plan. */
  planBlocks?: {
    currentPhase?: string
    weeksToRace?: number
    phases: { label: string; weekStart: number; weekEnd: number }[]
  } | null
  athleteProfile?: AthleteProfile
  race?: RaceInfo
  /** When the plan is a General-Fitness goal (not a race), the chosen goal id
   *  and human label. Their presence tells the coach to drop race/taper/peak
   *  framing and endurance load-metric language for these athletes, and to
   *  speak to the goal (build muscle / lose fat / etc.) instead. */
  generalGoal?: string
  generalGoalLabel?: string
  /** Athlete's HR zone definitions from the plan — rendered dynamically
   *  in the Coach system prompt so each athlete gets their own zones. */
  zones?: HRZone[]
  analytics?: CoachSnapshotAnalytics
  /** Proactive injury risk flags from trend analysis — surfaced to the
   *  coach so it can raise concerns without waiting for the athlete to ask. */
  riskFlags?: { id: string; severity: 'watch' | 'warning' | 'alert'; title: string; message: string; metric?: string }[]
  /** Sprint 5 — 14-day weather forecast at the training location +
   *  race-day typical climate from a 10-year archive aggregate.
   *  Conditional: only attached when race coordinates exist on the
   *  active plan. The coach uses this to warn or propose indoor
   *  swaps during severe forecast windows, and to frame race-day
   *  expectations ("typically 72°F / dry / low wind for June 19"). */
  weatherForecast?: CoachWeatherBlock | null
  /** Per-exercise strength-progression summary — derived from
   *  `actual.strengthLog` across all logged weeks. Lets the coach
   *  acknowledge real progression ("you've added 5 lb to goblet squat
   *  over 2 weeks") and propose targeted weight/rep changes. Each entry
   *  carries the linear-progression suggested target so the coach can
   *  call out specific numbers without recomputing the math. */
  strengthProgression?: {
    name: string                                        // canonical/display name
    sessions: number                                     // total logged
    isBodyweight: boolean
    peakWeightLb: number
    weeksSinceFirst: number                              // breadth of trajectory
    firstSession: { weekNum: number; topWeightLb: number; avgReps: number; sets: number }
    latestSession: { weekNum: number; topWeightLb: number; avgReps: number; sets: number }
    suggestedTarget?: { weightLb: number; reps: number; sets: number; tier: 'progress' | 'hold' | 'deload' | 'starting'; rationale: string }
  }[]
  coachPersona?: CoachPersona | null
  /** The training philosophy the athlete is following (selected at
   *  onboarding, or the default assigned to a seed athlete). Lets the
   *  coach ground every plan edit in the athlete's chosen methodology
   *  instead of generic endurance doctrine. */
  methodology?: {
    methodName?: string
    methodCoach?: string
    methodKeyBook?: string
    methodPhilosophy?: string
  } | null
  /** The athlete's preferred detail level — drives how deep/technical the
   *  coach's prose should be. */
  detailLevel?: DetailLevel
  /** One-line directive derived from detailLevel, ready for the system prompt. */
  detailLevelDirective?: string
  /** One-line injury context from onboarding (e.g. "coming back from a knee
   *  injury · cleared 1-2 weeks ago"). Lets the coach speak to the athlete's
   *  recovery without a wearable telling it. */
  injuryContext?: string
  /** One-line menopause context from onboarding (e.g. "in perimenopause ·
   *  managing hot flashes and sleep disruption"). Lets the coach tailor
   *  midlife training without medicalizing it. */
  menopauseContext?: string
  /** Honest plan advisories (feasibility, runway, goal-derived paces) summarized
   *  for the coach so the welcome letter acknowledges them plainly — e.g. "Tight
   *  runway: the race is ~3 weeks away, so the plan is compressed". Mirrors the
   *  PlanAdvisory list surfaced in the UI. */
  advisoriesContext?: string
  /** Fueling guidance for the race (R2) — carbohydrate g/hr target, gut-training,
   *  hydration — so the coach can give concrete fueling advice. Null/absent for
   *  short races that don't need per-hour fueling. */
  fuelingContext?: string
}

export interface CoachInsight {
  text: string
  tip?: string
  tone?: 'info' | 'heads_up' | 'flag'
  silent?: boolean
  generatedAt: number
  cached?: boolean
}

// --- Terrain Engine (PR-05) ----------------------------------------------
// Additive types per BA_Terrain_Descent_IT_Project_Plan_v1.0 §PR-05 and
// spec §6.1.1. Produced by computeTerrainProfile in
// src/engines/terrain/locomotion/gap.ts.

/**
 * One time-bucketed segment of an activity.
 *
 * `meanGradePct` is the average grade across the bucket as a signed
 * percentage (e.g. +12 for a 12 % climb, -8 for an 8 % descent).
 * `runMultiplier` is the Minetti-derived energy multiplier for that grade.
 */
export interface TerrainSegment {
  startSec: number
  endSec: number
  distanceM: number
  meanGradePct: number
  runMultiplier: number
  paceMps: number
  /** Populated by PR-06 from the cadence stream. */
  cadenceSpm?: number
  /** Run-vs-hike decision; populated by PR-06 from grade + cadence. */
  gait?: GaitDecision
  /** Discrete eccentric-load bucket (1–5) per the Vernillo / Peake scale.
   *  Populated by PR-08 from `meanGradePct`. See
   *  `src/engines/descent/eccentricBucket.ts` for boundaries. */
  eccentricBucket?: 1 | 2 | 3 | 4 | 5
}

/**
 * Forecast of DOMS-equivalent eccentric load at three time horizons after
 * an activity. Produced by `forecastDOMSWindow` (PR-11) and consumed by
 * Tomorrow's Forecast UI (PR-15) and Readiness Load dampening (PR-13).
 *
 * Each `forecastNh` value is in the same arbitrary units as
 * `EccentricDose.doseAU`. `doseAU` and `protectionFactor` are threaded
 * through so the UI can show the underlying inputs alongside the forecast.
 */
export interface DescentLoadForecast {
  forecast24h: number
  forecast48h: number
  forecast72h: number
  doseAU: number
  protectionFactor: number
}

/**
 * One eccentric (descent) bout's record, the input unit for repeated-bout
 * protection (PR-10). Persisted by the caller; the engine consumes a
 * window of recent records.
 */
export interface EccentricBoutRecord {
  /** ISO date (YYYY-MM-DD) of the activity. */
  date: string
  doseAU: number
}

/**
 * The result of evaluating repeated-bout protection on a window of
 * recent eccentric bouts. `protectionFactor` is the headline 0..maxP
 * value; downstream Readiness consumes it to dampen the load score.
 */
export interface RepeatedBoutState {
  recentBouts: readonly EccentricBoutRecord[]
  /** 0 to maxProtection (default 0.45 per Hyldahl 2017). */
  protectionFactor: number
  /** ISO date of the bout that produced peak protection, when > 0. */
  peakAt?: string
}

/**
 * Per-activity eccentric dose summary, produced by
 * `eccentricTrimpForActivity` (PR-09).
 *
 * `doseAU` is the headline number — arbitrary units, calibrated so a hard
 * BA Skyrace 23K race effort lands near 110 AU (spec §8.5). Downstream
 * engines (Readiness load dampening, DOMS forecast) read it directly.
 */
export interface EccentricDose {
  activityId: string
  doseAU: number
  /** Descent distance in metres bucketed by eccentric severity. */
  bucketHistogram: Record<1 | 2 | 3 | 4 | 5, number>
  /** Distance-weighted mean descent grade as a signed percentage. */
  meanDescentGrade: number
  descentDistanceM: number
}

/**
 * Run-vs-hike decision for one segment.
 *
 * `recommendedGait` is what the engine suggests based on grade alone (energy
 * crossover at +15 %; see `src/engines/terrain/locomotion/gait.ts`).
 * `actualGait` is inferred from the cadence stream when available; ambiguous
 * cadences (135 ≤ spm < 160) leave it `'unknown'` with `confidence: 0`.
 */
export interface GaitDecision {
  recommendedGait: 'run' | 'hike'
  actualGait: 'run' | 'hike' | 'unknown'
  /** Mean cadence (steps/min) over the bucket; null when no cadence stream. */
  cadenceSpm: number | null
  /** 0..1 confidence in the `actualGait` reading. */
  confidence: number
  reason: 'minetti-crossover' | 'user-override' | 'plan-prescribed'
}

/**
 * One bucket of the per-activity grade histogram. Bands tile the Minetti
 * domain `[-45 %, +45 %]` end-to-end with no gaps and no overlap.
 */
export interface GradeBand {
  lowerPct: number
  upperPct: number
  label: string
  distanceM: number
}

/**
 * Whole-activity terrain summary consumed by the Hill Load Dashboard,
 * Descent-Load Engine, and grounded LLM coach narration.
 */
export interface TerrainProfile {
  /** Equivalent flat-running distance for the activity's metabolic cost. */
  equivalentFlatDistanceM: number
  /** GAP expressed as seconds per kilometre of equivalent flat distance. */
  gapSecondsPerKm: number
  segments: TerrainSegment[]
  /** Cumulative metres climbed, derived from the smoothed altitude stream.
   *  Will differ from Strava's pre-summed `total_elevation_gain` by a few %
   *  because Strava uses its own noise-rejection threshold. */
  verticalGainM: number
  /** Cumulative metres descended; same caveat as `verticalGainM`. */
  verticalLossM: number
  gradeHistogramBands: GradeBand[]
}

