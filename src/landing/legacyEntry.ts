/**
 * The root page's legacy entry guard (initiative 003, design-spec.md
 * § Legacy entry guard).
 *
 * The app used to live at `/`; it now lives at `/app/`. Installed home-screen
 * apps (iOS never refreshes a saved URL, so this is permanent), notification
 * taps, Strava's OAuth callback, airlock hand-offs, links carrying `?view=` or
 * an athlete hash, and signed-in members all still arrive at `/`. This module
 * decides which of them belong in the app. It must stay tiny and import
 * nothing from the app: it runs before anything else on the root page.
 */
import { SECTION_IDS } from './content'

/** Where the app is served. */
export const APP_PATH = '/app/'

/** Query keys only the app understands: deep links, Strava OAuth, the airlock. */
export const APP_PARAMS = ['view', 'code', 'scope', 'state', 'error', '__migrate'] as const

/**
 * Hashes that belong to the landing page: none, the skip-link target, and
 * each section. Any other non-empty hash is the app's athlete id.
 */
export const LANDING_ANCHORS: ReadonlySet<string> = new Set([
  '',
  '#main',
  ...SECTION_IDS.map(id => `#${id}`),
])

const MIGRATE_HASH_PREFIX = '#__attune_migrate'
const SESSION_KEY = 'ba_auth_session'

export interface LegacyEntryInput {
  /** `location.search`, e.g. `'?view=coach'`. */
  search: string
  /** `location.hash`, e.g. `'#mike'`. */
  hash: string
  /** Launched as an installed home-screen app. */
  standalone: boolean
  /** `localStorage` holds an auth session (expired or not). */
  hasSession: boolean
  /** Forward every visitor; true until the landing page launches. */
  forwardAll: boolean
}

/**
 * Decide whether a visit to `/` belongs in the app.
 *
 * @returns `/app/` + search + hash, byte-for-byte, when the visitor should be
 *   forwarded; `null` when the landing page should render.
 */
export function legacyEntryTarget(input: LegacyEntryInput): string | null {
  const { search, hash, standalone, hasSession, forwardAll } = input
  const target = APP_PATH + search + hash
  if (forwardAll) return target

  const params = new URLSearchParams(search)
  if (APP_PARAMS.some(key => params.has(key))) return target
  if (hash.startsWith(MIGRATE_HASH_PREFIX) || !LANDING_ANCHORS.has(hash)) return target
  if (standalone) return target
  if (hasSession && params.get('home') !== '1') return target
  return null
}

/**
 * Whether the page was launched from a home-screen install.
 *
 * @returns true for `display-mode: standalone` or iOS `navigator.standalone`.
 */
export function isStandalone(): boolean {
  try {
    if (typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches) {
      return true
    }
    return (navigator as Navigator & { standalone?: boolean }).standalone === true
  } catch {
    return false
  }
}

/**
 * Whether this browser holds an app session. Only the key's presence counts:
 * an expired session still belongs in the app, which shows its own sign-in.
 *
 * @returns false when there is no session or storage is unavailable.
 */
export function hasStoredSession(): boolean {
  try {
    return localStorage.getItem(SESSION_KEY) !== null
  } catch {
    return false
  }
}
