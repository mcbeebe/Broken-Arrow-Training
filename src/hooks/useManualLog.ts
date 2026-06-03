import { useState, useCallback } from 'react'
import type { ActualWorkout, TrainingWeek } from '../types'
import { stampKey } from '../utils/syncStamps'

const STORAGE_KEY = 'ba_manual_logs'

interface ManualLogs {
  [dayLabel: string]: ActualWorkout
}

function loadLogs(athleteId: string): ManualLogs {
  const raw = localStorage.getItem(`${STORAGE_KEY}_${athleteId}`)
  if (!raw) return {}
  return JSON.parse(raw) as ManualLogs
}

function saveLogs(athleteId: string, logs: ManualLogs): void {
  const key = `${STORAGE_KEY}_${athleteId}`
  localStorage.setItem(key, JSON.stringify(logs))
  stampKey(key)
}

export function useManualLog(athleteId: string) {
  const [logs, setLogs] = useState<ManualLogs>(() => loadLogs(athleteId))

  const logWorkout = useCallback((dayLabel: string, data: ActualWorkout) => {
    setLogs(prev => {
      const next = { ...prev, [dayLabel]: data }
      saveLogs(athleteId, next)
      return next
    })
  }, [athleteId])

  const applyLogsToWeeks = useCallback((weeks: TrainingWeek[]): TrainingWeek[] => {
    return weeks.map(week => ({
      ...week,
      days: week.days.map(day => {
        const logged = logs[day.day]
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
