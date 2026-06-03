import { useEffect, useRef } from 'react'
import type { AuthSession } from '../utils/auth'
import { hydrateFromServer, pushAll } from '../utils/backendSync'

/**
 * Background cross-device sync driver.
 *
 * On mount with a valid session, hydrates from the server once, then
 * runs a periodic push every 60 seconds while the tab is visible and
 * a debounced push on every visibility-change → visible. Failures are
 * logged at debug level and swallowed — sync must never block the UI
 * or surface errors to the athlete.
 *
 * One instance is enough; mount it inside `AuthenticatedApp`. The
 * Settings "Sync now" / "Pull from server" buttons call
 * `pushAll` / `pullFromServer` directly from `utils/backendSync` so
 * they don't depend on this hook being mounted.
 */

const PUSH_INTERVAL_MS = 60_000
const VISIBILITY_DEBOUNCE_MS = 1_000

export function useBackendSync(session: AuthSession | null): void {
  const hydratedRef = useRef(false)
  const inflightRef = useRef(false)

  useEffect(() => {
    if (!session?.token) return

    let cancelled = false
    let visibilityTimer: number | undefined

    async function safePush(reason: string): Promise<void> {
      if (cancelled || inflightRef.current || !session) return
      inflightRef.current = true
      try {
        const result = await pushAll(session)
        if (!cancelled && (result.written > 0 || result.skipped > 0)) {
          console.debug(`[sync] push (${reason}):`, result)
        }
      } catch (e) {
        console.debug('[sync] push failed:', e)
      } finally {
        inflightRef.current = false
      }
    }

    async function bootHydrate(): Promise<void> {
      if (hydratedRef.current || cancelled || !session) return
      try {
        const { pulled } = await hydrateFromServer(session)
        if (cancelled) return
        hydratedRef.current = true
        if (pulled > 0) console.debug(`[sync] hydrated ${pulled} key(s)`)
        // Push anything we might have written locally before the
        // hydrate completed, so the round-trip is symmetric.
        await safePush('post-hydrate')
      } catch (e) {
        console.debug('[sync] hydrate failed:', e)
        // Try again on the next visibility / interval tick.
      }
    }

    function onVisibility(): void {
      if (document.visibilityState !== 'visible') return
      window.clearTimeout(visibilityTimer)
      visibilityTimer = window.setTimeout(() => {
        if (!hydratedRef.current) {
          bootHydrate()
        } else {
          safePush('visibility')
        }
      }, VISIBILITY_DEBOUNCE_MS)
    }

    bootHydrate()

    const intervalTimer = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return
      if (!hydratedRef.current) {
        bootHydrate()
      } else {
        safePush('interval')
      }
    }, PUSH_INTERVAL_MS)

    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      cancelled = true
      window.clearTimeout(visibilityTimer)
      window.clearInterval(intervalTimer)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [session])
}
