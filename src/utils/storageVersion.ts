/**
 * Storage versioning — automatically clears stale localStorage caches
 * when the app's data format changes (e.g., ATE engine migration).
 *
 * Bump CURRENT_VERSION whenever you change the shape of cached data.
 */

const VERSION_KEY = 'ba_storage_version'
const CURRENT_VERSION = 2  // v2 = ATE engine migration (EPOC, new scoring, expanded sport types)

/** All localStorage keys used by the app */
const ALL_BA_KEYS = [
  'ba_garmin_health',
  'ba_garmin_last_sync',
  'ba_garmin_connected',
  'ba_garmin_activities',
  'ba_garmin_activity_details',
  'ba_strava_tokens',
  'ba_strava_activities',
  'ba_strava_last_sync',
  'ba_day_swaps',
  'ba_manual_logs',
]

/**
 * Check stored version against current. If mismatch, clear all cached data
 * (preserving auth tokens so user doesn't have to re-authenticate).
 * Call this once on app startup.
 */
export function checkStorageVersion(): void {
  const stored = localStorage.getItem(VERSION_KEY)
  const storedVersion = stored ? parseInt(stored, 10) : 0

  if (storedVersion < CURRENT_VERSION) {
    console.log(`[StorageVersion] Upgrading from v${storedVersion} to v${CURRENT_VERSION} — clearing cached data`)
    clearAllCachedData()
    localStorage.setItem(VERSION_KEY, String(CURRENT_VERSION))
  }
}

/**
 * Clear all cached activity/health data. Preserves Strava tokens
 * (so user stays authenticated) but forces a fresh sync.
 */
export function clearAllCachedData(): void {
  // Clear known keys (except auth tokens)
  const preserveKeys = ['ba_strava_tokens', 'ba_garmin_connected', VERSION_KEY]

  for (const key of ALL_BA_KEYS) {
    if (!preserveKeys.includes(key)) {
      localStorage.removeItem(key)
    }
  }

  // Also clear any stream caches (ba_strava_streams_*)
  const keysToRemove: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key && key.startsWith('ba_strava_streams_')) {
      keysToRemove.push(key)
    }
    // Also clear any athlete-specific keys
    if (key && (key.startsWith('ba_day_swaps_') || key.startsWith('ba_manual_logs_'))) {
      keysToRemove.push(key)
    }
  }
  keysToRemove.forEach(k => localStorage.removeItem(k))

  console.log('[StorageVersion] Cached data cleared — next sync will fetch fresh data')
}

/**
 * Nuclear option: clear EVERYTHING including auth tokens.
 * User will need to re-authenticate with Strava/Garmin.
 */
export function clearAllAppData(): void {
  const keysToRemove: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key && key.startsWith('ba_')) {
      keysToRemove.push(key)
    }
  }
  keysToRemove.forEach(k => localStorage.removeItem(k))
  console.log('[StorageVersion] All app data cleared')
}
