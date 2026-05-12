/**
 * Builds a personalized methodology "context" — a structured view of the
 * training principles applied to the athlete's actual plan, race, and
 * method selection. Methodology.tsx renders this; the coach context
 * snapshot also reads from it so prose and AI answers stay in sync.
 *
 * Every field is derived from data the user can change: training plan
 * (weeks, race, days), training method (phases, intensity distribution),
 * and onboarding preferences (strength days, cross-training, distance).
 * No copy is hardcoded to Mike's 18K.
 */

import type { PlannedDay, TrainingPlan, TrainingWeek } from '../types'
import type { TrainingMethod } from '../types/training-method'
import type { OnboardingConfig } from '../hooks/useOnboarding'

export type MethodologyPhaseId = 'base' | 'build' | 'peak' | 'taper'

export interface MethodologyPhase {
  id: MethodologyPhaseId
  label: string
  weekStart: number
  weekEnd: number
  /** Width as a percentage string for the phase bar (e.g. "30%"). */
  widthPct: number
  /** Min/max ft of climbing across long-run days in this phase, if detectable. */
  vertRangeFt?: { min: number; max: number }
  /** True when phase contains a poles-introduction week. */
  introducesPoles?: boolean
}

export interface RecoveryWeekInfo {
  num: number
  /** Volume drop versus the prior peak-so-far week, as percent (e.g. 27). */
  volumeDropPct?: number
}

export interface TaperInfo {
  startWeek: number
  endWeek: number
  /** Volume drop from peak training week to the start of the taper, as percent. */
  volumeDropPct?: number
}

export interface MethodologyContext {
  totalWeeks: number
  raceName: string
  raceDistance: string
  raceElevation?: string
  raceElevationRange?: string
  /** True when the race profile has an altitude band above ~5,000 ft. */
  hasAltitude: boolean
  /** Total vertical gain summed across long-run days, in feet. */
  totalLongRunVertFt?: number
  phases: MethodologyPhase[]
  recoveryWeek?: RecoveryWeekInfo
  taper?: TaperInfo
  polesStartWeek?: number
  /** A named descent landmark from the race course, if surfaced. */
  descentLandmark?: string
  /** Whether the plan emphasises eccentric strength work. */
  eccentricFocus: boolean
  /** Plan has at least one trekking-poles day. */
  hasPoles: boolean
  /** Plan has at least one strength session. */
  hasStrength: boolean
  /** Plan has at least one cross-training session. */
  hasCrossTraining: boolean
  /** Roughly the intensity distribution implied by the chosen method, if any. */
  intensityDistribution?: { easyPct: number; moderatePct: number; hardPct: number }
  /** Methodology source (e.g. Daniels, Pfitzinger, Uphill Athlete). */
  methodName?: string
  methodCoach?: string
  methodKeyBook?: string
  methodPhilosophy?: string
}

// ---------------------------------------------------------------------------
// Parsers / helpers
// ---------------------------------------------------------------------------

const VERT_RE = /~?([\d,]+)\s*ft\s*(?:gain|climb)/i
const DROP_PCT_RE = /(?:drops?|drop)\s*~?\s*(\d{1,2})\s*%/i

function parseVertFt(detail?: string): number | undefined {
  if (!detail) return undefined
  const m = detail.match(VERT_RE)
  if (!m) return undefined
  const n = Number(m[1].replace(/,/g, ''))
  return Number.isFinite(n) ? n : undefined
}

function parseMiles(miles: TrainingWeek['miles']): number {
  if (typeof miles === 'number') return miles
  const m = miles.match(/(\d+(?:\.\d+)?)/)
  return m ? Number(m[1]) : 0
}

function hasPolesMention(day: PlannedDay): boolean {
  const blob = `${day.workout ?? ''} ${day.detail ?? ''}`
  return /poles|🥾/i.test(blob)
}

