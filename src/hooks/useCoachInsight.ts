import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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

/** Returns 'morning' (06:00–12:59), 'afternoon' (13:00–19:59), or
 *  'evening' (20:00–05:59). The boundaries match the three daily
 *  briefings the athlete expects: a 6 AM "wake-up read", a 1 PM
 *  "midday recalibration", and an 8 PM "bedtime briefing". Changing
 *  period busts the insight cache so a fresh LLM read fires when each
 *  window opens. */
export function dayPeriod(): 'morning' | 'afternoon' | 'evening' {
  const h = new Date().getHours()
  if (h < 6) return 'evening'
  if (h < 13) return 'morning'
  if (h < 20) return 'afternoon'
  return 'evening'
}

/**
 * Extract the fields that materially affect an insight answer so we can
 * hash them. The goal is *stability* — trivial field changes shouldn't
 * bust the cache, but real signal changes should.
 */
export function materialFields(surface: string, snapshot: CoachSnapshot): unknown {
  // The workout debrief reflects on a FIXED past workout, so its cache keys
  // on that workout's identity + the athlete's subjective inputs (editing
  // RPE/notes regenerates it) + persona/zones — and deliberately OMITS
  // time-of-day, which would otherwise bust a stable past-workout read every
  // few hours.
  if (surface.startsWith('workout_debrief')) {
    const w = snapshot.lastCompletedWorkout
    const persona = snapshot.coachPersona
    return {
      surface,
      workout: w
        ? {
            key: w.key,
            grade: w.grade?.grade ?? null,
            rpe: w.actual?.rpe ?? null,
            notes: (w.actual?.notes || '').trim(),
            drillNotes: (w.actual?.drillNotes || '').trim(),
            distance: w.actual?.distance ? Math.round(w.actual.distance * 10) / 10 : 0,
            movingTime: w.actual?.movingTime ?? 0,
            avgHR: w.actual?.avgHR ?? null,
            maxHR: w.actual?.maxHR ?? null,
            elev: w.actual?.elevationGain ?? null,
          }
        : null,
      persona: persona
        ? { name: persona.name?.trim() || '', traits: [...(persona.traits || [])].sort() }
        : null,
      zones: snapshot.zones?.map(z => z.hr) ?? null,
    }
  }

  // The welcome letter is a one-time, start-of-season note generated from the
  // freshly-built plan + the athlete's own words. There's no readiness/activity
  // data yet, so key the cache on the plan identity + those words (NOT
  // time-of-day) — the letter stays stable while the screen is open and only
  // regenerates if the athlete redoes onboarding with materially different
  // inputs. The snapshot is a bespoke onboarding-time shape (see CoachLetter),
  // so read it through a loose cast.
  if (surface === 'welcome_letter') {
    const s = snapshot as unknown as {
      athleteProfile?: { name?: string }
      weeks?: unknown[]
      race?: { name?: string; distance?: string; description?: string; athleteGoal?: string }
      detailLevel?: string
      injuryContext?: string
      coachPersona?: { name?: string; traits?: string[] }
      zones?: { hr?: string }[]
    }
    const wlPersona = s.coachPersona
    return {
      surface,
      athlete: s.athleteProfile?.name?.trim() || '',
      weeks: s.weeks?.length ?? 0,
      race: {
        name: s.race?.name || '',
        distance: s.race?.distance || '',
        description: (s.race?.description || '').trim(),
        athleteGoal: (s.race?.athleteGoal || '').trim(),
      },
      injury: (s.injuryContext || '').trim(),
      detailLevel: s.detailLevel ?? null,
      persona: wlPersona
        ? { name: wlPersona.name?.trim() || '', traits: [...(wlPersona.traits || [])].sort() }
        : null,
      zones: s.zones?.map(z => z.hr) ?? null,
    }
  }

  const r = snapshot.readiness
  const p = snapshot.performance
  const t = snapshot.plannedToday
  const tm = snapshot.plannedTomorrow
  const persona = snapshot.coachPersona
  return {
    surface,
    date: snapshot.today?.date,
    period: dayPeriod(),
    readiness: r
      ? {
          status: r.status,
          bucket: Math.round((r.displayScore ?? 0) / 20) * 20,
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
    // Persona identity is baked into the cache key so changing the
    // coach's name or traits busts cached insights — otherwise you'd
    // keep seeing the old generic voice until the day's signals change.
    persona: persona
      ? { name: persona.name?.trim() || '', traits: [...(persona.traits || [])].sort() }
      : null,
    // HR zone HR ranges are baked into the system prompt, so a settings
    // change must bust the cache — otherwise the user keeps seeing an
    // insight that quotes their old zones for up to 48h.
    zones: snapshot.zones?.map(z => z.hr) ?? null,
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
  const [regenToken, setRegenToken] = useState(0)
  // When >0, the next fetch posts force=true so the SERVER cache is
  // bypassed too. Decrements to 0 after one fire so subsequent
  // automatic refreshes (snapshot/persona changes) still use cache.
  const [forceCount, setForceCount] = useState(0)

  // Tick state that re-evaluates each minute. When dayPeriod() crosses
  // a boundary (6 AM / 1 PM / 8 PM), this updates from e.g. 'morning'
  // to 'afternoon', the contextHash re-derives, and the effect re-fires
  // — fetching a fresh insight quietly while the user is in the app.
  const [periodKey, setPeriodKey] = useState(dayPeriod())
  useEffect(() => {
    const id = window.setInterval(() => {
      const next = dayPeriod()
      setPeriodKey(prev => (prev === next ? prev : next))
    }, 60_000)
    return () => window.clearInterval(id)
  }, [])

  // Pre-compute the material context hash. The snapshot object identity
  // churns every render (upstream useMemo deps include non-memoized
  // callbacks/maps), but materialFields() distills it down to the inputs
  // that should actually trigger a re-fetch. Depending the effect on the
  // hash STRING (primitive) instead of the snapshot OBJECT means React
  // bails out of re-running when nothing material has changed — no more
  // abort/restart cycle that flickers the loading skeleton.
  const contextHash = useMemo(() => {
    if (!enabled || !snapshot) return ''
    return hashFields(materialFields(surface, snapshot))
    // periodKey is intentionally in the dep list — materialFields() reads
    // dayPeriod() at call time, so a period transition must force the
    // memo to re-run even when the snapshot hasn't otherwise changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, surface, snapshot, periodKey])

  // Snapshot is still needed to send in the request body. We hold it in
  // a ref so the fetch sees the latest reference without making it an
  // effect dep.
  const snapshotRef = useRef(snapshot)
  useEffect(() => { snapshotRef.current = snapshot }, [snapshot])

  const regenerate = useCallback(() => {
    if (!snapshot) return
    // Clear the localStorage cache for this surface+hash so the next
    // effect run hits the network instead of reading stale copy.
    const fields = materialFields(surface, snapshot)
    const localContextHash = hashFields(fields)
    try {
      localStorage.removeItem(lsKey(athleteId, surface, localContextHash))
    } catch {
      /* ignore */
    }
    // Bump regenToken to re-fire the effect, AND set forceCount so the
    // next request body includes force=true and the API skips its KV
    // cache lookup. Without this, server-side cache would return the
    // exact same response and the user wouldn't see any change.
    setForceCount(c => c + 1)
    setRegenToken(x => x + 1)
  }, [athleteId, surface, snapshot])

  useEffect(() => {
    const currentSnapshot = snapshotRef.current
    if (!enabled || !currentSnapshot || !coachApiAvailable()) {
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

    if (!contextHash) return
    const cacheKey = lsKey(athleteId, surface, contextHash)
    // forceCount > 0 means the user just hit Regenerate. Skip BOTH the
    // localStorage cache and the server's KV cache so the LLM is
    // actually re-invoked.
    const forcing = forceCount > 0

    // Try localStorage cache first (skipped on force)
    if (!forcing) {
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
            snapshot: currentSnapshot,
            ...(forcing ? { force: true } : {}),
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
        // Consume the force flag — subsequent automatic refreshes
        // (snapshot/persona changes) should resume using cache.
        if (forcing) setForceCount(0)
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
        // Only clear loading if THIS fetch is still the active one.
        // An aborted fetch's finally must NOT clobber the new fetch's
        // loading=true state (the abort/restart cycle was the source
        // of the rapid skeleton flicker on Summary).
        if (abortRef.current === ac) setLoading(false)
      }
    })()

    return () => {
      ac.abort()
    }
    // regenToken is included so tapping "Regenerate" re-fires the effect.
    // forceCount affects request body, so it's also a dep.
    // contextHash replaces the snapshot dep — same insight inputs across
    // renders means same hash means React bails out.
  }, [athleteId, surface, contextHash, enabled, fallbackText, fallbackTip, regenToken, forceCount])

  return { insight, loading, error, regenerate }
}
