import { useCallback, useEffect, useRef } from 'react'
import { coachApiAvailable, coachApiBase } from '../utils/coachApi'

/**
 * Debounced client for POST /api/coach/telemetry. Call `logInteraction`
 * freely — events are batched and flushed on a short timer or page hide.
 */

type InteractionKind =
  | 'card_viewed'
  | 'ask_tapped'
  | 'inference_accepted'
  | 'inference_dismissed'
  | 'proposal_seen'
  | 'proposal_accepted'
  | 'proposal_rejected'
  | 'toast_dismissed'
  | 'coach_tab_opened'
  | 'chat_sent'

interface QueuedEvent {
  type: 'interaction'
  kind: InteractionKind
  meta?: Record<string, unknown>
}

const FLUSH_MS = 2000

export function useCoachTelemetry(athleteId: string, enabled: boolean) {
  const queueRef = useRef<QueuedEvent[]>([])
  const timerRef = useRef<number | null>(null)

  const flush = useCallback(async () => {
    if (!enabled || !coachApiAvailable() || !athleteId) {
      queueRef.current = []
      return
    }
    const events = queueRef.current
    if (events.length === 0) return
    queueRef.current = []
    try {
      await fetch(`${coachApiBase()}/api/coach/telemetry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ athleteId, events }),
        keepalive: true,
      })
    } catch {
      // drop — telemetry is best-effort
    }
  }, [athleteId, enabled])

  const logInteraction = useCallback(
    (kind: InteractionKind, meta?: Record<string, unknown>) => {
      queueRef.current.push({ type: 'interaction', kind, meta })
      if (timerRef.current != null) return
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null
        flush()
      }, FLUSH_MS)
    },
    [flush],
  )

  useEffect(() => {
    function onHide() {
      if (timerRef.current != null) {
        window.clearTimeout(timerRef.current)
        timerRef.current = null
      }
      flush()
    }
    window.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', onHide)
    return () => {
      window.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', onHide)
      if (timerRef.current != null) {
        window.clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [flush])

  return { logInteraction, flush }
}
