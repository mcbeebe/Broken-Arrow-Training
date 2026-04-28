/**
 * Per-activity eccentric load cache.
 *
 * The eccentric (descent / braking) load is computed from the per-second
 * GPS stream when the WorkoutModal loads it. We cache the per-activity
 * result in localStorage so the engine can use it on every subsequent
 * render — the stream itself is only fetched on-demand and not stored.
 *
 * The math lives in `src/engines/descent/eccentric.ts`. This module is
 * just plumbing.
 */

import type { EccentricResult } from '../engines/descent/eccentric'

const STORAGE_KEY_PREFIX = 'ba_run_eccentric_v1'

function scopedKey(athleteId?: string): string {
  return athleteId ? `${STORAGE_KEY_PREFIX}_${athleteId}` : STORAGE_KEY_PREFIX
}

function activityCacheKey(date: string, name: string): string {
  return `${date}|${name}`
}

export type CachedEccentric = EccentricResult

export function loadEccentricCache(athleteId?: string): Record<string, CachedEccentric> {
  try {
    const raw = localStorage.getItem(scopedKey(athleteId))
    return raw ? (JSON.parse(raw) as Record<string, CachedEccentric>) : {}
  } catch {
    return {}
  }
}

export function cacheEccentric(
  date: string,
  name: string,
  result: EccentricResult,
  athleteId?: string,
): void {
  if (!result || !Number.isFinite(result.averageScore) || result.averageScore <= 0) return
  try {
    const cache = loadEccentricCache(athleteId)
    cache[activityCacheKey(date, name)] = {
      averageScore: Math.round(result.averageScore * 100) / 100,
      totalKmScore: Math.round(result.totalKmScore * 1000) / 1000,
      buckets: {
        mild: Math.round(result.buckets.mild),
        moderate: Math.round(result.buckets.moderate),
        severe: Math.round(result.buckets.severe),
      },
    }
    localStorage.setItem(scopedKey(athleteId), JSON.stringify(cache))
  } catch {
    /* quota — non-fatal */
  }
}

export function getCachedEccentric(
  date: string,
  name: string,
  athleteId?: string,
): CachedEccentric | null {
  const cache = loadEccentricCache(athleteId)
  return cache[activityCacheKey(date, name)] ?? null
}
