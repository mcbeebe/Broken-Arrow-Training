import { useEffect, useRef } from 'react'
import type { ConversationTurn } from '../types'
import { localDateStr } from '../utils/format'
import { getLastCoachActivity } from '../utils/coachActivity'

/**
 * Archives the coach conversation once per calendar day so each day starts
 * a fresh thread.
 *
 * Two complementary triggers:
 *
 *  1. Catch-up — when the app launches (or the athlete switches) on a later
 *     day than the newest turn, the stale thread is archived immediately.
 *     This covers the "closed across midnight" case the timer can't see.
 *
 *  2. Midnight timer — while the app stays open across midnight, the thread
 *     rolls over at 00:00 local. If the athlete is mid-conversation, the
 *     rollover is held until they've been idle for the grace window so we
 *     never archive a thread out from under an active chat.
 *
 * A localStorage guard (shared with manual archive) keeps both triggers
 * from double-archiving the same day.
 */

const INACTIVITY_GRACE_MS = 5 * 60 * 1000

function msUntilNextMidnight(from: Date = new Date()): number {
  const next = new Date(from)
  next.setHours(24, 0, 0, 0) // 24:00 today === 00:00 tomorrow, local time
  return next.getTime() - from.getTime()
}

interface Options {
  athleteId: string
  enabled: boolean
  /** Wait for the first memory load so we don't act on stale/empty state. */
  loaded: boolean
  conversation: ConversationTurn[]
  rolloverDay: (date: string) => Promise<void> | void
  /** Fired after a successful archive with the archived day's date. */
  onArchived?: (date: string) => void
}

export function useDailyAutoArchive({
  athleteId,
  enabled,
  loaded,
  conversation,
  rolloverDay,
  onArchived,
}: Options) {
  // The long-lived midnight timer reads fresh values through refs so it
  // doesn't have to re-arm every time the conversation changes. Refs are
  // synced in an effect (never during render).
  const convoRef = useRef(conversation)
  const rolloverRef = useRef(rolloverDay)
  const onArchivedRef = useRef(onArchived)
  useEffect(() => {
    convoRef.current = conversation
    rolloverRef.current = rolloverDay
    onArchivedRef.current = onArchived
  })

  // ── Catch-up rollover ────────────────────────────────────────────────
  useEffect(() => {
    if (!enabled || !loaded || !athleteId) return
    const visible = conversation.filter(t => t.role !== 'system-handoff')
    if (visible.length === 0) return
    const last = visible[visible.length - 1]
    if (!last.ts) return
    const lastDate = localDateStr(new Date(last.ts))
    const today = localDateStr()
    if (lastDate === today) return // same day — nothing stale to archive
    const key = `ba_coach_last_rollover:${athleteId}`
    if (localStorage.getItem(key) === today) return
    try { localStorage.setItem(key, today) } catch { /* quota */ }
    rolloverRef.current(lastDate)
    onArchivedRef.current?.(lastDate)
  }, [athleteId, enabled, loaded, conversation])

  // ── Midnight timer (with inactivity grace) ───────────────────────────
  useEffect(() => {
    if (!enabled || !athleteId) return
    let timer: ReturnType<typeof setTimeout> | undefined

    const archiveNow = () => {
      const visible = convoRef.current.filter(t => t.role !== 'system-handoff')
      if (visible.length === 0) return
      const last = visible[visible.length - 1]
      const date = last.ts ? localDateStr(new Date(last.ts)) : localDateStr()
      const key = `ba_coach_last_rollover:${athleteId}`
      try { localStorage.setItem(key, localDateStr()) } catch { /* quota */ }
      rolloverRef.current(date)
      onArchivedRef.current?.(date)
    }

    const attempt = () => {
      const visible = convoRef.current.filter(t => t.role !== 'system-handoff')
      if (visible.length === 0) {
        schedule() // nothing to archive yet — re-arm for the next midnight
        return
      }
      const idle = Date.now() - getLastCoachActivity()
      if (idle >= INACTIVITY_GRACE_MS) {
        archiveNow()
        schedule()
      } else {
        // Athlete is still active — re-check once the remaining grace
        // window has elapsed. Repeats until they fall idle.
        timer = setTimeout(attempt, INACTIVITY_GRACE_MS - idle)
      }
    }

    const schedule = () => {
      timer = setTimeout(attempt, msUntilNextMidnight() + 1000)
    }

    schedule()
    return () => { if (timer !== undefined) clearTimeout(timer) }
  }, [athleteId, enabled])
}
