import { carbTargetForRaceMiles } from '../utils/fueling'
import { vdotFromRace } from '../engines/planGenerator/vdot'
import { predictRaceTime } from '../engines/planGenerator/feasibility'
import { costRun, MINETTI_DOMAIN_MAX, MINETTI_DOMAIN_MIN } from '../engines/terrain/locomotion/minetti'
import { getMethodById } from '../data/methods'
import { allocatePhaseWeeks, buildWeeklyMileage, capTaperBlocks, TAPER_WEEKS_CAP } from '../engines/planGenerator/weekPlan'

/**
 * Pure math behind the free public calculators (G10). These pages are the
 * acquisition funnel: same engines as the app — carbTargetForRaceMiles,
 * Daniels VDOT, Minetti grade cost, the weekly mileage ramp — not marketing
 * copies of them. Zero
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
  vdot: number
  flatSeconds: number
  vertMultiplier: number
  optimisticSeconds: number
  realisticSeconds: number
  conservativeSeconds: number
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
  if (recentDistanceMiles <= 0 || recentTimeSeconds <= 0 || targetDistanceMiles <= 0 || targetVertFt < 0) return null
  const vdot = vdotFromRace({ distanceMiles: recentDistanceMiles, timeSeconds: recentTimeSeconds })
  if (vdot <= 0) return null
  const flatSeconds = predictRaceTime(vdot, targetDistanceMiles)
  const mult = vertMultiplier(targetDistanceMiles, targetVertFt)
  return {
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

// ── Weekly mileage planner ──────────────────────────────────────

/** The one method the planner uses: rated for every road distance it offers. */
export const MILEAGE_METHOD_ID = 'daniels'

/** Road distances the planner offers, as the app's RaceDistance ids. */
export const MILEAGE_DISTANCES = [
  { id: '5k', label: '5K' },
  { id: '10k', label: '10K' },
  { id: 'half_marathon', label: 'Half marathon' },
  { id: 'marathon', label: 'Marathon' },
] as const

export type MileageDistance = (typeof MILEAGE_DISTANCES)[number]['id']

export interface MileageWeek {
  week: number
  miles: number
  longRunMi: number
  /** A cutback or taper week: drawn lighter. */
  easier: boolean
  taper: boolean
}

export interface MileagePlan {
  weeks: MileageWeek[]
  startMi: number
  peakMi: number
  /** 1-based week of the first week at peak. */
  peakWeek: number
  longestRunMi: number
}

/**
 * The app's weekly mileage ramp for one road race: the Daniels method's
 * phases and taper (capped for short races, as the plan generator does),
 * built by `buildWeeklyMileage` for a runner on 5 days a week with no injury
 * or age adjustments. Each building week stays within 10% of the last full
 * week, every fourth week is easier, and week 1 is at most one step above
 * what you run now. Null for input the app wouldn't plan (under 1 or over
 * 200 mi a week, or a plan outside 4–24 whole weeks).
 */
export function mileagePlan(distance: MileageDistance, currentWeeklyMi: number, weeksToRace: number): MileagePlan | null {
  const method = getMethodById(MILEAGE_METHOD_ID)
  if (!method) return null
  if (!isFinite(currentWeeklyMi) || currentWeeklyMi < 1 || currentWeeklyMi > 200) return null
  if (!Number.isInteger(weeksToRace) || weeksToRace < 4 || weeksToRace > 24) return null
  const taperCap = TAPER_WEEKS_CAP[distance]
  const blocks = allocatePhaseWeeks(method, weeksToRace)
  const weeks = buildWeeklyMileage(
    method,
    weeksToRace,
    taperCap != null ? capTaperBlocks(blocks, method, taperCap) : blocks,
    currentWeeklyMi,
    {},
    { raceDistance: distance, maxTaperWeeks: taperCap, runningDays: 5 },
  ).map(w => ({ week: w.weekNumber, miles: w.totalMi, longRunMi: w.longRunMi, easier: w.isCutback || w.isTaper, taper: w.isTaper }))
  const peakMi = Math.max(...weeks.map(w => w.miles))
  return {
    weeks,
    startMi: weeks[0].miles,
    peakMi,
    peakWeek: weeks.findIndex(w => w.miles === peakMi) + 1,
    longestRunMi: Math.max(...weeks.map(w => w.longRunMi)),
  }
}
