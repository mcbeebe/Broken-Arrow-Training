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
