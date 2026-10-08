import { carbTargetForRaceMiles } from '../utils/fueling'
import { sanitizeRaceTimeSeconds, vdotFromRace } from '../engines/planGenerator/vdot'
import { predictRaceTime, RACE_PACE_SEARCH } from '../engines/planGenerator/feasibility'
import { parseTimeToSeconds } from '../utils/parseTime'
import { costRun, MINETTI_DOMAIN_MAX, MINETTI_DOMAIN_MIN } from '../engines/terrain/locomotion/minetti'

/**
 * Pure math behind the free public calculators (G10). These pages are the
 * acquisition funnel: same engines as the app — carbTargetForRaceMiles,
 * Daniels VDOT, Minetti grade cost — not marketing copies of them. (The
 * mileage planner's math is in mileageMath.ts, so these pages don't load it.) Zero
 * network, zero storage: everything below is a pure function of its inputs.
 */

// ── Trail fueling planner ───────────────────────────────────────

export interface FuelingPlan {
  gPerHour: number
  totalCarbsG: number
  gels: number            // 25 g-carb gel equivalents, total
  gutTrainingWeeks: string // when to start practicing
  caffeineNote: string
}

export function fuelingPlan(raceMiles: number, estFinishHours: number): FuelingPlan | null {
  if (!isFinite(raceMiles) || !isFinite(estFinishHours) || raceMiles <= 0 || estFinishHours <= 0) return null
  const gPerHour = carbTargetForRaceMiles(raceMiles)
  const totalCarbsG = Math.round(gPerHour * estFinishHours)
  return {
    gPerHour,
    totalCarbsG,
    gels: Math.ceil(totalCarbsG / 25),
    gutTrainingWeeks: '4–6 weeks out',
    caffeineNote: 'Caffeine 3–6 mg/kg, practiced in training first. Drink to thirst — no fixed hourly volume.',
  }
}

// ── Vert-adjusted finish predictor ──────────────────────────────

export interface FinishScenarios {
  /** The recent race time as read: "1:35" for a half is 1:35:00, not 95 s. */
  recentSeconds: number
  vdot: number
  flatSeconds: number
  vertMultiplier: number
  optimisticSeconds: number
  realisticSeconds: number
  conservativeSeconds: number
}

/**
 * Above every world record from 5K to the marathon (VDOT 85.3–85.6, men's). A
 * higher VDOT is a typo, most often kilometres typed into the miles field.
 */
export const MAX_VDOT = 86

/**
 * A finish time as typed, in seconds: the app's parser (h:mm:ss, m:ss, or
 * digits alone, since a phone keypad has no colon), plus the decimal seconds
 * chip results carry ("19:30.4") and a trailing colon left mid-typing.
 */
export function parseFinishTime(raw: string): number | null {
  const m = raw.trim().replace(/:$/, '').match(/^([\d:]+)(?:[.,](\d+))?$/)
  if (!m) return null
  const whole = parseTimeToSeconds(m[1])
  if (whole === undefined) return null
  return whole + (m[2] ? Number(`0.${m[2]}`) : 0)
}

/** Miles for display: "13.10" and "013.1" are 13.1. */
export function formatMiles(miles: number): string {
  return String(Math.round(miles * 100) / 100)
}

/**
 * Minetti out-and-back model: the course is approximated as half the
 * distance climbing at the mean grade and half descending it, and the
 * energy-cost ratio vs flat scales the athlete's VDOT-predicted flat time.
 * The optimistic band assumes strong descending recovers most of the
 * downhill cost; the conservative band adds a late-race fade.
 */
export function vertMultiplier(distanceMiles: number, vertFt: number): number {
  if (distanceMiles <= 0 || vertFt <= 0) return 1
  const distanceM = distanceMiles * 1609.344
  const vertM = vertFt * 0.3048
  const grade = Math.min(MINETTI_DOMAIN_MAX, Math.max(MINETTI_DOMAIN_MIN, vertM / (distanceM / 2)))
  const flat = costRun(0)
  return (costRun(grade) + costRun(-grade)) / (2 * flat)
}

