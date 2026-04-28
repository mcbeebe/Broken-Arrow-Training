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

export type ViewId = "plan" | "summary" | "dashboard" | "zones" | "method" | "info" | "settings" | "coach";

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

export interface RaceInfo {
  name: string;
  date: string;
  startTime: string;
  distance: string;
  distanceMiles: number;
  elevation: string;
  elevationRange: string;
  course: string;
  cutoff: string;
  landmarks: { segment: string; description: string }[];
  gear: { item: string; required: boolean }[];
  nutrition: string;
  loriNote?: string;
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
}

export interface TrainingPlan {
  athlete: AthleteProfile;
  weeks: TrainingWeek[];
  zones: HRZone[];
  race: RaceInfo;
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
  /** For 'propose_edit' actions: which day to modify and what to change. */
  proposedEdit?: {
    weekNum: number
    dayIndex: number
    updates: Partial<Omit<PlannedDay, 'day' | 'actual'>>
    rationale?: string
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
] as const

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

export interface CoachMemory {
  aboutMe: string
  conversation: ConversationTurn[]
  conversationSummary: ConversationSummary | null
  pendingInferences: PendingInference[]
  coachPersona?: CoachPersona
  /** Auto-archived daily conversations — accessible via the Coach
   *  history drawer. Newest first. */
  dailyArchives?: DailyChatArchive[]
}

export type CoachPingTriggerType =
  | 'new_workout'
  | 'readiness_shift'
  | 'skipped_workout'
  | 'weekly_recap'

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

export interface CoachSnapshot {
  today: { date: string; period?: 'morning' | 'afternoon' | 'evening' }
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
  /** Full plan skeleton — every day across all 10 weeks as a compact
   *  one-line-per-day summary. Only included on demand (triggered by
   *  keywords like "full plan", "all weeks") because it doubles token
   *  use. */
  fullPlan?: {
    weeks: { num: number; dates: string; miles: number | string; focus: string }[]
    days: { day: string; date?: string; type: string; workout: string; zone: string }[]
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
  athleteProfile?: AthleteProfile
  race?: RaceInfo
  /** Athlete's HR zone definitions from the plan — rendered dynamically
   *  in the Coach system prompt so each athlete gets their own zones. */
  zones?: HRZone[]
  analytics?: CoachSnapshotAnalytics
  /** Proactive injury risk flags from trend analysis — surfaced to the
   *  coach so it can raise concerns without waiting for the athlete to ask. */
  riskFlags?: { id: string; severity: 'watch' | 'warning' | 'alert'; title: string; message: string; metric?: string }[]
  coachPersona?: CoachPersona | null
}

export interface CoachInsight {
  text: string
  tip?: string
  tone?: 'info' | 'heads_up' | 'flag'
  silent?: boolean
  generatedAt: number
  cached?: boolean
}

