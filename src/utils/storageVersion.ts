/**
 * Storage versioning — automatically clears stale localStorage caches
 * when the app's data format changes (e.g., ATE engine migration).
 *
 * Bump CURRENT_VERSION whenever you change the shape of cached data.
 */

const VERSION_KEY = 'ba_storage_version'
const CURRENT_VERSION = 3  // v3 = timezone fix + Garmin detail + AI Coach

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
  // Preserve auth tokens AND user-entered data (manual logs, day swaps, soreness).
  // These are NOT caches — they're user input that shouldn't be lost on sync refresh.
  const preserveKeys = ['ba_strava_tokens', 'ba_garmin_connected', VERSION_KEY]
  const preservePrefixes = ['ba_manual_logs', 'ba_day_swaps', 'ba_soreness']

  for (const key of ALL_BA_KEYS) {
    if (!preserveKeys.includes(key) && !preservePrefixes.some(p => key.startsWith(p))) {
      localStorage.removeItem(key)
    }
  }

  // Clear stream caches but NOT user-entered data
  const keysToRemove: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (!key) continue
    // Clear Strava stream caches
    if (key.startsWith('ba_strava_streams_')) {
      keysToRemove.push(key)
    }
    // Clear Garmin caches (athlete-specific)
    if (key.startsWith('ba_garmin_health_') || key.startsWith('ba_garmin_activities_') || key.startsWith('ba_garmin_activity_details_')) {
      keysToRemove.push(key)
    }
  }
  keysToRemove.forEach(k => localStorage.removeItem(k))

  console.log('[StorageVersion] Cached data cleared (manual logs, swaps, soreness preserved)')
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
