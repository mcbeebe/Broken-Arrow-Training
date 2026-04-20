import { useEffect, useRef } from 'react'
import type { CoachSnapshot, PlannedDay, ReadinessScore, StravaActivity, GarminActivity } from '../types'
import { coachApiAvailable, coachApiBase } from '../utils/coachApi'
import type { UseCoachMemoryReturn } from './useCoachMemory'

/**
 * Client-side proactive-ping driver. Observes recent state + local flags,
 * detects the four Phase B triggers, and POSTs to /api/coach/ping. The
 * server enforces cooldowns authoritatively; client-side flags are just
 * there to avoid hammering the endpoint on every render.
 */

interface Inputs {
  athleteId: string
  enabled: boolean
  snapshot: CoachSnapshot | null
  stravaActivities: StravaActivity[]
  garminActivities: GarminActivity[]
  todayScore: ReadinessScore | null
  yesterdayScore: ReadinessScore | null
  plannedToday: PlannedDay | undefined
  memory: UseCoachMemoryReturn
}

const LS_PREFIX = 'ba_coach_ping_v1:'

function lsGet(key: string): string | null {
  try {
    return localStorage.getItem(LS_PREFIX + key)
  } catch {
    return null
  }
}
function lsSet(key: string, val: string) {
  try {
    localStorage.setItem(LS_PREFIX + key, val)
  } catch {
    /* ignore */
  }
}

async function postPing(athleteId: string, trigger: { type: string; payload?: Record<string, unknown> }, snapshot: CoachSnapshot | null) {
  if (!coachApiAvailable() || !snapshot) return null
  try {
    const res = await fetch(`${coachApiBase()}/api/coach/ping`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ athleteId, trigger, snapshot }),
    })
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

function isoWeekKey(d: Date): string {
  // YYYY-Www format
  const year = d.getFullYear()
  const firstJan = new Date(year, 0, 1)
  const days = Math.floor(
    (d.getTime() - firstJan.getTime()) / (24 * 60 * 60 * 1000),
  )
  const week = Math.ceil((days + firstJan.getDay() + 1) / 7)
  return `${year}-W${String(week).padStart(2, '0')}`
}

