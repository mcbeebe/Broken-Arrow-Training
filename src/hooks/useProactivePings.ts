import { isoFromLocalDate } from '../utils/planDates'
import { useEffect, useRef } from 'react'
import type { CoachSnapshot, PlannedDay, ReadinessScore, StravaActivity, GarminActivity } from '../types'
import { coachApiAvailable, coachApiBase, coachAuthHeaders} from '../utils/coachApi'
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
      headers: { 'Content-Type': 'application/json', ...coachAuthHeaders() },
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

      // ── weekly_arc ──────────────────────────────
      // Monday morning orientation: phase + purpose + citation. Once per
      // ISO week, fires on Monday (any time of day so an athlete checking
      // in at 5am still gets it before their workout) up through Tuesday
      // EOD as a grace window for people who skip Monday entirely.
      const dow = nowDate.getDay()
      const isMondayOrTuesday = dow === 1 || dow === 2
      if (isMondayOrTuesday) {
        const wk = isoWeekKey(nowDate)
        const arcKey = `weekly_arc:${athleteId}:${wk}`
        if (!lsGet(arcKey)) {
          lsSet(arcKey, '1')
          const result = await postPing(
            athleteId,
            {
              type: 'weekly_arc',
              payload: {
                week: wk,
                weekNum: snapshot?.currentWeekNum,
              },
            },
            snapshot,
          )
          if (!cancelled && result && !result.skipped) memory.refresh()
        }
      }

      // ── Sprint 2: adverse-signal triggers (negotiation, not fiat) ──
      // Each fires once per cooldown window. The server prompt instructs
      // the coach to attach a `proposal` block when warranted, so the
      // athlete sees an Apply / Modify / Keep card rather than getting
      // their plan silently rewritten. Per-day local-storage dedup so a
      // re-trigger tomorrow (server cooldown also expired) can fire.
      const todayDate = isoFromLocalDate(nowDate)

      // hrv_drop — HRV last night ≥ 20% below 7d baseline.
      const hrvNow = snapshot?.todayHealth?.hrvLastNightMs
      const hrvBase = snapshot?.todayHealth?.hrvWeeklyAvgMs
      if (
        typeof hrvNow === 'number' &&
        typeof hrvBase === 'number' &&
        hrvBase > 0 &&
        hrvNow / hrvBase <= 0.80
      ) {
        const k = `hrv_drop:${athleteId}:${todayDate}`
        if (!lsGet(k)) {
          lsSet(k, '1')
          const result = await postPing(
            athleteId,
            {
              type: 'hrv_drop',
              payload: {
                lastNightMs: hrvNow,
                baselineMs: hrvBase,
                pctOfBaseline: Math.round((hrvNow / hrvBase) * 100),
              },
            },
            snapshot,
          )
          if (!cancelled && result && !result.skipped) memory.refresh()
        }
      }

      // acwr_spike — Load Ratio crosses the caution band (>1.3).
      const acwr = snapshot?.performance?.acwr
      if (typeof acwr === 'number' && acwr > 1.3) {
        const band = acwr > 1.5 ? 'danger' : 'caution'
        const k = `acwr_spike:${athleteId}:${todayDate}`
        if (!lsGet(k)) {
          lsSet(k, '1')
          const result = await postPing(
            athleteId,
            {
              type: 'acwr_spike',
              payload: { acwr: Number(acwr.toFixed(2)), band },
            },
            snapshot,
          )
          if (!cancelled && result && !result.skipped) memory.refresh()
        }
      }

      // compliance_drift — 2+ flagged misses across the analytics window.
      // Coach checks in with a question (no proposal yet — get the human
      // context first; this is a relationship signal, not a load signal).
      const flagged = snapshot?.analytics?.complianceSummary?.flagged
      if (typeof flagged === 'number' && flagged >= 2) {
        const k = `compliance_drift:${athleteId}:${todayDate}`
        if (!lsGet(k)) {
          lsSet(k, '1')
          const result = await postPing(
            athleteId,
            {
              type: 'compliance_drift',
              payload: { flagged },
            },
            snapshot,
          )
          if (!cancelled && result && !result.skipped) memory.refresh()
        }
      }

      // Sprint 5 — weather alert. The snapshot carries a pre-classified
      // forecast with per-day severity labels (normal / warn / swap).
      // We fire `weather_alert` only on SWAP-tier days that the athlete
      // hasn't already been warned about and that fall on a day with an
      // outdoor-exposure planned workout. WARN days flow through the
      // daily insight already (the system prompt mentions them in
      // context); we don't ping for those.
      const forecastDaily = snapshot?.weatherForecast?.daily
      if (Array.isArray(forecastDaily) && forecastDaily.length > 0) {
        // Look at today + next 3 days. Beyond that the forecast is too
        // uncertain to swap on.
        const horizon = forecastDaily.slice(0, 4)
        for (const day of horizon) {
          if (day.severity !== 'swap') continue
          const k = `weather_alert:${athleteId}:${day.date}`
          if (lsGet(k)) continue
          lsSet(k, '1')
          const result = await postPing(
            athleteId,
            {
              type: 'weather_alert',
              payload: {
                date: day.date,
                tier: 'swap',
                reasons: day.reasons,
                tempHighF: day.tempHighF,
                tempLowF: day.tempLowF,
                precipIn: day.precipIn,
                precipProbPct: day.precipProbPct,
                windMaxMph: day.windMaxMph,
                thunderRisk: day.thunderRisk,
              },
            },
            snapshot,
          )
          if (!cancelled && result && !result.skipped) {
            memory.refresh()
            // One alert per pass — the coach + ProposalCard surface is
            // the right home for follow-ups; we don't want to flood
            // the thread on a multi-day storm.
            break
          }
        }
      }

      // Sprint 4 — anniversary moments. Fires once per athlete per
      // milestone day (30 / 60 / 90 / 180 / 365). The localStorage dedup
      // key includes the milestone day so a future milestone doesn't
      // share a key with an earlier one. Server cooldown is a long
      // backstop in case the dedup key gets cleared.
      const athleteSinceMs = memory.memory.athleteSinceMs
      if (typeof athleteSinceMs === 'number' && athleteSinceMs > 0) {
        const daysSince = Math.floor((Date.now() - athleteSinceMs) / (24 * 60 * 60 * 1000))
        const milestones = [30, 60, 90, 180, 365]
        // Find the largest milestone we've crossed but haven't yet
        // celebrated. Iterating descending means a long-dormant athlete
        // who comes back at day 200 gets the 180-day moment (not 90).
        for (const m of [...milestones].sort((a, b) => b - a)) {
          if (daysSince < m) continue
          const k = `anniversary:${athleteId}:${m}`
          if (lsGet(k)) continue
          lsSet(k, '1')
          const result = await postPing(
            athleteId,
            {
              type: 'anniversary',
              payload: { milestoneDays: m, daysSince },
            },
            snapshot,
          )
          if (!cancelled && result && !result.skipped) memory.refresh()
          break
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
