import { useState, useCallback, useEffect } from 'react'
import type { ActualWorkout, TrainingWeek } from '../types'
import { stampKey } from '../utils/syncStamps'
import { parseDayToDate } from '../utils/planDates'

const STORAGE_KEY = 'ba_manual_logs'

/** Keys are ISO dates (YYYY-MM-DD) since the P0 fix; legacy entries keyed
 *  by day label ("Sat 7/4") are migrated on read and still honored on
 *  lookup. */
interface ManualLogs {
  [dayKey: string]: ActualWorkout
}

/** Canonical storage key for a plan-day label: the ISO date when the label
 *  parses, the label itself as a legacy fallback. ISO keys are what let a
 *  logged workout — and the journal note riding on it — SURVIVE a plan
 *  rebuild: the P0 failure this fixes was label keys silently orphaning
 *  every entry when onboarding-redo regenerated the plan. */
export function manualLogKey(dayLabel: string): string {
  return parseDayToDate(dayLabel) ?? dayLabel
}

function migrateToIsoKeys(logs: ManualLogs): { logs: ManualLogs; changed: boolean } {
  let changed = false
  const out: ManualLogs = {}
  for (const [key, actual] of Object.entries(logs)) {
    const iso = parseDayToDate(key)
    if (iso && iso !== key && !(iso in logs)) {
      out[iso] = actual
      changed = true
    } else {
      out[key] = actual
    }
  }
  return { logs: out, changed }
}

function saveLogs(athleteId: string, logs: ManualLogs): void {
  const key = `${STORAGE_KEY}_${athleteId}`
  localStorage.setItem(key, JSON.stringify(logs))
  stampKey(key)
}

function loadLogs(athleteId: string): ManualLogs {
  const raw = localStorage.getItem(`${STORAGE_KEY}_${athleteId}`)
  if (!raw) return {}
  try {
    const { logs, changed } = migrateToIsoKeys(JSON.parse(raw) as ManualLogs)
    // Persist the migration so sync carries ISO keys forward. (An
    // un-migrated device union-merging label keys back in is harmless —
    // lookup still falls back to labels and the migration re-runs.)
    if (changed) saveLogs(athleteId, logs)
    return logs
  } catch {
    return {}
  }
}

export function useManualLog(athleteId: string) {
  const [logs, setLogs] = useState<ManualLogs>(() => loadLogs(athleteId))

  // Re-read on cross-device sync pulls (synthetic `storage` events).
  useEffect(() => {
    const watched = `${STORAGE_KEY}_${athleteId}`
    function onStorage(e: StorageEvent) {
      if (e.key !== watched) return
      setLogs(loadLogs(athleteId))
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [athleteId])

  const logWorkout = useCallback((dayLabel: string, data: ActualWorkout) => {
    setLogs(prev => {
      const next = { ...prev, [manualLogKey(dayLabel)]: data }
      saveLogs(athleteId, next)
      return next
    })
  }, [athleteId])

  const applyLogsToWeeks = useCallback((weeks: TrainingWeek[]): TrainingWeek[] => {
    return weeks.map(week => ({
      ...week,
      days: week.days.map(day => {
        // ISO-date lookup first (survives plan rebuilds), label fallback
        // for anything the migration couldn't parse.
        const logged = logs[manualLogKey(day.day)] ?? logs[day.day]
        if (!logged) return day
        // Merge: preserve Garmin biometrics (garminId, source, epoc, TE, HR
        // zones) from the existing actual, layer manual edits on top
        const merged = day.actual
          ? { ...day.actual, ...logged, garminId: day.actual.garminId ?? logged.garminId, source: day.actual.source ?? logged.source }
          : logged
        return { ...day, actual: merged }
      }),
    }))
  }, [logs])

  return { logs, logWorkout, applyLogsToWeeks }
}