function isLongRun(day: PlannedDay): boolean {
  if (day.type === 'long') return true
  return /long run/i.test(day.workout ?? '')
}

function isStrength(day: PlannedDay): boolean {
  if (day.type === 'strength') return true
  return /strength/i.test(day.workout ?? '')
}

function isCrossTraining(day: PlannedDay): boolean {
  if (day.type === 'cross') return true
  return /cross[- ]?train/i.test(day.workout ?? '')
}

function hasEccentricMention(day: PlannedDay): boolean {
  const blob = `${day.workout ?? ''} ${day.detail ?? ''}`
  return /eccentric|nordic|step[- ]?down/i.test(blob)
}

function findFirstWeek(
  weeks: TrainingWeek[],
  predicate: (w: TrainingWeek) => boolean,
): TrainingWeek | undefined {
  return weeks.find(predicate)
}

function findRecoveryWeek(weeks: TrainingWeek[]): TrainingWeek | undefined {
  return findFirstWeek(weeks, w => /recovery week/i.test(w.focus))
}

function findTaperStart(weeks: TrainingWeek[]): TrainingWeek | undefined {
  // Match an explicit "TAPER WK"/"TAPER WEEK" marker so phrases like
  // "...before taper" in a peak-week focus don't get misclassified.
  return findFirstWeek(weeks, w => /\btaper\s+(wk|week)\b/i.test(w.focus))
}

function findPeakWeek(weeks: TrainingWeek[]): TrainingWeek | undefined {
  return findFirstWeek(weeks, w => /\bpeak\s+(wk|week|volume)\b/i.test(w.focus))
}

function findRaceWeek(weeks: TrainingWeek[]): TrainingWeek | undefined {
  return findFirstWeek(weeks, w => /race week/i.test(w.focus))
}

function parseDropPct(focus: string): number | undefined {
  const m = focus.match(DROP_PCT_RE)
  if (!m) return undefined
  return Number(m[1])
}

