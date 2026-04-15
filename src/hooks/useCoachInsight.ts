import { useEffect, useRef, useState } from 'react'
import type { CoachInsight, CoachSnapshot } from '../types'
import { coachApiAvailable, coachApiBase } from '../utils/coachApi'

/**
 * Hook that fetches a cached, LLM-generated coach insight for a given
 * surface ('daily', 'day_card:<label>', 'workout_take:<label>').
 *
 * Caches in localStorage keyed by athleteId+surface+contextHash so repeat
 * renders (same day, same data) don't re-fetch. Falls back silently when
 * the API is unavailable.
 */

const LS_PREFIX = 'ba_coach_insight_v1:'
const MAX_AGE_MS = 48 * 60 * 60 * 1000

// Simple synchronous string hash (djb2 variant) — stable across sessions
export function hashFields(obj: unknown): string {
  const s = JSON.stringify(obj, (_k, v) =>
    v instanceof Map ? [...v.entries()] : v,
  )
  let h = 5381
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0
  }
  return (h >>> 0).toString(36)
}

/**
 * Extract the fields that materially affect an insight answer so we can
 * hash them. The goal is *stability* — trivial field changes shouldn't
 * bust the cache, but real signal changes should.
 */
export function materialFields(surface: string, snapshot: CoachSnapshot): unknown {
  const r = snapshot.readiness
  const p = snapshot.performance
  const t = snapshot.plannedToday
  const tm = snapshot.plannedTomorrow
  return {
    surface,
    date: snapshot.today?.date,
    readiness: r
      ? {
          status: r.status,
          bucket: Math.round((r.displayScore ?? 0) / 10) * 10,
          state: r.trainingState,
        }
      : null,
    perf: p
      ? {
          ctl: Math.round(p.ctl),
          atl: Math.round(p.atl),
          tsb: Math.round(p.tsb),
        }
      : null,
    plannedToday: t
      ? { day: t.day, type: t.type, workout: t.workout, actual: !!t.actual }
      : null,
    plannedTomorrow: tm
      ? { day: tm.day, type: tm.type, workout: tm.workout }
      : null,
  }
}

function lsKey(athleteId: string, surface: string, contextHash: string) {
  return `${LS_PREFIX}${athleteId}:${surface}:${contextHash}`
}

interface UseCoachInsightOptions {
  athleteId: string
  surface: string
  snapshot: CoachSnapshot | null
  enabled: boolean
  fallbackText?: string
  fallbackTip?: string
}

export function useCoachInsight(opts: UseCoachInsightOptions) {
  const { athleteId, surface, snapshot, enabled, fallbackText, fallbackTip } = opts
  const [insight, setInsight] = useState<CoachInsight | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!enabled || !snapshot || !coachApiAvailable()) {
      // Surface the heuristic fallback if provided
      if (fallbackText) {
        setInsight({
          text: fallbackText,
          tip: fallbackTip,
          generatedAt: Date.now(),
          cached: true,
        })
      } else {
        setInsight(null)
      }
      return
    }

    const fields = materialFields(surface, snapshot)
    const contextHash = hashFields(fields)
    const cacheKey = lsKey(athleteId, surface, contextHash)

    // Try localStorage cache first
    try {
      const raw = localStorage.getItem(cacheKey)
      if (raw) {
        const parsed: CoachInsight = JSON.parse(raw)
        if (Date.now() - (parsed.generatedAt ?? 0) < MAX_AGE_MS) {
          setInsight(parsed)
          return
        }
      }
    } catch {
      // ignore
    }

    // Fetch
    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac
    setLoading(true)
    setError(null)
    ;(async () => {
      try {
        const res = await fetch(`${coachApiBase()}/api/coach/insight`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            athleteId,
            surface,
            contextHash,
            snapshot,
          }),
          signal: ac.signal,
        })
        if (!res.ok) throw new Error(`http_${res.status}`)
        const data: CoachInsight = await res.json()
        setInsight(data)
        try {
          localStorage.setItem(cacheKey, JSON.stringify(data))
        } catch {
          /* ignore quota */
        }
      } catch (e) {
        if ((e as Error).name === 'AbortError') return
        setError((e as Error).message)
        if (fallbackText) {
          setInsight({
            text: fallbackText,
            tip: fallbackTip,
            generatedAt: Date.now(),
            cached: true,
          })
        }
      } finally {
        setLoading(false)
      }
    })()

    return () => {
      ac.abort()
    }
  }, [athleteId, surface, snapshot, enabled, fallbackText, fallbackTip])

  return { insight, loading, error }
}
