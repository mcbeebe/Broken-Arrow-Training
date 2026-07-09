import { useEffect, useRef } from 'react'
import type { AuthSession } from '../utils/auth'
import { hydrateFromServer, pushAll, recordSyncError } from '../utils/backendSync'

/**
 * Background cross-device sync driver.
 *
 * On mount with a valid session, runs an initial hydrate-then-push,
 * then on every visibility-change and every 60 seconds while the tab
 * is visible runs a push-then-pull round-trip so edits propagate in
 * both directions. The push has to happen before the pull so a local
 * edit lands on the server before the server's view (which doesn't
 * yet include our edit) overwrites it.
 *
 * Failures are logged at debug level and swallowed — sync must never
 * block the UI or surface errors to the athlete.
 *
 * One instance is enough; mount it inside `AuthenticatedApp`. The
 * Settings "Sync now" / "Pull from server" buttons call
 * `pushAll` / `pullFromServer` directly from `utils/backendSync` so
 * they don't depend on this hook being mounted.
 */

const SYNC_INTERVAL_MS = 60_000
const VISIBILITY_DEBOUNCE_MS = 1_000

export function useBackendSync(session: AuthSession | null): void {
  const hydratedRef = useRef(false)
  const inflightRef = useRef(false)

  useEffect(() => {
    if (!session?.token) return

    let cancelled = false
    let visibilityTimer: number | undefined

    async function safePush(reason: string): Promise<void> {
      if (cancelled || !session) return
      try {
        const result = await pushAll(session)
        if (!cancelled && (result.written > 0 || result.skipped > 0)) {
          console.debug(`[sync] push (${reason}):`, result)
        }
      } catch (e) {
        // Still non-blocking, but never invisible (P0 postmortem: pushes
        // failed 100% for weeks with only a debug log). The persistent
        // error renders in Settings → Sync until a sync succeeds.
        recordSyncError(e instanceof Error ? e.message : 'background push failed')
        console.debug('[sync] push failed:', e)
      }
    }

    async function safePull(reason: string): Promise<void> {
      if (cancelled || !session) return
      try {
        const { pulled } = await hydrateFromServer(session)
        if (!cancelled && pulled > 0) {
          console.debug(`[sync] pull (${reason}): ${pulled} key(s) updated`)
        }
      } catch (e) {
        console.debug('[sync] pull failed:', e)
      }
    }

    /** Push-then-pull, single-flight per tick. Used by every sync
     *  trigger except the initial boot hydrate. */
    async function safeRoundTrip(reason: string): Promise<void> {
      if (cancelled || inflightRef.current || !session) return
      inflightRef.current = true
      try {
        await safePush(reason)
        await safePull(reason)
      } finally {
        inflightRef.current = false
      }
    }

    async function bootHydrate(): Promise<void> {
      if (hydratedRef.current || cancelled || inflightRef.current || !session) return
      inflightRef.current = true
      try {
        const { pulled } = await hydrateFromServer(session)
        if (cancelled) return
        hydratedRef.current = true
        if (pulled > 0) console.debug(`[sync] hydrated ${pulled} key(s)`)
        // Push anything written locally before the hydrate completed.
        await safePush('post-hydrate')
      } catch (e) {
        console.debug('[sync] hydrate failed:', e)
        // Try again on the next visibility / interval tick.
      } finally {
        inflightRef.current = false
      }
    }

    function onVisibility(): void {
      if (document.visibilityState !== 'visible') return
      window.clearTimeout(visibilityTimer)
      visibilityTimer = window.setTimeout(() => {
        if (!hydratedRef.current) {
          bootHydrate()
        } else {
          safeRoundTrip('visibility')
        }
      }, VISIBILITY_DEBOUNCE_MS)
    }

    bootHydrate()

    const intervalTimer = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return
      if (!hydratedRef.current) {
        bootHydrate()
      } else {
        safeRoundTrip('interval')
      }
    }, SYNC_INTERVAL_MS)

    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      cancelled = true
      window.clearTimeout(visibilityTimer)
      window.clearInterval(intervalTimer)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [session])
}