function extractDescentLandmark(plan: TrainingPlan): string | undefined {
  const landmarks = plan.race.landmarks ?? []
  for (const lm of landmarks) {
    const desc = lm.description ?? ''
    // Pattern: "Descent into <Place> → ..." or "Descent down <Place>."
    const m = desc.match(/descent\s+(?:into|through|down)\s+([A-Z][\w' ]+?)(?=\s*[→.,]|$)/i)
    if (m) return m[1].trim()
  }
  // Fallback — pull the first landmark with a "downhill"/"quad" cue.
  for (const lm of landmarks) {
    if (/quad|downhill|descent/i.test(lm.description ?? '')) {
      const m = (lm.description ?? '').match(/([A-Z][\w']+(?:\s[A-Z][\w']+){0,3})/)
      if (m) return m[1].trim()
    }
  }
  return undefined
}

function parseAltitudeMaxFt(range?: string): number | undefined {
  if (!range) return undefined
  const m = range.match(/(\d[\d,]*)\s*ft\b/g)
  if (!m || m.length === 0) return undefined
  let max = 0
  for (const part of m) {
    const num = Number(part.replace(/[^\d]/g, ''))
    if (Number.isFinite(num) && num > max) max = num
  }
  return max || undefined
}

// ---------------------------------------------------------------------------
// Phase derivation
// ---------------------------------------------------------------------------

function buildPhasesFromPlan(weeks: TrainingWeek[]): MethodologyPhase[] {
  const total = weeks.length
  if (total === 0) return []

  const recovery = findRecoveryWeek(weeks)
  const taper = findTaperStart(weeks)
  const peak = findPeakWeek(weeks)
  const race = findRaceWeek(weeks)

  // Anchor points. Fall back to a 30/30/20/20 split when markers are missing.
  const taperStart = taper?.num ?? (race ? race.num - 1 : Math.max(1, total - 1))
  const peakStart = peak?.num ?? (recovery ? recovery.num + 1 : Math.max(1, Math.floor(total * 0.6)))
  const peakEnd = Math.max(peakStart, taperStart - 1)
  const buildStart = (recovery?.num ?? Math.max(1, Math.floor(total * 0.3) + 1))
  const buildEnd = Math.max(buildStart, peakStart - 1)
  const baseEnd = Math.max(1, buildStart - 1)

  // Build the four phases; collapse out empty ones (e.g. very short plans
  // where peak and build overlap).
  const candidate: Omit<MethodologyPhase, 'widthPct'>[] = [
    { id: 'base', label: 'Base', weekStart: 1, weekEnd: baseEnd },
    { id: 'build', label: 'Build', weekStart: buildStart, weekEnd: buildEnd },
    { id: 'peak', label: 'Peak', weekStart: peakStart, weekEnd: peakEnd },
    { id: 'taper', label: 'Taper', weekStart: taperStart, weekEnd: total },
  ]
  const raw = candidate.filter(p => p.weekEnd >= p.weekStart && p.weekStart <= total)

  // Compute vert range and poles introduction per phase.
  const enriched = raw.map(p => {
    const phaseWeeks = weeks.filter(w => w.num >= p.weekStart && w.num <= p.weekEnd)
    const verts: number[] = []
    let introducesPoles = false
    for (const w of phaseWeeks) {
      for (const d of w.days) {
        if (isLongRun(d)) {
          const v = parseVertFt(d.detail)
          if (v) verts.push(v)
        }
      }
      if (/poles/i.test(w.focus)) introducesPoles = true
    }
    const vertRange = verts.length
      ? { min: Math.min(...verts), max: Math.max(...verts) }
      : undefined
    const widthFraction = (p.weekEnd - p.weekStart + 1) / total
    return {
      ...p,
      widthPct: Math.round(widthFraction * 100),
      vertRangeFt: vertRange,
      introducesPoles,
    } satisfies MethodologyPhase
  })

  return enriched
}

// ---------------------------------------------------------------------------
// Drop-percentage derivation
// ---------------------------------------------------------------------------

function deriveRecoveryDropPct(weeks: TrainingWeek[], recovery: TrainingWeek): number | undefined {
  const stated = parseDropPct(recovery.focus)
  if (stated) return stated
  const prior = weeks.filter(w => w.num < recovery.num)
  if (prior.length === 0) return undefined
  const priorPeak = Math.max(...prior.map(w => parseMiles(w.miles)))
  const recoveryMiles = parseMiles(recovery.miles)
  if (priorPeak === 0 || recoveryMiles === 0) return undefined
  return Math.round(((priorPeak - recoveryMiles) / priorPeak) * 100)
}

function deriveTaperDropPct(weeks: TrainingWeek[], taperStart: TrainingWeek): number | undefined {
  const stated = parseDropPct(taperStart.focus)
  if (stated) return stated
  const beforeTaper = weeks.filter(w => w.num < taperStart.num)
  if (beforeTaper.length === 0) return undefined
  const peakMiles = Math.max(...beforeTaper.map(w => parseMiles(w.miles)))
  const taperMiles = parseMiles(taperStart.miles)
  if (peakMiles === 0 || taperMiles === 0) return undefined
  return Math.round(((peakMiles - taperMiles) / peakMiles) * 100)
}

// ---------------------------------------------------------------------------
// Public builder
// ---------------------------------------------------------------------------

export function buildMethodologyContext(
  plan: TrainingPlan,
  method?: TrainingMethod,
  config?: OnboardingConfig,
): MethodologyContext {
  const weeks = plan.weeks
  const phases = buildPhasesFromPlan(weeks)
  const recovery = findRecoveryWeek(weeks)
  const taperWeek = findTaperStart(weeks)
  const raceWeek = findRaceWeek(weeks)

  let polesStartWeek: number | undefined
  let hasPoles = false
  let hasStrength = false
  let hasCrossTraining = false
  let eccentricFocus = false
  let totalLongRunVertFt = 0
  for (const w of weeks) {
    for (const d of w.days) {
      if (hasPolesMention(d)) {
        hasPoles = true
        if (polesStartWeek === undefined) polesStartWeek = w.num
      }
      if (isStrength(d)) hasStrength = true
      if (isCrossTraining(d)) hasCrossTraining = true
      if (hasEccentricMention(d)) eccentricFocus = true
      if (isLongRun(d)) {
        const v = parseVertFt(d.detail)
        if (v) totalLongRunVertFt += v
      }
    }
    // A focus string like "POLES introduced" still counts even if no day uses
    // the keyword — but the per-day scan above usually catches it first.
    if (!polesStartWeek && /poles/i.test(w.focus)) polesStartWeek = w.num
  }

  // Onboarding preferences can also force strength / cross-training visibility
  // even when the current plan happens not to include them yet.
  if (config?.strengthDaysPerWeek && config.strengthDaysPerWeek > 0) hasStrength = true
  if (config?.crossTrainingModes && config.crossTrainingModes.length > 0) hasCrossTraining = true

  const altitudeMax = parseAltitudeMaxFt(plan.race.elevationRange)
  const hasAltitude = !!altitudeMax && altitudeMax >= 5000

  // Build the rough easy/moderate/hard distribution from the chosen method.
  // Average the per-phase distributions weighted by pctOfPlan.default.
  let intensity: MethodologyContext['intensityDistribution']
  if (method?.phases?.length) {
    let easy = 0
    let mod = 0
    let hard = 0
    let weightTotal = 0
    for (const ph of method.phases) {
      const w = ph.pctOfPlan?.default ?? 0
      easy += (ph.intensityDistribution?.easyPct ?? 0) * w
      mod += (ph.intensityDistribution?.moderatePct ?? 0) * w
      hard += (ph.intensityDistribution?.hardPct ?? 0) * w
      weightTotal += w
    }
    if (weightTotal > 0) {
      intensity = {
        easyPct: Math.round(easy / weightTotal),
        moderatePct: Math.round(mod / weightTotal),
        hardPct: Math.round(hard / weightTotal),
      }
    }
  }

  return {
    totalWeeks: weeks.length,
    raceName: plan.race.name,
    raceDistance: plan.race.distance,
    raceElevation: plan.race.elevation,
    raceElevationRange: plan.race.elevationRange,
    hasAltitude,
    totalLongRunVertFt: totalLongRunVertFt || undefined,
    phases,
    recoveryWeek: recovery
      ? { num: recovery.num, volumeDropPct: deriveRecoveryDropPct(weeks, recovery) }
      : undefined,
    taper: taperWeek
      ? {
          startWeek: taperWeek.num,
          endWeek: raceWeek?.num ?? weeks.length,
          volumeDropPct: deriveTaperDropPct(weeks, taperWeek),
        }
      : undefined,
    polesStartWeek,
    descentLandmark: extractDescentLandmark(plan),
    eccentricFocus,
    hasPoles,
    hasStrength,
    hasCrossTraining,
    intensityDistribution: intensity,
    methodName: method?.name,
    methodCoach: method?.coach,
    methodKeyBook: method?.keyBook,
    methodPhilosophy: method?.philosophyNarrative,
  }
}

/** Formats a week range as "Wk N" or "Wk M-N". */
export function formatWeekRange(start: number, end: number): string {
  return start === end ? `Wk ${start}` : `Wk ${start}-${end}`
}

/** Formats a vert range as "M-N ft" or "~N ft" when min == max. */
export function formatVertRange(range: { min: number; max: number }): string {
  const fmt = (n: number) => n.toLocaleString('en-US')
  return range.min === range.max ? `~${fmt(range.min)} ft` : `${fmt(range.min)}-${fmt(range.max)} ft`
}
