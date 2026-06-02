/**
 * Cross-origin data migration for the attune.coach cutover.
 *
 * localStorage is origin-bound, so when the frontend moves from
 * `mcbeebe.github.io/Broken-Arrow-Training/` to `attune.coach`, every
 * byte of user data (plan edits, manual logs, soreness, coach memory,
 * calibrations, Strava/Garmin tokens) is stranded behind the redirect.
 *
 * Strategy: a one-tap postMessage bridge. The OLD origin opens a popup
 * to the NEW origin with `?__migrate=1`, posts the payload, then forwards
 * the user to the new origin preserving `?view=...` and `#athleteId`.
 *
 * Build-time env wiring:
 *   - legacy build sets VITE_TARGET_ORIGIN=https://attune.coach (sender)
 *   - attune build sets VITE_SOURCE_ORIGIN=https://mcbeebe.github.io (receiver)
 *
 * The preserve allowlist below mirrors and extends the pattern in
 * `storageVersion.ts:clearAllCachedData` — anything that's user input
 * (decisions, edits, history) crosses; anything that's a regenerable
 * cache (Strava/Garmin streams, weather) is left behind to rebuild on
 * the next sync.
 */

export const MIGRATE_PROTOCOL_VERSION = 1

/**
 * Allowlist of keys to migrate. Prefixes match `<prefix><athleteId>` or
 * `<prefix><athleteId>_<extra>` patterns; exact keys are global.
 */
const PRESERVE_PREFIXES = [
  'ba_plan_edits_',
  'ba_plan_overrides_',
  'ba_manual_logs_',
  'ba_day_swaps_',
  'ba_soreness_',
  'ba_onboarding_',
  'ba_onboarding_redo_',
  'ba_display_prefs_v1_',
  'ba_show_technical_terms_',
  'ba_coach_memory_v1_',
  'ba_coach_turn_ui_v1_',
  'ba_coach_insight_proposal_v1_',
  'ba_coach_daily_seeded_v1_',
  'ba_coach_insight_seen_v1_',
  'ba_coach_ping_v1_',
  'ba_hr_zones_override_',
  'ba_max_hr_override_',
  'ba_mim_calibration_',
  'ba_doms_calibration_',
  'ba_run_eccentric_v1_',
  'ba_run_gap_v1_',
  'ba_workout_time_pref_v1_',
  'ba_athlete_home_v1_',
  'ba_coach_font_scale_',
  'ba_tutorial_seen_',
  'ba_strava_tokens_',
  'ba_garmin_connected_',
  'ba_garmin_display_name_',
] as const

const PRESERVE_EXACT = [
  'ba_theme',
  'ba_palette',
  'ba_auth_session',
  'ba_storage_version',
] as const

const SESSION_PRESERVE_EXACT = ['ba_initial_view'] as const

export interface MigrationPayload {
  v: typeof MIGRATE_PROTOCOL_VERSION
  ts: number
  items: Record<string, string>
  session: Record<string, string>
}

function isPreservedKey(key: string): boolean {
  if (PRESERVE_EXACT.includes(key as (typeof PRESERVE_EXACT)[number])) return true
  return PRESERVE_PREFIXES.some(p => key.startsWith(p))
}

export function collectMigrationPayload(): MigrationPayload {
  const items: Record<string, string> = {}
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (!key) continue
    if (!isPreservedKey(key)) continue
    const value = localStorage.getItem(key)
    if (value !== null) items[key] = value
  }
  const session: Record<string, string> = {}
  for (const key of SESSION_PRESERVE_EXACT) {
    const value = sessionStorage.getItem(key)
    if (value !== null) session[key] = value
  }
  return { v: MIGRATE_PROTOCOL_VERSION, ts: Date.now(), items, session }
}

/**
 * Write a payload into local + session storage. Merge semantics:
 *   - Write a key only if it's absent locally. Anything already on the
 *     new origin wins, so a user who opened attune.coach first and
 *     started a session doesn't get clobbered. Caveat: a second
 *     migration won't propagate updates — that's the right call for the
 *     cutover window (first run sets the floor; users who keep working
 *     on the legacy origin and re-migrate must clear data first).
 *   - `ba_storage_version` takes the max so a forward-bumped local
 *     version isn't reset by an older incoming one.
 */
export function applyMigrationPayload(payload: MigrationPayload): { written: number } {
  let written = 0
  for (const [key, value] of Object.entries(payload.items)) {
    if (key === 'ba_storage_version') {
      const incoming = parseInt(value, 10)
      const local = parseInt(localStorage.getItem(key) ?? '0', 10)
      const next = Math.max(
        Number.isFinite(incoming) ? incoming : 0,
        Number.isFinite(local) ? local : 0,
      )
      localStorage.setItem(key, String(next))
      written++
      continue
    }
    if (localStorage.getItem(key) === null) {
      localStorage.setItem(key, value)
      written++
    }
  }
  for (const [key, value] of Object.entries(payload.session)) {
    if (sessionStorage.getItem(key) === null) {
      sessionStorage.setItem(key, value)
    }
  }
  return { written }
}