export function useProactivePings(inputs: Inputs) {
  const {
    athleteId,
    enabled,
    snapshot,
    stravaActivities,
    garminActivities,
    todayScore,
    yesterdayScore,
    plannedToday,
    memory,
  } = inputs

  const lastCheckRef = useRef<number>(0)

  useEffect(() => {
    if (!enabled || !athleteId || !snapshot) return
    // Throttle: at most once every 60 seconds
    const now = Date.now()
    if (now - lastCheckRef.current < 60_000) return
    lastCheckRef.current = now

    let cancelled = false

    async function run() {
      // ── new_workout ─────────────────────────────
      const latestStravaId = stravaActivities[0]?.id
      const latestGarminDate = garminActivities[0]?.date
      const lastSeenStrava = lsGet(`strava_id:${athleteId}`)
      const lastSeenGarmin = lsGet(`garmin_date:${athleteId}`)

      let newWorkoutPayload: Record<string, unknown> | null = null
      if (latestStravaId && String(latestStravaId) !== lastSeenStrava) {
        newWorkoutPayload = {
          source: 'strava',
          name: stravaActivities[0]?.name,
          distance: stravaActivities[0]?.distance,
          movingTime: stravaActivities[0]?.moving_time,
        }
        lsSet(`strava_id:${athleteId}`, String(latestStravaId))
      } else if (
        latestGarminDate &&
        latestGarminDate !== lastSeenGarmin
      ) {
        newWorkoutPayload = {
          source: 'garmin',
          name: garminActivities[0]?.name,
          date: latestGarminDate,
        }
        lsSet(`garmin_date:${athleteId}`, latestGarminDate)
      }

      if (!cancelled && newWorkoutPayload) {
        const result = await postPing(
          athleteId,
          { type: 'new_workout', payload: newWorkoutPayload },
          snapshot,
        )
        if (result && !result.skipped) {
          memory.refresh()
        }
      }

      // ── readiness_shift ─────────────────────────
      if (todayScore && yesterdayScore && todayScore.status !== yesterdayScore.status) {
        const shiftKey = `readiness_shift:${athleteId}:${todayScore.date}`
        if (!lsGet(shiftKey)) {
          lsSet(shiftKey, '1')
          const result = await postPing(
            athleteId,
            {
              type: 'readiness_shift',
              payload: {
                from: yesterdayScore.status,
                to: todayScore.status,
                score: todayScore.displayScore,
              },
            },
            snapshot,
          )
          if (!cancelled && result && !result.skipped) memory.refresh()
        }
      }

      // ── skipped_workout ─────────────────────────
      const nowDate = new Date()
      const hour = nowDate.getHours()
      if (hour >= 20 && plannedToday && plannedToday.type !== 'rest' && !plannedToday.actual) {
        // Don't fire "skipped workout" if a matching raw activity exists
        // today — that means the athlete DID work out, we're just still
        // waiting on the sync/matching pipeline to link it to the plan.
        // Previously this ping would fire prematurely right after a race
        // while Garmin was still syncing, then cache a wrong narrative.
        const todayISO = (() => {
          const y = nowDate.getFullYear()
          const m = String(nowDate.getMonth() + 1).padStart(2, '0')
          const d = String(nowDate.getDate()).padStart(2, '0')
          return `${y}-${m}-${d}`
        })()
        const hasRawToday = stravaActivities.some(a => (a.start_date_local || '').slice(0, 10) === todayISO)
          || garminActivities.some(a => (a.date || '') === todayISO)
        if (!hasRawToday) {
          const skipKey = `skipped:${athleteId}:${plannedToday.day}`
          if (!lsGet(skipKey)) {
            lsSet(skipKey, '1')
            const result = await postPing(
              athleteId,
              {
                type: 'skipped_workout',
                payload: { day: plannedToday.day, workout: plannedToday.workout },
              },
              snapshot,
            )
            if (!cancelled && result && !result.skipped) memory.refresh()
          }
        }
      }

      // ── weekly_recap ────────────────────────────
      const isSunday = nowDate.getDay() === 0
      if (isSunday && hour >= 18) {
        const wk = isoWeekKey(nowDate)
        const wkKey = `weekly_recap:${athleteId}:${wk}`
        if (!lsGet(wkKey)) {
          lsSet(wkKey, '1')
          const result = await postPing(
            athleteId,
            { type: 'weekly_recap', payload: { week: wk } },
            snapshot,
          )
          if (!cancelled && result && !result.skipped) memory.refresh()
        }
      }
    }

    run()
    return () => {
      cancelled = true
    }
  }, [
    athleteId,
    enabled,
    snapshot,
    stravaActivities,
    garminActivities,
    todayScore,
    yesterdayScore,
    plannedToday,
    memory,
  ])
}

// ─── Pure trigger-detection functions (exported for tests) ────────

export function detectNewWorkoutTrigger(
  lastSeenId: string | null,
  activities: { id: number | string }[],
): { id: string | number; payload: Record<string, unknown> } | null {
  if (activities.length === 0) return null
  const latest = activities[0]
  if (String(latest.id) === lastSeenId) return null
  return { id: latest.id, payload: { ...latest } }
}

export function detectReadinessShiftTrigger(
  yesterday: { status: string } | null,
  today: { status: string } | null,
): boolean {
  if (!today || !yesterday) return false
  return today.status !== yesterday.status
}

export function detectSkippedWorkoutTrigger(
  nowHour: number,
  planned: { type: string; actual?: unknown } | undefined,
): boolean {
  if (nowHour < 20) return false
  if (!planned) return false
  if (planned.type === 'rest') return false
  return !planned.actual
}

export function detectWeeklyRecapTrigger(now: Date): boolean {
  return now.getDay() === 0 && now.getHours() >= 18
}
