import type { PerformanceMetrics, RaceInfo } from '../types'
import { daysUntilRace, weeksUntilRace } from './raceCountdown'

/**
 * Race-readiness presentation layer.
 *
 * Combines existing signals (CTL from PerformanceMetrics, race distance and
 * elevation from RaceInfo, days-until-race from raceCountdown) into a
 * single-card summary the athlete can read in five seconds:
 *
 *   "You are X% ready for {race}.
 *    Ahead on fitness, behind on vert.
 *    Next 3 weeks: {one concrete action}."
 *
 * This is intentionally a *composition* of existing engine outputs — no new
 * physiology model. The percent is a normalised distance between current CTL
 * and a target CTL determined by race distance.
 */

export type ReadinessGap = 'fitness' | 'vert' | 'taper' | 'on-track'

export interface RaceReadinessSummary {
  /** Overall readiness, 0–100. */
  pct: number
  /** Single short sentence safe to drop in a card header. */
  headline: string
  /** Which dimension is the dominant gap right now. */
  gap: ReadinessGap
  /** One concrete corrective action for the next few weeks. */
  nextAction: string
  /** Echoed for the card subhead. */
  weeksLeft: number
  daysLeft: number
}

/** Approximate target CTL for a race of `distanceMiles`. Conservative anchors. */
function targetCtl(distanceMiles: number): number {
  if (distanceMiles <= 3.5) return 35 // 5K
  if (distanceMiles <= 7) return 40 // 10K
  if (distanceMiles <= 14) return 55 // half / 18K
  if (distanceMiles <= 27) return 65 // marathon / 50K-ish
  return 75 // ultra
}

/** Elevation tier — "vert-heavy" races punish under-trained legs more. */
function isVertHeavy(distanceMiles: number, elevationFt: number): boolean {
  if (distanceMiles <= 0) return false
  const ftPerMi = elevationFt / distanceMiles
  return ftPerMi >= 150 // ≈ 30 m/km, the trail-running threshold
}

interface Inputs {
  race: RaceInfo
  performance: PerformanceMetrics[]
  now?: Date
}

export function computeRaceReadiness({ race, performance, now }: Inputs): RaceReadinessSummary | null {
  if (!race?.date) return null
  const days = daysUntilRace(race.date, now)
  const weeks = weeksUntilRace(race.date, now)
  if (days == null || weeks == null) return null

  const latest = performance.length > 0 ? performance[performance.length - 1] : null
  const ctl = latest?.ctl ?? 0
  const tsb = latest?.tsb ?? 0

  const distanceMiles = race.distanceMiles || 0
  const elevationFt = parseInt((race.elevation || '0').replace(/[^0-9]/g, ''), 10) || 0
  const target = targetCtl(distanceMiles)
  const fitnessPct = Math.max(0, Math.min(100, Math.round((ctl / target) * 100)))

  // Race-day taper window — last 2 weeks before the race.
  if (days <= 14 && days >= 0) {
    if (tsb < 0) {
      return {
        pct: Math.min(fitnessPct, Math.max(20, Math.round(70 + tsb))),
        headline: `${days} days out — still carrying fatigue.`,
        gap: 'taper',
        nextAction: 'Cut volume 30–40% this week; let recovery balance climb above +5 by race day.',
        weeksLeft: weeks,
        daysLeft: days,
      }
    }
    return {
      pct: Math.max(fitnessPct, 85),
      headline: `${days} days out — you're peaking.`,
      gap: 'on-track',
      nextAction: 'Maintain easy volume, dial in race-day fueling, and protect sleep.',
      weeksLeft: weeks,
      daysLeft: days,
    }
  }

  // Build window — fitness is the dominant signal.
  if (fitnessPct < 70 && weeks > 2) {
    return {
      pct: fitnessPct,
      headline: `${weeks} weeks out — fitness is the gap.`,
      gap: 'fitness',
      nextAction: `Add 1 easy aerobic session per week; aim for a CTL of ${target} by race week.`,
      weeksLeft: weeks,
      daysLeft: days,
    }
  }

  if (isVertHeavy(distanceMiles, elevationFt) && fitnessPct >= 60 && weeks > 2) {
    return {
      pct: Math.min(fitnessPct, 80),
      headline: `${weeks} weeks out — fitness on track, vert is the gap.`,
      gap: 'vert',
      nextAction: `Add one ${Math.round(elevationFt / 6)} ft hill workout per week for the next ${Math.min(weeks - 1, 3)} weeks.`,
      weeksLeft: weeks,
      daysLeft: days,
    }
  }

  return {
    pct: Math.min(95, Math.max(fitnessPct, 75)),
    headline: `${weeks} weeks out — you're on track.`,
    gap: 'on-track',
    nextAction: 'Keep the plan; add one race-specific session per week.',
    weeksLeft: weeks,
    daysLeft: days,
  }
}
