import type { AidStation, Course, CourseSegment } from '../../types/course'
import { costRun, MINETTI_DOMAIN_MAX, MINETTI_DOMAIN_MIN } from '../terrain/locomotion/minetti'
import { carbTargetForRaceMiles } from '../../utils/fueling'

/**
 * G6 — course-aware trail race pacing (PacePro-for-trail + fueling
 * checkpoints). Garmin computes grade-adjusted bands for road; Runna
 * explicitly declines split plans; Vert offers finish scenarios only.
 * This produces, per curated course segment:
 *
 *  - a pace BAND (not a single number — trail honesty) from the athlete's
 *    race-effort flat pace × the segment's locomotion-optimal Minetti
 *    cost (running vs walking, whichever is cheaper at that grade — the
 *    power-hike call is physics, not vibes: walking wins above ~+20%,
 *    and earlier when technicality bites);
 *  - a technicality factor (Vernillo-spirit mechanical demand, +3% per
 *    point above 1) and an altitude factor (~2% pace per 1,000 ft above
 *    5,000 ft — the conservative end of the 8–11% VO₂/1,000 m doctrine);
 *  - cumulative ETA bands, and fueling checkpoints at each aid station
 *    (cumulative grams from the same carbTargetForRaceMiles tiers the
 *    plan prescribes — one source of truth).
 */

export interface SegmentBand {
  segmentId: string
  name: string
  startMile: number
  endMile: number
  avgGradePct: number
  gait: 'run' | 'hike'
  /** Fast/slow pace band, seconds per mile. */
  paceLowSecMi: number
  paceHighSecMi: number
  /** Cumulative elapsed-time band at the segment's END, seconds. */
  etaLowSec: number
  etaHighSec: number
  note?: string
}

export interface FuelingCheckpoint {
  mile: number
  name: string
  /** Cumulative carbohydrate grams the athlete should have taken in by
   *  this point (mid-band ETA × g/hr). */
  cumulativeCarbsG: number
  /** ~25 g-carb gel equivalents of the cumulative target. */
  cumulativeGels: number
  crewAccess?: boolean
  note?: string
}

export interface RacePacingPlan {
  courseId: string
  courseName: string
  gPerHour: number
  segments: SegmentBand[]
  checkpoints: FuelingCheckpoint[]
  totalLowSec: number
  totalHighSec: number
  cautions: string[]
}

const BAND_LOW = 0.97   // strong-day end
const BAND_HIGH = 1.08  // late-race fade / conditions end
const TECH_FACTOR_PER_POINT = 0.03
const ALT_BASE_FT = 5000
const ALT_FACTOR_PER_1000FT = 0.02

function clampGrade(pct: number): number {
  return Math.min(MINETTI_DOMAIN_MAX, Math.max(MINETTI_DOMAIN_MIN, pct / 100))
}

/** Grade above which power-hiking beats running AT RACE SPEEDS (~+20%,
 *  per the Minetti doctrine documented in terrain/locomotion/hiking.ts).
 *  Note: raw energy cost per meter has walking cheaper at EVERY grade —
 *  the racing crossover is a speed-domain fact, so it's a threshold here,
 *  not a cost comparison. */
export const HIKE_CROSSOVER_GRADE = 0.20

/** Energy-cost ratio vs flat running (the Minetti running polynomial —
 *  one continuous, monotone curve prices every segment), plus the racing
 *  gait flag: at and above the crossover the athlete should power-hike.
 *  Walking's ~12% lower absolute cost at those grades is why hiking the
 *  band is comfortable rather than heroic — the flag changes execution,
 *  not the band. */
export function segmentCost(avgGradePct: number): { ratio: number; gait: 'run' | 'hike' } {
  const g = clampGrade(avgGradePct)
  return {
    ratio: costRun(g) / costRun(0),
    gait: g >= HIKE_CROSSOVER_GRADE ? 'hike' : 'run',
  }
}

function technicalityFactor(t: CourseSegment['technicality']): number {
  return 1 + TECH_FACTOR_PER_POINT * (t - 1)
}

function altitudeFactor(avgAltitudeFt: number): number {
  return 1 + Math.max(0, (avgAltitudeFt - ALT_BASE_FT) / 1000) * ALT_FACTOR_PER_1000FT
}

/**
 * Build the race plan from a curated course and the athlete's race-effort
 * flat pace (sec/mi — from their VDOT race prediction at the course
 * distance, i.e. the same engines as the finish predictor and, post-G5,
 * their recalibrated fitness).
 */
