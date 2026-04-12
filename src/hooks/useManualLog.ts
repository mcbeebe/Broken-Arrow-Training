import { useState, useCallback } from 'react'
import type { ActualWorkout, TrainingWeek } from '../types'

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
  localStorage.setItem(`${STORAGE_KEY}_${athleteId}`, JSON.stringify(logs))
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
        if (logged) return { ...day, actual: logged }
        return day
      }),
    }))
  }, [logs])

  return { logs, logWorkout, applyLogsToWeeks }
}
