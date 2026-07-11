import type { ActualWorkout } from '../types'
import { getCachedActivities } from './strava'
import { getCachedGarminActivities } from './garmin'
import { mapToSportType } from './trimp'

/**
 * Derive the athlete's REAL recent running volume from raw logged history —
 * Garmin + Strava activity caches and manual logs — so plan generation and
 * the redo flow start from measured fitness instead of a questionnaire
 * guess. Synchronous localStorage reads only (no hooks): callable from
 * App's plain-expression plan-generation block and from Onboarding props.
 */

export interface DerivedFitness {
  /** Average weekly RUN miles over the trailing 28 days (1 decimal).
   *  Null when history is too thin to trust (< 2 weeks containing runs). */
  weeklyMileage4wk: number | null
  /** Longest single run in the window, miles (1 decimal). */
  longestRecentRunMi: number | null
  /** How many of the 4 trailing weeks contained at least one run. */
  sampleWeeks: number
}

const WINDOW_DAYS = 28
const MIN_SAMPLE_WEEKS = 2
const RUN_SPORTS = new Set(['running', 'trail_running', 'running_steep', 'treadmill', 'running_drills'])
const METERS_PER_MILE = 1609.344

interface RunEntry {
  iso: string
  miles: number
}

function shiftIso(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00`)
  d.setDate(d.getDate() + days)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${dd}`
}

export function deriveFitnessFromHistory(athleteId: string | undefined, today: string): DerivedFitness {
  const windowStart = shiftIso(today, -(WINDOW_DAYS - 1))
  const runs: RunEntry[] = []
  // Dedupe across sources: the same workout typically syncs from Garmin AND
  // Strava (and may carry a manual note). Same day + distance within half a
  // mile = the same run; source priority garmin > strava > manual.
  const seen: RunEntry[] = []
  const isDupe = (e: RunEntry) => seen.some(s => s.iso === e.iso && Math.abs(s.miles - e.miles) <= 0.5)
  const push = (e: RunEntry) => {
    if (e.iso < windowStart || e.iso > today || e.miles <= 0) return
    if (isDupe(e)) return
    seen.push(e)
    runs.push(e)
  }

  try {
    for (const a of getCachedGarminActivities(athleteId)) {
      const sport = mapToSportType(a.type, { name: a.name, avgHR: a.avgHR, elevationGainFt: a.elevationGainFt, distanceMi: a.distanceMi })
      if (!RUN_SPORTS.has(sport) || !a.distanceMi) continue
      push({ iso: a.date.slice(0, 10), miles: a.distanceMi })
    }
  } catch { /* cache is best-effort */ }

  try {
    for (const a of getCachedActivities(athleteId)) {
      const sport = mapToSportType(a.sport_type || a.type, { name: a.name })
      if (!RUN_SPORTS.has(sport) || !a.distance) continue
      push({ iso: (a.start_date_local || a.start_date || '').slice(0, 10), miles: a.distance / METERS_PER_MILE })
    }
  } catch { /* cache is best-effort */ }

  try {
    const raw = localStorage.getItem(`ba_manual_logs_${athleteId ?? ''}`)
    if (raw) {
      const logs = JSON.parse(raw) as Record<string, ActualWorkout>
      for (const [key, log] of Object.entries(logs)) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) continue
        if (!log || typeof log.distance !== 'number' || log.distance <= 0) continue
        // Manual logs carry no sport type — treat distance entries as runs
        // unless the name clearly says otherwise.
        const name = (log.name || '').toLowerCase()
        if (/\b(ride|bike|cycling|swim|row|hike)\b/.test(name)) continue
        push({ iso: key, miles: log.distance })
      }
    }
  } catch { /* cache is best-effort */ }

  if (runs.length === 0) return { weeklyMileage4wk: null, longestRecentRunMi: null, sampleWeeks: 0 }

  // Weeks counted as trailing 7-day buckets from today.
  const weekOf = (iso: string) => {
    const days = Math.round((Date.parse(`${today}T12:00:00`) - Date.parse(`${iso}T12:00:00`)) / 86_400_000)
    return Math.min(3, Math.max(0, Math.floor(days / 7)))
  }
  const weeksWithRuns = new Set(runs.map(r => weekOf(r.iso)))
  const sampleWeeks = weeksWithRuns.size
  if (sampleWeeks < MIN_SAMPLE_WEEKS) {
    return { weeklyMileage4wk: null, longestRecentRunMi: null, sampleWeeks }
  }

  const total = runs.reduce((s, r) => s + r.miles, 0)
  const longest = runs.reduce((m, r) => Math.max(m, r.miles), 0)
  return {
    weeklyMileage4wk: Math.round((total / 4) * 10) / 10,
    longestRecentRunMi: Math.round(longest * 10) / 10,
    sampleWeeks,
  }
}
