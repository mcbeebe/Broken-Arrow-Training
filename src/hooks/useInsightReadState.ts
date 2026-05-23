import { useCallback, useEffect, useState } from 'react'

/**
 * Tracks the newest daily-insight the athlete has actually seen (read on
 * the Coach tab). The daily insight is the coach's proactive voice — it
 * refreshes up to 3x/day — and the Summary alert banner fires whenever a
 * fresher insight than `seenAt` exists. Persisted per-athlete so the
 * "read" state survives reloads.
 *
 * Identity is the insight's `generatedAt` epoch: a newer insight has a
 * larger timestamp, so `markSeen` only ever advances forward.
 */

const LS_PREFIX = 'ba_coach_insight_seen_v1:'

function readSeen(athleteId: string): number {
  try {
    return Number(localStorage.getItem(LS_PREFIX + athleteId)) || 0
  } catch {
    return 0
  }
}

export function useInsightReadState(athleteId: string) {
  const [seenAt, setSeenAt] = useState<number>(() => readSeen(athleteId))

  useEffect(() => {
    setSeenAt(readSeen(athleteId))
  }, [athleteId])

  const markSeen = useCallback(
    (generatedAt: number | undefined) => {
      if (!generatedAt) return
      setSeenAt(prev => {
        if (generatedAt <= prev) return prev
        try {
          localStorage.setItem(LS_PREFIX + athleteId, String(generatedAt))
        } catch {
          /* quota */
        }
        return generatedAt
      })
    },
    [athleteId],
  )

  return { seenAt, markSeen }
}
