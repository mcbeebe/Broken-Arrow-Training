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

export type ViewId = "plan" | "dashboard" | "zones" | "method" | "info" | "settings";

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

export interface ActualWorkout {
  stravaId: number;
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
  strengthLog?: StrengthExerciseLog[];
  splits?: { split: number; pace: string; hr?: number; elev: number }[];
  laps?: { name: string; distance: number; pace: string; hr?: number }[];
  deviceName?: string;
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
  trainingEffect?: number; // Garmin's TE value (0-5.0)
}

export interface GarminConnectionState {
  connected: boolean;
  lastSync: string | null;
  dataRange: { from: string; to: string } | null;
}

// ─── Readiness Engine Types ─────────────────────────────────────

export type ReadinessStatus = "GREEN" | "YELLOW" | "RED";

export interface ReadinessScoreComponents {
  hrv: number;             // 0-100
  rhr: number;             // 0-100
  sleep: number;           // 0-100
  trainingLoad: number;    // 0-100
}

export interface ReadinessScore {
  date: string;
  composite: number;       // 0-100 weighted sum
  status: ReadinessStatus;
  components: ReadinessScoreComponents;
  message: string;         // conversational "AI coach" style interpretation
  adjustment?: string;     // workout modification suggestion
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
  | "hiking"
  | "swimming"
  | "strength_training"
  | "yoga"
  | "walking"
  | "elliptical"
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
  type: "overreaching" | "acwr_spike" | "acwr_low" | "ctl_plateau" | "taper_early" | "on_track" | "recovery_needed" | "hrv_unstable";
  severity: "info" | "warning" | "alert";
  message: string;
  weekNum?: number;
}
