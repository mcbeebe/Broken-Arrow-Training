import type { PlannedDay, ReadinessScore, PerformanceMetrics } from '../types'
import { getPlannedDrills } from './drills'

/**
 * Pure heuristic note generators used by the ambient Coach surfaces
 * (DayCard inline note + WorkoutModal coach take). Option A wiring —
 * no LLM calls, just readable rules-based text derived from readiness,
 * plan data, and a few body-level flags.
 *
 * Design rule: the coach only speaks when there's something worth
 * saying. DayCard notes return `null` on "nothing to add" days so the
 * UI stays quiet. WorkoutModal always produces a take because the
 * user explicitly opened the workout and expects a framing line.
 */

export interface CoachDayNote {
  /** Short line, ~1-2 sentences. Shown inline on the DayCard. */
  text: string
  /** Visual accent: 'heads_up' (amber), 'flag' (red), 'info' (indigo). */
  tone: 'info' | 'heads_up' | 'flag'
}

export interface CoachWorkoutTake {
  /** Coach's read of the workout, ~2-3 sentences. */
  text: string
  /** Single inline tip, optional — shown beneath the main take. */
  tip?: string
}

// ─── DayCard note ─────────────────────────────────────────────

/**
 * Decide whether the Coach has something worth saying on this day's
 * card. Returns null when silence is the right call (most green days,
 * rest days with no context, etc).
 */
export function generateDayCardNote(
  day: PlannedDay,
  _weekNum: number | undefined,
  readiness: ReadinessScore | undefined,
  raceWeek: boolean,
): CoachDayNote | null {
  const { type } = day

  // Completed workouts don't need forward-looking execution cues.
  // "Readiness is 60/100 — easy effort only" is useless on a run
  // that's already in the books. The modal's Coach's take handles
  // post-execution reflection via buildCompletedTake.
  if (day.actual) return null

  const drillDay = !!day.isDrillDay
  const plannedDrills = getPlannedDrills(day)

  // Race-week flagging: be loud about tissue load on limited days
  if (raceWeek && type === 'limited') {
    return {
      text: `Race week — keep this truly limited. 20 min at the short end, all Z1. The legs you save today run Saturday.`,
      tone: 'flag',
    }
  }

  // Readiness-driven heads-ups (only on harder days; don't preach on rest)
  if (readiness && (type === 'quality' || type === 'long' || type === 'run')) {
    if (readiness.status === 'RED') {
      return {
        text: `Low readiness (${readiness.displayScore}/100). ${readiness.adjustment || 'Consider shortening or moving this to a fresher day.'}`,
        tone: 'flag',
      }
    }
    if (readiness.status === 'YELLOW') {
      return {
        text: `Readiness is ${readiness.displayScore}/100 — ${type === 'quality' ? 'drop intervals, hold Z2.' : 'easy effort only, no tempo work.'}`,
        tone: 'heads_up',
      }
    }
  }

  // Drill-day nudge on run days that are scheduled drills.
  // (day.actual is always undefined here because of the early return
  // above, so we don't need to check completion status — by definition
  // drills can't have been done yet on a not-yet-done workout.)
  if ((type === 'run' || type === 'long') && drillDay) {
    return {
      text: `Drill day. A-skips + strides are the single highest-leverage form cue for your stride — don't skip them.`,
      tone: 'info',
    }
  }

  // Quality workout priming (always worth noting on quality)
  if (type === 'quality' && (!readiness || readiness.status === 'GREEN' || readiness.status === 'PEAK')) {
    return {
      text: `Quality day — the prescription matters more than the volume. Hit the zone splits, recover fully between.`,
      tone: 'info',
    }
  }

  // Long run on peak readiness
  if (type === 'long' && readiness?.status === 'PEAK') {
    return {
      text: `You're peaked — this is the day to go long without fear. Hold Z2 for the bulk and let it stretch.`,
      tone: 'info',
    }
  }

  // Explicit planned drills — day.actual is always undefined here due to
  // the early return above, so no completion check is needed.
  if (plannedDrills.length > 0 && (type === 'run' || type === 'quality')) {
    return {
      text: `Plan has drills prescribed — they're cheap insurance and the single easiest way to protect form as volume climbs.`,
      tone: 'info',
    }
  }

  // Silence: no strong signal
  return null
}

// ─── Completed-workout reflection ─────────────────────────────

import { parseZoneRange } from './zones'

/**
 * Build a day-specific take for a workout that's already been logged.
 * Focuses on what happened — distance, time, HR, effort — not today's
 * readiness or what the athlete should do next.
 */
