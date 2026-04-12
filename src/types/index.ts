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

export type ViewId = "plan" | "zones" | "info" | "settings";

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
  start_date_local: string;
  start_date: string;
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
  elevationGain: number;
  type: string;
  name: string;
  startDate: string;
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
