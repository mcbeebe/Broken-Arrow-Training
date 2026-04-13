import type { SportType, TRIMPRecord, DailyTRIMP, StravaActivity, GarminActivity } from '../types'

// ─── EPOC-Based Training Load ───────────────────────────────────
// Excess Post-exercise Oxygen Consumption — the metabolic recovery debt
// created by an activity. More accurate than Banister TRIMP for mixed
// training (especially strength, HIIT, and trail running) because it
// captures anaerobic cost and the exponential intensity–recovery relationship.
//
// Based on: Borsheim & Bahr (2003), LaForgia et al. (2006), Swain et al. (1998)
//
// Model:
//   %HRR = (avgHR - restHR) / (maxHR - restHR)  ≈ %VO2max (Swain)
//   VO2_exercise = VO2max_est × %HRR              (mL/kg/min)
//   excess_VO2   = (VO2_exercise - 3.5) × duration (mL O₂/kg above 1 MET)
//   EPOC         = excess_VO2 × α × e^(β × %HRR)  (recovery debt in mL O₂/kg)
//
// Constants α=0.045, β=1.35 calibrated against literature ranges:
//   Low intensity  (~30% HRR):  EPOC ≈ 6-15 mL O₂/kg
//   Moderate       (~60% HRR):  EPOC ≈ 15-35 mL O₂/kg
//   High           (~85%+ HRR): EPOC ≈ 50-100+ mL O₂/kg

const ESTIMATED_VO2MAX = 45 // mL/kg/min — trained recreational athlete
const RESTING_VO2 = 3.5     // 1 MET baseline (mL/kg/min)
const EPOC_ALPHA = 0.045     // scaling constant
const EPOC_BETA = 1.35       // exponential intensity coefficient

export function calculateEPOC(
  durationMinutes: number,
  avgHR: number,
  restingHR: number,
  maxHR: number,
): number {
  if (durationMinutes <= 0 || avgHR <= restingHR || maxHR <= restingHR) return 0

  // Heart rate reserve fraction ≈ %VO2max (Swain et al. 1998)
  const hrr = Math.min(Math.max((avgHR - restingHR) / (maxHR - restingHR), 0), 1)

  // Estimate VO2 during exercise
  const vo2Exercise = ESTIMATED_VO2MAX * hrr // mL/kg/min
  const excessVO2Rate = Math.max(vo2Exercise - RESTING_VO2, 0)

  // Total excess oxygen cost during exercise (mL O₂/kg)
  const exerciseO2Cost = excessVO2Rate * durationMinutes

  // EPOC: recovery debt scales exponentially with intensity
  // Higher intensity → disproportionately more recovery cost
  const epoc = exerciseO2Cost * EPOC_ALPHA * Math.exp(EPOC_BETA * hrr)

  return epoc // mL O₂/kg
}

// Legacy Banister TRIMP — kept for reference/comparison only
export function calculateBanisterTRIMP(
  durationMinutes: number,
  avgHR: number,
  restingHR: number,
  maxHR: number,
): number {
  if (durationMinutes <= 0 || avgHR <= restingHR || maxHR <= restingHR) return 0
  const deltaHR = Math.min(Math.max((avgHR - restingHR) / (maxHR - restingHR), 0), 1)
  return durationMinutes * deltaHR * 0.64 * Math.exp(1.92 * deltaHR)
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

// ─── Adjusted Training Load (EPOC-based) ────────────────────────
// adjusted_load = EPOC × sport_multiplier + elevation_bonus
// Sport multipliers adjust for musculoskeletal impact beyond metabolic cost
// Elevation bonus accounts for eccentric loading on descents and altitude stress

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
  const baseEPOC = calculateEPOC(durationMinutes, avgHR, restingHR, maxHR)
  const sportMultiplier = getSportMultiplier(sportType)
  const elevationBonus = calculateElevationBonus(elevationGainFt)
  const adjustedLoad = baseEPOC * sportMultiplier + elevationBonus

  return {
    date,
    activityName,
    sportType,
    baseTRIMP: Math.round(baseEPOC * 10) / 10,
    sportMultiplier,
    elevationBonus: Math.round(elevationBonus * 10) / 10,
    adjustedTRIMP: Math.round(adjustedLoad * 10) / 10,
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