function buildCompletedTake(day: PlannedDay): CoachWorkoutTake {
  const a = day.actual!
  const { type } = day
  const parts: string[] = []
  const tips: string[] = []

  // Distance vs planned
  const plannedMiMatch = day.zone.match(/([\d.]+)\s*mi/)
  const plannedMi = plannedMiMatch ? parseFloat(plannedMiMatch[1]) : null
  if (a.distance > 0 && plannedMi) {
    const ratio = a.distance / plannedMi
    if (ratio >= 0.95 && ratio <= 1.1) {
      parts.push(`Distance nailed — ${a.distance.toFixed(1)} mi on a ${plannedMi} mi target.`)
    } else if (ratio > 1.1) {
      parts.push(`Went long: ${a.distance.toFixed(1)} mi vs ${plannedMi} planned. Fine if legs felt good, watch accumulated fatigue.`)
    } else if (ratio >= 0.7) {
      parts.push(`Came in at ${a.distance.toFixed(1)} mi vs ${plannedMi} planned — a bit short but still counted.`)
    } else {
      parts.push(`Only ${a.distance.toFixed(1)} mi of the ${plannedMi} planned — something cut it short.`)
    }
  } else if (a.distance > 0) {
    parts.push(`Logged ${a.distance.toFixed(1)} mi.`)
  }

  // Duration
  if (a.movingTime > 0) {
    const min = Math.round(a.movingTime / 60)
    parts.push(`${min} min moving time.`)
  }

  // HR vs plan zone
  if (a.avgHR && a.avgHR > 0) {
    const range = parseZoneRange(day.zone)
    if (range) {
      if (a.avgHR >= range.low && a.avgHR <= range.high) {
        parts.push(`Avg HR ${a.avgHR} was right in the ${range.low}–${range.high} target zone.`)
      } else if (a.avgHR > range.high) {
        const over = a.avgHR - range.high
        parts.push(`Avg HR ${a.avgHR} ran ${over} bpm above the ${range.low}–${range.high} target — pushed harder than planned.`)
        tips.push('If this was intentional, log it. If not, check pacing next time.')
      } else {
        parts.push(`Avg HR ${a.avgHR} was below the ${range.low}–${range.high} target — conservative effort.`)
      }
    } else {
      parts.push(`Avg HR ${a.avgHR}.`)
    }
  }

  // Elevation
  if (a.elevationGain > 200) {
    parts.push(`${a.elevationGain} ft of climbing — solid vert work.`)
  }

  // RPE
  if (a.rpe) {
    if (a.rpe >= 8) parts.push(`RPE ${a.rpe}/10 — that was a hard effort.`)
    else if (a.rpe <= 3) parts.push(`RPE ${a.rpe}/10 — truly easy.`)
  }

  // Strength-specific
  if (type === 'strength' && a.strengthLog?.length) {
    parts.push(`${a.strengthLog.length} exercises logged.`)
    tips.push('Track load progression week-over-week — that\'s what drives adaptation.')
  }

  // Drills
  if (a.drills?.completed) {
    tips.push('Drills done — good investment in form.')
  }

  if (parts.length === 0) {
    parts.push(`${a.name || day.workout} — done.`)
  }

  return {
    text: parts.join(' '),
    tip: tips.length > 0 ? tips[0] : 'Review the chart below to see where effort drifted.',
  }
}

// ─── WorkoutModal coach take (upcoming/today) ─────────────────

/**
 * Generate a short "Coach" paragraph shown at the top of the workout
 * modal. Unlike the DayCard note, this always returns something —
 * opening the modal is an explicit request for detail.
 */
export function generateWorkoutTake(
  day: PlannedDay,
  readiness: ReadinessScore | undefined,
  latestPerf: PerformanceMetrics | null,
): CoachWorkoutTake {
  const { type } = day
  const drillDay = !!day.isDrillDay
  const hasActual = !!day.actual

  // Already logged — reflect on execution, not today's readiness
  if (hasActual) {
    return buildCompletedTake(day)
  }

  // Readiness context frames everything
  const readinessLine = readiness
    ? readiness.status === 'RED'
      ? `Readiness is low (${readiness.displayScore}/100) — consider whether this should move or shrink. `
      : readiness.status === 'YELLOW'
      ? `Readiness is moderate (${readiness.displayScore}/100) — dial intensity down a notch. `
      : ''
    : ''

  // Fatigue overlay
  const fatigueFlag = latestPerf && latestPerf.tsb < -20
    ? `Recovery balance is deep in the hole (TSB ${latestPerf.tsb.toFixed(0)}) — respect it. `
    : ''

  switch (type) {
    case 'quality':
      return {
        text: `${readinessLine}${fatigueFlag}Quality work is a prescription, not a race. Hit the target splits in Z${day.zone.replace(/[^0-9–-]/g, '')} and take the full recovery — depth of the recovery is what lets the next rep count.`,
        tip: drillDay ? 'This is your drill day — A-skips before the hard stuff.' : 'Short strides in warm-up wake up the turnover.',
      }
    case 'long':
      return {
        text: `${readinessLine}${fatigueFlag}Long runs build the aerobic engine. Stay in ${day.zone} for the bulk — if HR drifts up in the last third without effort change, slow down. Finishing strong matters more than running fast.`,
        tip: 'Fuel early and often — not at bonk.',
      }
    case 'run':
      return {
        text: `${readinessLine}Straightforward easy day. Conversational pace — if you can't hold a sentence, you're too hot. The whole point is volume without cost.`,
        tip: drillDay
          ? 'Drill day — A-skips + strides after the run are cheap insurance.'
          : undefined,
      }
    case 'strength':
      return {
        text: `${readinessLine}${fatigueFlag}Strength supports running — it doesn't compete. Move well under tension. Log what you lifted; week-over-week progression on load or reps is the metric that matters.`,
        tip: 'Skip the ego weight. Quality > load.',
      }
    case 'limited':
      return {
        text: `${readinessLine}Limited means LIMITED. Short, easy, and done. You're protecting tissue, not training it.`,
        tip: 'If in doubt, go shorter.',
      }
    case 'rest':
      return {
        text: `Rest is when adaptation happens. Walk if you feel like it, stretch if you feel like it — otherwise don't feel guilty about doing nothing. Recovery is the workout.`,
      }
    case 'race':
      return {
        text: `Race day. The work is done. Trust the plan, start conservative, and let the race come to you.`,
        tip: 'Negative-split intent — the second half should be faster if you paced the first right.',
      }
    case 'cross':
      return {
        text: `${readinessLine}Cross-training preserves aerobic fitness without the impact tax. Keep it in the same zone you'd run — easy means easy.`,
      }
    case 'travel':
      return {
        text: `Travel day — movement over miles. A 20-min walk after landing is worth more than skipping it and "making it up" tomorrow.`,
      }
    default:
      return {
        text: `${readinessLine}Execute as planned. Pay attention to the body, log what you did, and let the rest of the week unfold from there.`,
      }
  }
}
