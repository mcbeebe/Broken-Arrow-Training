import { useCallback, useEffect, useMemo, useState } from 'react'
import { stampKey } from '../utils/syncStamps'

/**
 * When the Sunday recap shows, and for how long.
 *
 * Rules (all local time — this is a "your Sunday afternoon" feature, not a
 * UTC one):
 *  - Sunday, at or after RECAP_HOUR.
 *  - Once per calendar week. Dismissing it does not bring it back.
 *  - It lives for 24 hours from first appearance, then stops appearing
 *    forever — by then it is in the coach conversation, which is where a
 *    week's history belongs.
 *
 * The archive write happens ONCE, on first appearance, not on dismiss —
 * an athlete who never opens the app on Sunday evening still gets the
 * recap in their chat history.
 */

const STORAGE_KEY = 'ba_weekly_recap_v1'
const RECAP_HOUR = 15 // 3 PM — "Sunday afternoon"
const LIFETIME_MS = 24 * 60 * 60 * 1000

interface RecapState {
  /** ISO date of the Sunday this recap belongs to. */
  weekKey: string
  /** Epoch ms of first appearance. */
  shownAt: number
  dismissed?: boolean
  archived?: boolean
}

function scopedKey(athleteId?: string) {
  return athleteId ? `${STORAGE_KEY}_${athleteId}` : STORAGE_KEY
}

function read(athleteId?: string): RecapState | null {
  try {
    const raw = localStorage.getItem(scopedKey(athleteId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as RecapState
    return parsed && typeof parsed.weekKey === 'string' ? parsed : null
  } catch {
    return null
  }
}

function write(state: RecapState, athleteId?: string) {
  try {
    const key = scopedKey(athleteId)
    localStorage.setItem(key, JSON.stringify(state))
    stampKey(key)
  } catch { /* quota */ }
}

/** The ISO date of the Sunday that opens the recap window `now` sits in.
 *  Exported for tests — the whole feature is a date calculation. */
export function recapWeekKey(now: Date): string | null {
  const day = now.getDay() // 0 = Sunday
  if (day !== 0) return null
  if (now.getHours() < RECAP_HOUR) return null
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Pure decision function — given the stored state and the clock, should
 *  the overlay be on screen right now? */
export function shouldShowRecap(state: RecapState | null, now: Date): { show: boolean; weekKey: string | null } {
  const weekKey = recapWeekKey(now)

  // Inside a fresh Sunday window with nothing stored for it yet.
  if (weekKey && (!state || state.weekKey !== weekKey)) return { show: true, weekKey }

  // Already surfaced this week: honour the dismissal and the 24h lifetime.
  // (This branch also covers Monday, when weekKey is null but the recap
  // raised on Sunday is still inside its day.)
  if (state && !state.dismissed && now.getTime() - state.shownAt < LIFETIME_MS) {
    return { show: true, weekKey: state.weekKey }
  }

  return { show: false, weekKey }
}

export function useWeeklyRecap(athleteId?: string, opts?: { enabled?: boolean }) {
  const enabled = opts?.enabled ?? true
  const [state, setState] = useState<RecapState | null>(() => read(athleteId))
  // Re-evaluated every minute so the overlay appears without a reload for
  // someone who had the app open through 3 PM.
  const [tick, setTick] = useState(0)

  useEffect(() => {
    setState(read(athleteId))
  }, [athleteId])

  useEffect(() => {
    const id = window.setInterval(() => setTick(t => t + 1), 60_000)
    return () => window.clearInterval(id)
  }, [])

  const decision = useMemo(
    () => shouldShowRecap(state, new Date()),
    // `tick` is the clock dependency — intentional.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state, tick],
  )

  const visible = enabled && decision.show

  /** Called once when the overlay first paints for a given week. Returns
   *  true when this is the first appearance (so the caller archives it to
   *  the coach conversation exactly once). */
  const markShown = useCallback((): boolean => {
    const weekKey = decision.weekKey
    if (!weekKey) return false
    const existing = read(athleteId)
    if (existing?.weekKey === weekKey) return false
    write({ weekKey, shownAt: Date.now(), archived: true }, athleteId)
    setState({ weekKey, shownAt: Date.now(), archived: true })
    return true
  }, [athleteId, decision.weekKey])

  const dismiss = useCallback(() => {
    const current = read(athleteId)
    const weekKey = current?.weekKey ?? decision.weekKey
    if (!weekKey) return
    const next: RecapState = {
      weekKey,
      shownAt: current?.shownAt ?? Date.now(),
      dismissed: true,
      archived: true,
    }
    write(next, athleteId)
    setState(next)
  }, [athleteId, decision.weekKey])

  return { visible, weekKey: decision.weekKey, markShown, dismiss }
}