export function finishScenarios(
  recentDistanceMiles: number,
  recentTimeSeconds: number,
  targetDistanceMiles: number,
  targetVertFt: number,
): FinishScenarios | null {
  if (![recentDistanceMiles, recentTimeSeconds, targetDistanceMiles, targetVertFt].every(Number.isFinite)) return null
  if (recentDistanceMiles <= 0 || recentTimeSeconds <= 0 || targetDistanceMiles <= 0 || targetVertFt < 0) return null
  // The app's own guard: a time faster than any human ("1:35" read as 95 s for
  // a half) is re-read as h:mm, and one still impossible after that is refused.
  const recentSeconds = sanitizeRaceTimeSeconds(recentTimeSeconds, recentDistanceMiles)
  if (recentSeconds === null || recentSeconds / recentDistanceMiles > RACE_PACE_SEARCH.slowest) return null
  const vdot = vdotFromRace({ distanceMiles: recentDistanceMiles, timeSeconds: recentSeconds })
  if (vdot <= 0 || vdot > MAX_VDOT) return null
  const flatSeconds = predictRaceTime(vdot, targetDistanceMiles)
  // Pinned at either end of the solver's search: the model has no answer here.
  const flatPace = flatSeconds / targetDistanceMiles
  if (flatPace <= RACE_PACE_SEARCH.fastest + 1 || flatPace >= RACE_PACE_SEARCH.slowest - 1) return null
  const mult = vertMultiplier(targetDistanceMiles, targetVertFt)
  return {
    recentSeconds,
    vdot: Math.round(vdot * 10) / 10,
    flatSeconds,
    vertMultiplier: Math.round(mult * 1000) / 1000,
    optimisticSeconds: Math.round(flatSeconds * (1 + 0.8 * (mult - 1))),
    realisticSeconds: Math.round(flatSeconds * mult),
    conservativeSeconds: Math.round(flatSeconds * mult * 1.08),
  }
}

export function formatHms(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
    : `${m}:${String(sec).padStart(2, '0')}`
}

// ── Race-day heat planner ───────────────────────────────────────

export interface HeatPlanStep {
  window: string
  action: string
}

export interface HeatPlan {
  hot: boolean
  steps: HeatPlanStep[]
  raceDayNote: string
}

function shiftIso(iso: string, days: number): string | null {
  const d = new Date(`${iso}T12:00:00`)
  if (isNaN(d.getTime())) return null
  d.setDate(d.getDate() + days)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${dd}`
}

/**
 * Mirrors the in-app heat doctrine (environmentPrep.ts): acclimation takes
 * 7–10 days of 50–100 min/day easy heat exposure starting ~2 weeks out;
 * most adaptation lands in the first 4–6 days; top up every third day.
 */
export function heatPlan(raceDateIso: string, expectedHighF: number): HeatPlan | null {
  const start = shiftIso(raceDateIso, -14)
  const topUp = shiftIso(raceDateIso, -4)
  if (!start || !topUp || !isFinite(expectedHighF)) return null
  const hot = expectedHighF >= 75
  if (!hot) {
    return {
      hot: false,
      steps: [],
      raceDayNote: 'Below ~75°F a dedicated acclimation block isn\'t needed — practice race fueling and hydration as usual.',
    }
  }
  return {
    hot: true,
    steps: [
      { window: `${start} → race week`, action: 'Acclimation block: 7–10 consecutive days of 50–100 min/day easy exercise in the heat (or a post-run sauna). Most of the adaptation comes in the first 4–6 days.' },
      { window: `${topUp} → race day`, action: 'Maintenance: top up with one easy heat exposure every third day. End every session fully rehydrated.' },
      { window: 'Race morning', action: 'Pre-cool where possible (shade, ice, cold fluids), start conservatively — heat taxes pace before it taxes effort.' },
    ],
    raceDayNote: `At ~${Math.round(expectedHighF)}°F, expect easy pace to drift 10–20+ s/mi slower — hold effort, not pace, for the first third.`,
  }
}

