/**
 * Per-activity Grade-Adjusted-Pace (GAP) MIM cache.
 *
 * The avg-grade running MIM (`runningMIM(grade)`) under-counts runs whose
 * average is moderate but contain short steep peaks (e.g. hill repeats).
 * `computeWholeActivityGAP` produces the proper time-weighted multiplier
 * via per-second altitude+distance sampling — but the GPS stream is only
 * fetched on-demand inside WorkoutModal.
 *
 * This module caches the GAP-derived MIM in localStorage keyed by date +
 * activity name so once a stream has been loaded the engine can use it
 * on every subsequent render. Cache persists across sessions.
 */

import type { StreamData } from './strava'
import { computeWholeActivityGAP } from '../engines/terrain/locomotion/gap'

const STORAGE_KEY_PREFIX = 'ba_run_gap_v1'

function scopedKey(athleteId?: string): string {
  return athleteId ? `${STORAGE_KEY_PREFIX}_${athleteId}` : STORAGE_KEY_PREFIX
}

function activityCacheKey(date: string, name: string): string {
  return `${date}|${name}`
}

export function loadRunGAPCache(athleteId?: string): Record<string, number> {
  try {
    const raw = localStorage.getItem(scopedKey(athleteId))
    return raw ? (JSON.parse(raw) as Record<string, number>) : {}
  } catch {
    return {}
  }
}

export function cacheRunGAP(
  date: string,
  name: string,
  gapMIM: number,
  athleteId?: string,
): void {
  if (!Number.isFinite(gapMIM) || gapMIM <= 0) return
  try {
    const cache = loadRunGAPCache(athleteId)
    cache[activityCacheKey(date, name)] = Math.round(gapMIM * 1000) / 1000
    localStorage.setItem(scopedKey(athleteId), JSON.stringify(cache))
  } catch {
    /* quota — non-fatal */
  }
}

export function getCachedRunGAP(
  date: string,
  name: string,
  athleteId?: string,
): number | null {
  const cache = loadRunGAPCache(athleteId)
  const v = cache[activityCacheKey(date, name)]
  return typeof v === 'number' && v > 0 ? v : null
}

/**
 * Compute the GAP-weighted MIM for an activity from its per-second
 * altitude + distance + time stream. Returns null if the stream is too
 * short or has no usable data — caller should fall back to avg grade.
 */
export function computeStreamGAPMIM(stream: StreamData): number | null {
  if (
    !stream ||
    !stream.altitude || !stream.distance || !stream.time ||
    stream.altitude.length < 2 ||
    stream.distance.length !== stream.altitude.length
  ) {
    return null
  }
  const totalSeconds = stream.time[stream.time.length - 1] - stream.time[0]
  if (!(totalSeconds > 0)) return null
  const totalActualDistanceM = stream.distance[stream.distance.length - 1] - stream.distance[0]
  if (!(totalActualDistanceM > 0)) return null
  try {
    const result = computeWholeActivityGAP({
      altitude: stream.altitude,
      distance: stream.distance,
      totalSeconds,
    })
    return result.equivalentFlatDistanceM / totalActualDistanceM
  } catch {
    return null
  }
}
