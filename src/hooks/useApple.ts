import { useState, useEffect, useCallback, useMemo } from 'react'
import type { GarminHealthData } from '../types'
import {
  fetchAppleHealth,
  fetchAppleActivities,
  getCachedAppleHealth,
  cacheAppleHealth,
  mergeAppleHealth,
  getCachedAppleActivities,
  cacheAppleActivities,
  mergeAppleActivities,
  getAppleLastSync,
  markAppleSynced,
  isAppleConfigured,
  isAppleSyncStale,
  type AppleActivity,
} from '../utils/apple'
import { getStoredSession } from '../utils/auth'

export interface UseAppleReturn {
  /** True once any Apple Health data (recovery or workouts) is present. */
  connected: boolean
  healthData: GarminHealthData[]
  appleActivities: AppleActivity[]
  /** Per-activity steep-descent vertical keyed `${date}|${name}`, in the
   *  shape `useReadiness` expects. `averageScore: 0` makes the DOMS
   *  carry-forward fall back to its static coefficient (it only uses the
   *  eccentric score when ≥ 1), while `hardDescentVerticalMeters` drives the
   *  readiness load-dampening pipeline. */
  eccentricByActivity: Record<string, { averageScore: number; hardDescentVerticalMeters?: number }>
  lastSync: string | null
  loading: boolean
  error: string | null
  sync: () => Promise<void>
}

/**
 * Apple Health read hook — the web counterpart to the iOS uploader.
 *
 * Unlike `useGarmin` there is no connect/MFA flow: the "connection" is simply
 * a signed-in session plus data the iOS app has already uploaded. Data is
 * fetched with the session Bearer token and merged into the same
 * `GarminHealthData` / `GarminActivity` shapes the rest of the app consumes.
 */
export function useApple(athleteId?: string): UseAppleReturn {
  const [healthData, setHealthData] = useState<GarminHealthData[]>(() => getCachedAppleHealth(athleteId))
  const [appleActivities, setAppleActivities] = useState<AppleActivity[]>(() => getCachedAppleActivities(athleteId))
  const [lastSync, setLastSync] = useState<string | null>(() => getAppleLastSync(athleteId))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Re-load from storage when the active athlete changes.
  useEffect(() => {
    setHealthData(getCachedAppleHealth(athleteId))
    setAppleActivities(getCachedAppleActivities(athleteId))
    setLastSync(getAppleLastSync(athleteId))
    setError(null)
  }, [athleteId])

  const sync = useCallback(async () => {
    if (!isAppleConfigured() || !getStoredSession()?.token) return
    setLoading(true)
    setError(null)
    try {
      const [health, activities] = await Promise.all([
        fetchAppleHealth(30, athleteId),
        fetchAppleActivities(120, athleteId),
      ])
      if (health.length > 0) {
        const merged = mergeAppleHealth(getCachedAppleHealth(athleteId), health)
        cacheAppleHealth(merged, athleteId)
        setHealthData(merged)
      }
      if (activities.length > 0) {
        const mergedActivities = mergeAppleActivities(getCachedAppleActivities(athleteId), activities)
        cacheAppleActivities(mergedActivities, athleteId)
        setAppleActivities(mergedActivities)
      }
      markAppleSynced(athleteId)
      setLastSync(getAppleLastSync(athleteId))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Apple Health sync failed')
    } finally {
      setLoading(false)
    }
  }, [athleteId])

  // Auto-sync on open when stale (matches useGarmin's 10-minute window).
  useEffect(() => {
    if (isAppleConfigured() && getStoredSession()?.token && isAppleSyncStale(athleteId, 10 * 60 * 1000)) {
      void sync()
    }
  }, [athleteId, sync])

  const eccentricByActivity = useMemo(() => {
    const m: Record<string, { averageScore: number; hardDescentVerticalMeters?: number }> = {}
    for (const a of appleActivities) {
      const hd = a.hardDescentVerticalMeters
      if (hd && hd > 0) {
        m[`${a.date}|${a.name}`] = { averageScore: 0, hardDescentVerticalMeters: hd }
      }
    }
    return m
  }, [appleActivities])

  const connected = healthData.length > 0 || appleActivities.length > 0

  return { connected, healthData, appleActivities, eccentricByActivity, lastSync, loading, error, sync }
}
