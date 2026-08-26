import { HR_ZONE_TOLERANCE_BPM } from './zones'

/**
 * Warm-up / cool-down-aware time-in-zone analysis from a per-second HR stream.
 *
 * Why this exists: a single "% time in zone" over the WHOLE session punishes
 * the things good sessions are made of. A 10-15 min easy warm-up jog sits
 * below the target band and an interval/sharpener intentionally spikes ABOVE
 * it — both used to count as "out of zone," dragging the number (and the
 * workout grade) down for a session that did exactly what it should.
 *
 * Two ideas fix that:
 *   1. Trim the warm-up (everything before HR first reaches the band) and the
 *      cool-down (everything after HR is last in the band) out of BOTH the
 *      numerator and the denominator. Easy bookends no longer count against
 *      you.
 *   2. Report `workingPct` — time at or above the target's lower bound —
 *      alongside the strict in-band `inZonePct`. Interval work that overshoots
 *      into Z4/Z5 is credited as work done, not penalized.
 *
 * Callers pick the metric that fits the session: steady runs read `inZonePct`,
 * interval/quality sessions read `workingPct`.
 */

export interface HRStream {
  time: number[]
  heartrate: number[]
}


/**
 * Read a cached per-second HR stream (Strava or Garmin) from localStorage
 * for an activity. Null when nothing is cached. Shared by grading and the
 * adaptive engine's drift math.
 */
export function getCachedHRStream(activityId: number | string | undefined): HRStream | null {
  if (!activityId) return null
  const keys = [
    `ba_strava_streams_${activityId}`,
    `ba_garmin_streams_${activityId}`,
  ]
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (k && (k.includes('strava_streams') || k.includes('garmin_streams')) && k.endsWith(String(activityId))) {
      keys.push(k)
    }
  }
  for (const k of keys) {
    try {
      const raw = localStorage.getItem(k)
      if (!raw) continue
      const stream = JSON.parse(raw)
      if (stream?.heartrate?.length && stream?.time?.length) {
        return { time: stream.time, heartrate: stream.heartrate }
      }
    } catch {
      // Skip malformed entries
    }
  }
  return null
}

export interface ZoneTarget {
  low: number
  high: number
}

export interface ZoneCompliance {
  /** % of the trimmed (warm-up/cool-down removed) session strictly within
   *  the target band (±tolerance). Best for steady-state runs. */
  inZonePct: number
  /** % of the trimmed session at or above the target's lower bound — credits
   *  interval work that overshoots the cap. Best for quality/sharpener days. */
  workingPct: number
  /** Seconds counted after trimming the easy bookends. */
  trimmedSec: number
  /** Seconds of leading warm-up that were excluded. */
  warmupSec: number
  /** Seconds of trailing cool-down that were excluded. */
  cooldownSec: number
}

const EMPTY: ZoneCompliance = {
  inZonePct: 0,
  workingPct: 0,
  trimmedSec: 0,
  warmupSec: 0,
  cooldownSec: 0,
}

/**
 * Sum the duration of stream samples between indices [start, end] inclusive,
 * applying the same gap guard the rest of the app uses (ignore non-positive
 * or >`gapCap`s deltas, which are pauses / device dropouts).
 */
function sumSeconds(
  stream: HRStream,
  predicate: (hr: number) => boolean,
  start: number,
  end: number,
  gapCap: number,
): number {
  let secs = 0
  for (let i = Math.max(1, start); i <= end; i++) {
    const dt = stream.time[i] - stream.time[i - 1]
    if (dt <= 0 || dt > gapCap) continue
    if (predicate(stream.heartrate[i])) secs += dt
  }
  return secs
}

/**
 * Analyze a per-second HR stream against a target zone band, excluding the
 * warm-up ramp and cool-down. `tolerance` widens the band on both sides
 * (default ±3 bpm, matching the rest of the app). `gapCap` is the max sample
 * gap (s) treated as continuous time.
 */
export function computeZoneCompliance(
  stream: HRStream | null | undefined,
  target: ZoneTarget,
  tolerance: number = HR_ZONE_TOLERANCE_BPM,
  gapCap: number = 60,
): ZoneCompliance {
  if (!stream || stream.heartrate.length < 2 || stream.time.length !== stream.heartrate.length) {
    return EMPTY
  }
  const low = target.low - tolerance
  const high = target.high + tolerance
  const hrs = stream.heartrate

  // Warm-up ends at the first sample that reaches the band; cool-down starts
  // after the last sample in the band. Everything between is the "work"
  // window we actually grade. If HR never reaches the band (e.g. an all-easy
  // recovery jog), there's nothing to trim — grade the whole thing.
  let firstInBand = -1
  let lastInBand = -1
  for (let i = 0; i < hrs.length; i++) {
    if (hrs[i] >= low) {
      if (firstInBand === -1) firstInBand = i
      lastInBand = i
    }
  }
  const start = firstInBand === -1 ? 1 : Math.max(1, firstInBand)
  const end = lastInBand === -1 ? hrs.length - 1 : lastInBand

  const warmupSec = firstInBand === -1 ? 0 : sumSeconds(stream, () => true, 1, firstInBand, gapCap)
  const cooldownSec = lastInBand === -1 ? 0 : sumSeconds(stream, () => true, lastInBand + 1, hrs.length - 1, gapCap)
  const trimmedSec = sumSeconds(stream, () => true, start, end, gapCap)
  if (trimmedSec <= 0) return { ...EMPTY, warmupSec, cooldownSec }

  const inBandSec = sumSeconds(stream, hr => hr >= low && hr <= high, start, end, gapCap)
  const workingSec = sumSeconds(stream, hr => hr >= low, start, end, gapCap)

  return {
    inZonePct: (inBandSec / trimmedSec) * 100,
    workingPct: (workingSec / trimmedSec) * 100,
    trimmedSec,
    warmupSec,
    cooldownSec,
  }
}

/** Interval/quality detail like "3×5 min @ Z3" or "4×90 sec uphill". */
const INTERVAL_DETAIL = /\d+\s*[×x]\s*\d+\s*(?:min|sec)/i

/**
 * Whether a session should be graded as interval work (credit time at or
 * above target) rather than steady-state (strict in-band). True for the
 * `quality` plan type or any day whose detail reads as reps.
 */
export function isIntervalSession(type: string, detail?: string): boolean {
  if (type === 'quality') return true
  return !!detail && INTERVAL_DETAIL.test(detail)
}
