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

export type ViewId = "plan" | "summary" | "dashboard" | "zones" | "method" | "info" | "settings";

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
  laps?: { name: string; distance: number; pace: string; hr?: number }[];
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
  loriNote: string;
}

export interface AthleteProfile {
  name: string;
  maxHR: number;
  currentBase: string;
  weeklyStructure: string;
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
  trainingEffect?: number;          // Garmin aerobic TE (0-5.0)
  anaerobicTrainingEffect?: number; // Garmin anaerobic TE (0-5.0)
  activityTrainingLoad?: number;    // Garmin EPOC-based training load
  calories?: number;
  vigorousIntensityMinutes?: number;
  moderateIntensityMinutes?: number;
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
  splits?: unknown
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
  | "cycling"
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

export interface TRIMPRecord {
  date: string;
  activityName: string;
  sportType: SportType;
  baseTRIMP: number;
  sportMultiplier: number;
  elevationBonus: number;
  adjustedTRIMP: number;
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
  type: 'execute' | 'modify' | 'skip' | 'swap' | 'sleep_target'
  label: string  // button label
  detail: string  // explanation
  swapFromIndex?: number
  swapToIndex?: number
  swapWeekNum?: number
}
