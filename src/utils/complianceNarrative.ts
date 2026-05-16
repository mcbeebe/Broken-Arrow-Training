// ─── Compliance narration ───────────────────────────────────────
//
// The Stats → Compliance tab used to show percentages and weekly
// dot grids with no narrative. This module turns the numbers into the
// sentences athletes actually want: a block-level verdict at the top
// ("last 4 weeks: nailed it / drifting / cold") and a one-liner per
// week ("Wk 4: showed up, short on miles").
//
// Pure functions, no side effects. Easy to unit-test against
// `WeekCompliance` shapes.

import type { WeekCompliance, OverallCompliance } from '../hooks/useCompliance'

export type VerdictTone = 'win' | 'on-track' | 'mixed' | 'cold'

export interface BlockVerdict {
  /** One-line headline. Customer language. */
  headline: string
  /** Comma-separated supporting metrics. */
  detail: string
  tone: VerdictTone
  /** Number of weeks included in the rollup. */
  weeksConsidered: number
}

export interface WeekVerdict {
  weekNum: number
  /** Plain-English one-liner. Always starts with "Wk N:" */
  headline: string
  tone: VerdictTone
}

// ─── Thresholds ─────────────────────────────────────────────────
// Picked to align with the existing grading bands (`HIT_BAND = 0.10`,
// `CLOSE_BAND = 0.20`, `HR_TIME_IN_ZONE_HIT = 75`) in useCompliance.ts.
// "Nailed" requires hitting all three axes; "missed" only requires
// failing one badly.

const NAILED_COMPLETION = 90      // % of sessions completed
const NAILED_DISTANCE = 85        // % of planned miles
const NAILED_HR = 75              // % time-in-zone
const ON_TRACK_COMPLETION = 75
const COLD_COMPLETION = 50

// ─── Per-week classifier ─────────────────────────────────────────

/**
 * Classify a single week. Returns null when there's nothing to
 * classify yet (week hasn't happened, no workouts attempted).
 */
export function classifyWeek(w: WeekCompliance): WeekVerdict | null {
  const attempted = w.completed + w.missed
  if (attempted === 0) return null

  const completionPct = (w.completed / attempted) * 100
  // Distance + HR are only graded when there were targets to grade.
  const hasDistanceTarget = w.plannedMiles > 0
  const distancePct = hasDistanceTarget
    ? Math.min(100, (w.actualMiles / w.plannedMiles) * 100)
    : 100
  const hrPct = w.hrCheckedWorkouts > 0 ? w.hrCompliance : 100

  const nailedAll =
    completionPct >= NAILED_COMPLETION &&
    distancePct >= NAILED_DISTANCE &&
    hrPct >= NAILED_HR

  if (nailedAll) {
    return {
      weekNum: w.weekNum,
      headline: `Wk ${w.weekNum}: nailed it — ${w.completed}/${attempted} sessions${hasDistanceTarget ? `, ${Math.round(distancePct)}% of planned miles` : ''}.`,
      tone: 'win',
    }
  }

  if (completionPct < COLD_COMPLETION) {
    return {
      weekNum: w.weekNum,
      headline: `Wk ${w.weekNum}: cold — only ${w.completed}/${attempted} sessions completed.`,
      tone: 'cold',
    }
  }

  // Pick the worst axis to lead with. Order matters: completion
  // failures matter more than distance shortfalls, which matter more
  // than HR drift, because "did I show up?" is the foundational
  // question.
  const completionWeak = completionPct < ON_TRACK_COMPLETION
  const distanceWeak = hasDistanceTarget && distancePct < NAILED_DISTANCE
  const hrWeak = w.hrCheckedWorkouts > 0 && hrPct < NAILED_HR

  if (completionWeak) {
    return {
      weekNum: w.weekNum,
      headline: `Wk ${w.weekNum}: missed sessions — ${w.completed}/${attempted} done${w.missed > 0 ? `, ${w.missed} skipped` : ''}.`,
      tone: 'mixed',
    }
  }

  if (distanceWeak && hrWeak) {
    return {
      weekNum: w.weekNum,
      headline: `Wk ${w.weekNum}: showed up but soft — ${Math.round(distancePct)}% of miles, ${Math.round(hrPct)}% HR in zone.`,
      tone: 'mixed',
    }
  }

  if (distanceWeak) {
    return {
      weekNum: w.weekNum,
      headline: `Wk ${w.weekNum}: showed up, short on miles — ${w.actualMiles.toFixed(0)}/${w.plannedMiles.toFixed(0)} mi.`,
      tone: 'mixed',
    }
  }

  if (hrWeak) {
    return {
      weekNum: w.weekNum,
      headline: `Wk ${w.weekNum}: right miles, wrong zone — ${Math.round(hrPct)}% time in zone.`,
      tone: 'mixed',
    }
  }

  // Completed and on target, just below the "nailed it" bar.
  return {
    weekNum: w.weekNum,
    headline: `Wk ${w.weekNum}: on track — ${w.completed}/${attempted} sessions.`,
    tone: 'on-track',
  }
}

