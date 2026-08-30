/**
 * The road/trail trajectory — "where this is heading", built from fitness the
 * plan already knows.
 *
 * The Hyrox projection answers "what will I finish in" for a Hyrox athlete. A
 * road or trail runner had no equivalent: the Progress tab could tell them how
 * compliant they'd been but never where their training was pointing. This is
 * that answer, and it is deliberately the FITNESS-EQUIVALENT one — "at today's
 * fitness you'd run about X" — not a course-adjusted race simulation. It reads
 * the same VDOT the plan paces itself from, so the number on Progress and the
 * paces in the plan can never disagree.
 *
 * Honesty is the whole point of the "closing / reach" split. The codebase
 * already encodes what a single training block can realistically add — an ~8%
 * VDOT gain (REALISTIC_VDOT_GAIN). A goal reachable within that gain is
 * "closing"; a goal beyond it is a "reach", and the card says so plainly and
 * offers the honest target instead of flattering the athlete.
 *
 * Pure: every input is a number, so the model is testable without a clock, a
 * plan, or a config.
 */
import { predictRaceTime, REALISTIC_VDOT_GAIN, RACE_DISTANCE_MILES } from '../engines/planGenerator/feasibility'
import { athleteCurrentVdot } from '../engines/planGenerator/paceTargets'
import { sanitizeRaceTimeSeconds } from '../engines/planGenerator/vdot'
import type { OnboardingConfig } from '../hooks/useOnboarding'

export type TrajectoryStatus = 'met' | 'closing' | 'reach'
export type TrajectoryConfidence = 'building' | 'firming' | 'settled'

export interface Trajectory {
  /** Equivalent race time at today's fitness, in seconds. */
  projectedSeconds: number
  /** The goal time, if the athlete set one. */
  goalSeconds: number | null
  /** Best realistic time this block — today's fitness plus a full, realistic
   *  gain. The honest target when the stated goal is a reach. */
  realisticSeconds: number
  status: TrajectoryStatus | null
  confidence: TrajectoryConfidence
  projectedClock: string
  goalClock: string | null
  realisticClock: string
  headline: string
  note: string
}

/** h:mm:ss / m:ss from seconds. */
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`)
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`
}

function confidenceFor(weeksElapsed: number, totalWeeks: number): TrajectoryConfidence {
  if (weeksElapsed <= 2) return 'building'
  const progress = totalWeeks > 0 ? weeksElapsed / totalWeeks : 0
  return progress < 0.6 ? 'firming' : 'settled'
}

export function buildTrajectory(input: {
  currentVdot: number
  raceMiles: number
  goalSeconds: number | null
  weeksElapsed: number
  totalWeeks: number
  /** e.g. "half" — a natural-language distance for the note. */
  raceLabel?: string
}): Trajectory | null {
  const { currentVdot, raceMiles, goalSeconds, weeksElapsed, totalWeeks, raceLabel } = input
  if (currentVdot <= 0 || raceMiles <= 0) return null

  const projectedSeconds = predictRaceTime(currentVdot, raceMiles)
  const realisticSeconds = predictRaceTime(currentVdot * REALISTIC_VDOT_GAIN, raceMiles)
  if (projectedSeconds <= 0) return null

  const projectedClock = formatClock(projectedSeconds)
  const realisticClock = formatClock(realisticSeconds)
  const goalClock = goalSeconds != null ? formatClock(goalSeconds) : null
  const confidence = confidenceFor(weeksElapsed, totalWeeks)
  const dist = raceLabel ? ` ${raceLabel}` : ''

  let status: TrajectoryStatus | null = null
  let headline: string
  let note: string

  if (goalSeconds == null || goalClock == null) {
    headline = `On pace for ${projectedClock}`
    note = `At today's fitness you'd run about ${projectedClock}${dist}. Set a goal time to see the gap.`
  } else if (projectedSeconds <= goalSeconds) {
    // Today's fitness already meets the goal — the block is about holding it.
    status = 'met'
    headline = `You're at ${goalClock} today`
    note = `At today's fitness you'd already run about ${projectedClock}${dist} — the block is about holding it to race day.`
  } else if (goalSeconds >= realisticSeconds) {
    // Goal is faster than today but within a realistic block's gain.
    status = 'closing'
    headline = `Closing on ${goalClock}`
    note = `At today's fitness you'd run about ${projectedClock}${dist}. Your ${goalClock} goal is within a strong block from here.`
  } else {
    // Goal is faster than even a full realistic gain would deliver.
    status = 'reach'
    headline = `${goalClock} is a reach from here`
    note = `At today's fitness you'd run about ${projectedClock}${dist}. A realistic block gets you near ${realisticClock}; ${goalClock} is beyond that — worth knowing before race day.`
  }

  return {
    projectedSeconds, goalSeconds, realisticSeconds, status, confidence,
    projectedClock, goalClock, realisticClock, headline, note,
  }
}

/** Natural-language distance for the note. */
const DISTANCE_LABEL: Partial<Record<string, string>> = {
  '5k': '5K', '10k': '10K', half_marathon: 'half', marathon: 'marathon',
}

/**
 * Build a trajectory from onboarding config. Returns null for anything that
 * isn't a fixed-distance running race with a fitness anchor — Hyrox keeps its
 * own projection, and an ultra or a goal-less plan has no honest single number.
 */
export function trajectoryFromConfig(
  config: OnboardingConfig | null | undefined,
  weeksElapsed: number,
  totalWeeks: number,
): Trajectory | null {
  if (!config) return null
  // Hyrox is owned by the Hyrox projection; only running races here.
  if (config.raceType === 'hyrox') return null
  const dist = config.raceDistance
  const raceMiles = dist ? (RACE_DISTANCE_MILES[dist] ?? 0) : 0
  if (raceMiles <= 0) return null

  const currentVdot = athleteCurrentVdot(config)
  if (currentVdot == null || currentVdot <= 0) return null

  const goalSeconds = sanitizeRaceTimeSeconds(config.goalRaceTimeSeconds, raceMiles)

  return buildTrajectory({
    currentVdot,
    raceMiles,
    goalSeconds,
    weeksElapsed,
    totalWeeks,
    raceLabel: dist ? DISTANCE_LABEL[dist] : undefined,
  })
}