interface SendResult {
  ok: boolean
  count?: number
  error?: 'popup-blocked' | 'timeout' | 'rejected' | 'empty'
}

/**
 * Open a popup to `targetOrigin/?__migrate=1`, postMessage the payload,
 * await ack, then `location.replace` to the target preserving the
 * current `?view=` query and `#athleteId` hash.
 *
 * MUST be called from a user-gesture handler (button click) or the
 * popup blocker will kill it.
 */
export async function sendMigration(
  targetOrigin: string,
  opts: { timeoutMs?: number } = {},
): Promise<SendResult> {
  const timeoutMs = opts.timeoutMs ?? 15000
  const payload = collectMigrationPayload()

  if (Object.keys(payload.items).length === 0 && Object.keys(payload.session).length === 0) {
    // Nothing to migrate — just forward (e.g. brand-new visitor on old origin)
    location.replace(targetOrigin + window.location.search + window.location.hash)
    return { ok: true, count: 0, error: 'empty' }
  }

  const popup = window.open(
    `${targetOrigin}/?__migrate=1`,
    'attune-migrate',
    'width=520,height=560,noopener=no',
  )
  if (!popup) return { ok: false, error: 'popup-blocked' }

  return new Promise<SendResult>(resolve => {
    let resolved = false
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== targetOrigin) return
      const data = event.data as { type?: string; count?: number } | null
      if (!data?.type) return
      if (data.type === 'MIGRATE_READY') {
        popup.postMessage({ type: 'MIGRATE_DATA', payload }, targetOrigin)
      } else if (data.type === 'MIGRATE_ACK') {
        cleanup()
        try { popup.close() } catch { /* ignore */ }
        resolved = true
        const forwardUrl = targetOrigin + window.location.search + window.location.hash
        sessionStorage.setItem('ba_migration_done', '1')
        location.replace(forwardUrl)
        resolve({ ok: true, count: data.count })
      }
    }
    const timer = window.setTimeout(() => {
      if (resolved) return
      cleanup()
      try { popup.close() } catch { /* ignore */ }
      resolve({ ok: false, error: 'timeout' })
    }, timeoutMs)
    function cleanup() {
      window.removeEventListener('message', onMessage)
      window.clearTimeout(timer)
    }
    window.addEventListener('message', onMessage)
  })
}

/**
 * Receiver side: register a `message` listener that strictly checks
 * `event.origin` against the configured source origin, applies the
 * payload, then posts an ack. Resolves when one valid message arrives.
 */
export function receiveMigration(allowedOrigin: string): Promise<{ count: number }> {
  return new Promise(resolve => {
    function onMessage(event: MessageEvent) {
      if (event.origin !== allowedOrigin) return
      const data = event.data as { type?: string; payload?: MigrationPayload } | null
      if (data?.type !== 'MIGRATE_DATA' || !data.payload) return
      if (data.payload.v !== MIGRATE_PROTOCOL_VERSION) return
      const { written } = applyMigrationPayload(data.payload)
      window.removeEventListener('message', onMessage)
      if (event.source && 'postMessage' in event.source) {
        ;(event.source as Window).postMessage(
          { type: 'MIGRATE_ACK', count: written },
          { targetOrigin: allowedOrigin },
        )
      }
      resolve({ count: written })
    }
    window.addEventListener('message', onMessage)
    // Tell the opener we're ready to receive
    if (window.opener) {
      window.opener.postMessage({ type: 'MIGRATE_READY' }, allowedOrigin)
    }
  })
}

/**
 * Tier-2 fallback: download the payload as a JSON file for manual
 * transfer if the popup bridge is blocked. Filename includes a
 * timestamp so multiple exports don't clobber each other.
 */
export function exportToFile(): void {
  const payload = collectMigrationPayload()
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  a.href = url
  a.download = `attune-migration-${stamp}.json`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export async function importFromFile(file: File): Promise<{ written: number }> {
  const text = await file.text()
  const payload = JSON.parse(text) as MigrationPayload
  if (payload.v !== MIGRATE_PROTOCOL_VERSION) {
    throw new Error(`Unsupported migration file version: ${payload.v}`)
  }
  return applyMigrationPayload(payload)
}

/** True when the current URL is a migration receiver call. */
export function isMigrationReceive(): boolean {
  try {
    return new URLSearchParams(window.location.search).has('__migrate')
  } catch {
    return false
  }
}