// ─── Block-level rollup ──────────────────────────────────────────

/**
 * Roll up the last N weeks (default 4) into a single verdict. Skips
 * weeks with no attempted workouts so a future-dated trailing week
 * doesn't dilute the read.
 */
export function buildBlockVerdict(
  compliance: OverallCompliance,
  windowWeeks = 4,
): BlockVerdict | null {
  const recent = compliance.weeks
    .filter(w => w.completed + w.missed > 0)
    .slice(-windowWeeks)
  if (recent.length === 0) return null

  const completed = recent.reduce((s, w) => s + w.completed, 0)
  const attempted = recent.reduce((s, w) => s + w.completed + w.missed, 0)
  const completionPct = attempted > 0 ? (completed / attempted) * 100 : 0

  const plannedMiles = recent.reduce((s, w) => s + w.plannedMiles, 0)
  const actualMiles = recent.reduce((s, w) => s + w.actualMiles, 0)
  const distancePct = plannedMiles > 0
    ? Math.min(100, (actualMiles / plannedMiles) * 100)
    : null

  const hrChecked = recent.reduce((s, w) => s + w.hrCheckedWorkouts, 0)
  const hrSum = recent.reduce((s, w) => s + w.hrInZoneTotal, 0)
  const hrPct = hrChecked > 0 ? hrSum / hrChecked : null

  // Trend: are the most recent two weeks getting better or worse on
  // completion vs. the prior pair? Only meaningful with ≥4 weeks.
  let trend: 'up' | 'flat' | 'down' = 'flat'
  if (recent.length >= 4) {
    const firstHalf = recent.slice(0, Math.floor(recent.length / 2))
    const secondHalf = recent.slice(-Math.floor(recent.length / 2))
    const firstPct = pctOfAttempted(firstHalf)
    const secondPct = pctOfAttempted(secondHalf)
    const delta = secondPct - firstPct
    if (delta >= 10) trend = 'up'
    else if (delta <= -10) trend = 'down'
  }

  // Tone classification — same axes as per-week but on the rollup.
  let tone: VerdictTone
  let headline: string
  if (
    completionPct >= NAILED_COMPLETION &&
    (distancePct === null || distancePct >= NAILED_DISTANCE) &&
    (hrPct === null || hrPct >= NAILED_HR)
  ) {
    tone = 'win'
    headline = `Last ${recent.length} weeks: nailed it.`
  } else if (completionPct < COLD_COMPLETION) {
    tone = 'cold'
    headline = `Last ${recent.length} weeks: cold streak.`
  } else if (completionPct >= ON_TRACK_COMPLETION) {
    tone = 'on-track'
    headline = `Last ${recent.length} weeks: on track${trend === 'up' ? ', trending up' : trend === 'down' ? ', trending down' : ''}.`
  } else {
    tone = 'mixed'
    headline = `Last ${recent.length} weeks: drifting${trend === 'up' ? ' but trending up' : ''}.`
  }

  // Detail line — concise metrics, no jargon.
  const bits: string[] = []
  bits.push(`${completed}/${attempted} sessions`)
  if (distancePct !== null) {
    bits.push(`${Math.round(distancePct)}% of planned miles`)
  }
  if (hrPct !== null) {
    bits.push(`${Math.round(hrPct)}% HR in zone`)
  }
  const flagged = recent.reduce((s, w) => s + w.flaggedCount, 0)
  if (flagged > 0) {
    bits.push(`${flagged} flagged`)
  }
  return {
    headline,
    detail: bits.join(' · '),
    tone,
    weeksConsidered: recent.length,
  }
}

function pctOfAttempted(weeks: WeekCompliance[]): number {
  const c = weeks.reduce((s, w) => s + w.completed, 0)
  const a = weeks.reduce((s, w) => s + w.completed + w.missed, 0)
  return a > 0 ? (c / a) * 100 : 0
}