export function buildRacePacingPlan(
  course: Course,
  flatRacePaceSecMi: number,
): RacePacingPlan | null {
  if (!isFinite(flatRacePaceSecMi) || flatRacePaceSecMi <= 0) return null
  if (!course.segments || course.segments.length === 0) return null

  const raceMiles = course.segments[course.segments.length - 1].endMile
  const gPerHour = carbTargetForRaceMiles(raceMiles)

  const segments: SegmentBand[] = []
  let etaLow = 0
  let etaHigh = 0
  for (const seg of course.segments) {
    const { ratio, gait } = segmentCost(seg.avgGradePct)
    const pace = flatRacePaceSecMi * ratio * technicalityFactor(seg.technicality) * altitudeFactor(seg.avgAltitudeFt)
    const paceLowSecMi = Math.round(pace * BAND_LOW)
    const paceHighSecMi = Math.round(pace * BAND_HIGH)
    etaLow += paceLowSecMi * seg.lengthMi
    etaHigh += paceHighSecMi * seg.lengthMi
    segments.push({
      segmentId: seg.id,
      name: seg.name,
      startMile: seg.startMile,
      endMile: seg.endMile,
      avgGradePct: seg.avgGradePct,
      gait,
      paceLowSecMi,
      paceHighSecMi,
      etaLowSec: Math.round(etaLow),
      etaHighSec: Math.round(etaHigh),
      note: seg.notes ?? seg.trainingAnalog,
    })
  }

  // Fueling checkpoints: cumulative grams by mid-band ETA at each aid mile.
  const checkpoints: FuelingCheckpoint[] = (course.aidStations ?? []).map((aid: AidStation) => {
    const eta = etaAtMile(segments, aid.mile)
    const midHours = (eta.low + eta.high) / 2 / 3600
    const grams = Math.round(gPerHour * midHours)
    return {
      mile: aid.mile,
      name: aid.name,
      cumulativeCarbsG: grams,
      cumulativeGels: Math.ceil(grams / 25),
      crewAccess: aid.crewAccess,
      note: aid.notes,
    }
  })

  const cautions: string[] = []
  const maxAlt = Math.max(...course.segments.map(s => s.avgAltitudeFt))
  if (maxAlt >= 7000) {
    cautions.push(`Course tops out near ${maxAlt.toLocaleString()} ft — breathing will cap your pace before your legs do. Bands already include an altitude allowance; don't fight them.`)
  }
  if (course.segments.some(s => s.technicality >= 4)) {
    cautions.push('Technical segments (4–5/5): the band assumes clean movement — a fall costs more than any pace. Feet first, splits second.')
  }
  const hikeMiles = segments.filter(s => s.gait === 'hike').reduce((m, s) => m + (s.endMile - s.startMile), 0)
  if (hikeMiles > 0) {
    cautions.push(`~${hikeMiles.toFixed(1)} mi is marked HIKE — walking is measurably cheaper there (Minetti economy crossover). Hiking those grades IS racing.`)
  }

  return {
    courseId: course.id,
    courseName: course.name,
    gPerHour,
    segments,
    checkpoints,
    totalLowSec: Math.round(etaLow),
    totalHighSec: Math.round(etaHigh),
    cautions,
  }
}

function etaAtMile(segments: SegmentBand[], mile: number): { low: number; high: number } {
  let low = 0
  let high = 0
  for (const s of segments) {
    if (mile >= s.endMile) {
      low = s.etaLowSec
      high = s.etaHighSec
      continue
    }
    if (mile > s.startMile) {
      const frac = (mile - s.startMile) / (s.endMile - s.startMile)
      low += (s.etaLowSec - low) * frac
      high += (s.etaHighSec - high) * frac
    }
    break
  }
  return { low, high }
}

/** One-line coach context (D8 — the RACE_PACING section). */
export function buildRacePacingContext(plan: RacePacingPlan): string {
  const fmt = (sec: number) => {
    const h = Math.floor(sec / 3600)
    const m = Math.round((sec % 3600) / 60)
    return h > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${m} min`
  }
  const hikes = plan.segments.filter(s => s.gait === 'hike').map(s => s.name)
  const parts = [
    `Course plan for ${plan.courseName}: projected ${fmt(plan.totalLowSec)}–${fmt(plan.totalHighSec)}.`,
    ...plan.segments.slice(0, 8).map(s =>
      `${s.name} (mi ${s.startMile}-${s.endMile}, ${s.avgGradePct > 0 ? '+' : ''}${s.avgGradePct}%): ` +
      `${fmtPace(s.paceLowSecMi)}-${fmtPace(s.paceHighSecMi)}${s.gait === 'hike' ? ' POWER-HIKE' : ''}`),
  ]
  if (hikes.length > 0) parts.push(`Hike-by-physics segments: ${hikes.join(', ')}.`)
  if (plan.gPerHour > 0) {
    parts.push(`Fueling: ${plan.gPerHour} g carb/hr; checkpoints: ${plan.checkpoints.map(c => `${c.name} mi ${c.mile} ≈ ${c.cumulativeCarbsG} g in`).join(' · ')}.`)
  }
  return parts.join(' ')
}

function fmtPace(secPerMi: number): string {
  const m = Math.floor(secPerMi / 60)
  const s = Math.round(secPerMi % 60)
  return `${m}:${String(s).padStart(2, '0')}/mi`
}
