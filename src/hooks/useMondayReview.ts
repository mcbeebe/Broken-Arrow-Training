import { todayDateString } from '../utils/planDates'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { stampKey } from '../utils/syncStamps'

/**
 * When the Monday Review shows (Adaptive Engine phase 1, PR 3).
 *
 * Two triggers, one surface:
 *  - CADENCE: Monday at or after 6 AM local, once per calendar week,
 *    alive for 48 hours (a Tuesday-evening open still gets its review).
 *    Dismissing ends it for that week.
 *  - GAP OVERRIDE: any day, immediately, when the adaptive engine
 *    detects a resumption-tier gap (>=14 days). It stays up until the
 *    athlete acts on or dismisses THAT gap — keyed by the gap's
 *    last-activity date, so a new gap re-triggers but the same one
 *    never nags twice.
 *
 * Same storage discipline as useWeeklyRecap: athleteId-scoped
 * localStorage + sync stamp, pure decision functions exported for tests.
 */

const STORAGE_KEY = 'ba_monday_review_v1'
const REVIEW_HOUR = 6 // 6 AM Monday
const LIFETIME_MS = 48 * 60 * 60 * 1000

interface ReviewState {
  /** ISO date of the Monday this review belongs to. */
  weekKey: string
  shownAt: number
  dismissed?: boolean
  /** lastActivityIso of the most recent gap the athlete acknowledged. */
  gapAckIso?: string
}

function scopedKey(athleteId?: string) {
  return athleteId ? `${STORAGE_KEY}_${athleteId}` : STORAGE_KEY
}

function read(athleteId?: string): ReviewState | null {
  try {
    const raw = localStorage.getItem(scopedKey(athleteId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as ReviewState
    return parsed && typeof parsed.weekKey === 'string' ? parsed : null
  } catch {
    return null
  }
}

function write(state: ReviewState, athleteId?: string) {
  try {
    const key = scopedKey(athleteId)
    localStorage.setItem(key, JSON.stringify(state))
    stampKey(key)
  } catch { /* quota */ }
}

/** The ISO date of the Monday whose review window `now` sits in — the
 *  Monday itself from 6 AM, or within 48h after that. Null outside. */
export function reviewWeekKey(now: Date): string | null {
  // Walk back to the most recent Monday 6 AM boundary.
  const candidate = new Date(now)
  for (let back = 0; back < 3; back++) {
    const d = new Date(now)
    d.setDate(d.getDate() - back)
    if (d.getDay() === 1) { // Monday
      const boundary = new Date(d)
      boundary.setHours(REVIEW_HOUR, 0, 0, 0)
      if (now.getTime() >= boundary.getTime() && now.getTime() - boundary.getTime() < LIFETIME_MS) {
        const y = boundary.getFullYear()
        const m = String(boundary.getMonth() + 1).padStart(2, '0')
        const dd = String(boundary.getDate()).padStart(2, '0')
        return `${y}-${m}-${dd}`
      }
    }
  }
  void candidate
  return null
}

export interface ReviewDecision {
  show: boolean
  weekKey: string | null
  /** True when the gap override (not the Monday cadence) is why. */
  gapTriggered: boolean
}

export function shouldShowReview(
  state: ReviewState | null,
  now: Date,
  /** lastActivityIso of an actionable gap (tier >= ease75), else null. */
  gapIso: string | null,
): ReviewDecision {
  // Gap override: an unacknowledged resumption gap wins over everything.
  if (gapIso && state?.gapAckIso !== gapIso) {
    return { show: true, weekKey: reviewWeekKey(now), gapTriggered: true }
  }

  const weekKey = reviewWeekKey(now)
  if (weekKey && (!state || state.weekKey !== weekKey)) return { show: true, weekKey, gapTriggered: false }
  if (state && state.weekKey === weekKey && !state.dismissed && now.getTime() - state.shownAt < LIFETIME_MS) {
    return { show: true, weekKey, gapTriggered: false }
  }
  return { show: false, weekKey, gapTriggered: false }
}

export function useMondayReview(athleteId?: string, gapIso: string | null = null, opts?: { enabled?: boolean }) {
  const enabled = opts?.enabled ?? true
  const [state, setState] = useState<ReviewState | null>(() => read(athleteId))
  const [tick, setTick] = useState(0)

  useEffect(() => {
    setState(read(athleteId))
  }, [athleteId])

  useEffect(() => {
    const id = window.setInterval(() => setTick(t => t + 1), 60_000)
    return () => window.clearInterval(id)
  }, [])

  const decision = useMemo(
    () => shouldShowReview(state, new Date(), gapIso),
    // `tick` is the clock dependency — intentional.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state, gapIso, tick],
  )

  /** Record first appearance for this week (idempotent). */
  const markShown = useCallback(() => {
    const weekKey = decision.weekKey ?? todayDateString()
    const existing = read(athleteId)
    if (existing?.weekKey === weekKey && !decision.gapTriggered) return
    const next: ReviewState = {
      weekKey,
      shownAt: existing?.weekKey === weekKey ? existing.shownAt : Date.now(),
      dismissed: existing?.weekKey === weekKey ? existing.dismissed : undefined,
      gapAckIso: existing?.gapAckIso,
    }
    write(next, athleteId)
    setState(next)
  }, [athleteId, decision.weekKey, decision.gapTriggered])

  /** Close the review: ends this week's cadence AND acknowledges the
   *  current gap (applying adjustments calls this too). */
  const dismiss = useCallback(() => {
    const current = read(athleteId)
    const weekKey = current?.weekKey ?? decision.weekKey ?? todayDateString()
    const next: ReviewState = {
      weekKey,
      shownAt: current?.shownAt ?? Date.now(),
      dismissed: true,
      gapAckIso: gapIso ?? current?.gapAckIso,
    }
    write(next, athleteId)
    setState(next)
  }, [athleteId, decision.weekKey, gapIso])

  return { visible: enabled && decision.show, gapTriggered: decision.gapTriggered, weekKey: decision.weekKey, markShown, dismiss }
}
