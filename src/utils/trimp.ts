import type { SportType, TRIMPRecord, DailyTRIMP, StravaActivity, GarminActivity } from '../types'

// ─── Banister TRIMP Formula ─────────────────────────────────────
// TRIMP = duration(min) x ΔHR_ratio x 0.64 x e^(1.92 x ΔHR_ratio)
// Male coefficients (Banister 1991). ΔHR_ratio = (avgHR - restHR) / (maxHR - restHR)

export function calculateBanisterTRIMP(
  durationMinutes: number,
  avgHR: number,
  restingHR: number,
  maxHR: number,
): number {
  if (durationMinutes <= 0 || avgHR <= restingHR || maxHR <= restingHR) return 0

  const deltaHR = (avgHR - restingHR) / (maxHR - restingHR)
  // Clamp deltaHR to [0, 1] to avoid extreme exponential blowup
  const clampedDelta = Math.min(Math.max(deltaHR, 0), 1)

  return durationMinutes * clampedDelta * 0.64 * Math.exp(1.92 * clampedDelta)
}

// ─── Sport Multipliers ──────────────────────────────────────────
// Adjusts raw TRIMP for musculoskeletal impact relative to running (1.0x baseline)

const SPORT_MULTIPLIERS: Record<SportType, number> = {
  running: 1.0,
  trail_running: 1.05,
  cycling: 0.70,
  hiking: 1.10,
  swimming: 0.50,
  strength_training: 0.80,
  yoga: 0.20,
  walking: 0.30,
  elliptical: 0.60,
  other: 0.60,
}

export function getSportMultiplier(sportType: SportType): number {
  return SPORT_MULTIPLIERS[sportType] ?? 0.60
}

// ─── Map activity type strings to SportType ─────────────────────

const TYPE_MAP: Record<string, SportType> = {
  // Strava types
  run: 'running',
  trail_run: 'trail_running',
  ride: 'cycling',
  virtualride: 'cycling',
  swim: 'swimming',
  hike: 'hiking',
  walk: 'walking',
  yoga: 'yoga',
  weighttraining: 'strength_training',
  workout: 'strength_training',
  elliptical: 'elliptical',
  rowing: 'elliptical',
  // Garmin types
  running: 'running',
  trail_running: 'trail_running',
  cycling: 'cycling',
  hiking: 'hiking',
  swimming: 'swimming',
  strength_training: 'strength_training',
  walking: 'walking',
  indoor_rowing: 'elliptical',
  // Catch-alls
  other: 'other',
}

export function mapToSportType(rawType: string): SportType {
  const normalized = rawType.toLowerCase().replace(/\s+/g, '')
  return TYPE_MAP[normalized] ?? 'other'
}

// ─── Elevation Bonus ────────────────────────────────────────────
// Per Johnston/Uphill Athlete: +10 TRIMP per 1,000 ft elevation gain

export function calculateElevationBonus(elevationGainFt: number): number {
  if (elevationGainFt <= 0) return 0
  return (elevationGainFt / 1000) * 10
}

// ─── Adjusted TRIMP ─────────────────────────────────────────────
// adjusted_TRIMP = raw_TRIMP x sport_multiplier + elevation_bonus

export function calculateAdjustedTRIMP(
  durationMinutes: number,
  avgHR: number,
  restingHR: number,
  maxHR: number,
  sportType: SportType,
  elevationGainFt: number,
  activityName: string,
  date: string,
): TRIMPRecord {
  const baseTRIMP = calculateBanisterTRIMP(durationMinutes, avgHR, restingHR, maxHR)
  const sportMultiplier = getSportMultiplier(sportType)
  const elevationBonus = calculateElevationBonus(elevationGainFt)
  const adjustedTRIMP = baseTRIMP * sportMultiplier + elevationBonus

  return {
    date,
    activityName,
    sportType,
    baseTRIMP: Math.round(baseTRIMP * 10) / 10,
    sportMultiplier,
    elevationBonus: Math.round(elevationBonus * 10) / 10,
    adjustedTRIMP: Math.round(adjustedTRIMP * 10) / 10,
  }
}

// ─── Convert activities to TRIMP records ────────────────────────

export function stravaActivityToTRIMP(
  activity: StravaActivity,
  restingHR: number,
  maxHR: number,
): TRIMPRecord | null {
  if (!activity.average_heartrate) return null

  const sportType = mapToSportType(activity.sport_type || activity.type)
  const durationMinutes = activity.moving_time / 60
  const elevationFt = activity.total_elevation_gain * 3.28084

  return calculateAdjustedTRIMP(
    durationMinutes,
    activity.average_heartrate,
    restingHR,
    maxHR,
    sportType,
    elevationFt,
    activity.name,
    activity.start_date_local.slice(0, 10),
  )
}

export function garminActivityToTRIMP(
  activity: GarminActivity,
  restingHR: number,
  maxHR: number,
): TRIMPRecord | null {
  if (!activity.avgHR) return null

  const sportType = mapToSportType(activity.type)

  return calculateAdjustedTRIMP(
    activity.durationMinutes,
    activity.avgHR,
    restingHR,
    maxHR,
    sportType,
    activity.elevationGainFt,
    activity.name,
    activity.date,
  )
}

// ─── Aggregate daily TRIMP ──────────────────────────────────────

export function aggregateDailyTRIMP(records: TRIMPRecord[]): DailyTRIMP[] {
  const byDate = new Map<string, TRIMPRecord[]>()

  for (const r of records) {
    const existing = byDate.get(r.date) || []
    existing.push(r)
    byDate.set(r.date, existing)
  }

  return Array.from(byDate.entries())
    .map(([date, recs]) => ({
      date,
      total: Math.round(recs.reduce((sum, r) => sum + r.adjustedTRIMP, 0) * 10) / 10,
      records: recs,
    }))
    .sort((a, b) => a.date.localeCompare(b.date))
}
