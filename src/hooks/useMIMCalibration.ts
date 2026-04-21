import { useState, useCallback, useEffect, useMemo } from 'react'
import type { DailyTRIMP, SportType } from '../types'
import { DOMS_CARRY } from '../utils/trimp'

export interface MIMOverride {
  sport: SportType
  defaultMIM: number
  calibrated: number
  manual: number | null
  samples: number
  avgRecoveryDays: number
}

const STORAGE_KEY = 'ba_mim_calibration'
const MAX_DRIFT = 0.3

function scopedKey(athleteId?: string) {
  return athleteId ? `${STORAGE_KEY}_${athleteId}` : STORAGE_KEY
}

interface StoredCalibration {
  overrides: Record<string, { calibrated: number; manual: number | null; samples: number; avgRecoveryDays: number }>
  lastCalibrated: string
}

function readStored(athleteId?: string): StoredCalibration {
  try {
    const raw = localStorage.getItem(scopedKey(athleteId))
    return raw ? JSON.parse(raw) : { overrides: {}, lastCalibrated: '' }
  } catch {
    return { overrides: {}, lastCalibrated: '' }
  }
}

function writeStored(data: StoredCalibration, athleteId?: string) {
  try {
    localStorage.setItem(scopedKey(athleteId), JSON.stringify(data))
  } catch { /* quota */ }
}

const DEFAULT_MIM: Record<string, number> = {
  running: 1.0,
  trail_running: 1.1,
  cycling: 0.65,
  ebike: 0.30,
  mountain_biking: 0.8,
  hiking: 0.8,
  hiking_steep: 1.2,
  walking: 0.4,
  swimming: 0.35,
  lap_swimming: 0.35,
  aqua_jogging: 0.6,
  strength_upper: 0.2,
  strength_lower: 2.0,
  strength_full: 1.2,
  hiit: 1.3,
  cardio: 1.3,
  elliptical: 0.7,
  rowing: 0.5,
  indoor_rowing: 0.5,
  yoga: 0.3,
  pilates: 0.3,
  breathwork: 0.0,
  myrtl: 0.1,
  running_drills: 0.5,
  other: 0.6,
}

const EXPECTED_RECOVERY_DAYS: Record<string, number> = {
  strength_lower: 2.5,
  strength_full: 2.0,
  hiking_steep: 1.5,
  trail_running: 1.0,
  running: 0.5,
  hiit: 1.5,
  other: 1.0,
}

export function useMIMCalibration(
  athleteId?: string,
  dailyTrimp?: DailyTRIMP[],
  sorenessLoadByDate?: Map<string, number>,
) {
  const [stored, setStored] = useState<StoredCalibration>(() => readStored(athleteId))

  useEffect(() => {
    setStored(readStored(athleteId))
  }, [athleteId])

  const calibrate = useCallback(() => {
    if (!dailyTrimp || !sorenessLoadByDate || dailyTrimp.length < 7) return

    const updated = { ...stored }

    const sportDays = new Map<string, { date: string; load: number }[]>()
    for (const day of dailyTrimp) {
      for (const rec of day.records) {
        const sport = rec.sportType
        if (!sportDays.has(sport)) sportDays.set(sport, [])
        sportDays.get(sport)!.push({ date: day.date, load: rec.adjustedTRIMP })
      }
    }

    for (const [sport, workouts] of sportDays) {
      if (workouts.length < 2) continue
      const defaultVal = DEFAULT_MIM[sport] ?? 0.6
      const expectedDays = EXPECTED_RECOVERY_DAYS[sport] ?? 1.0

      let totalRecoveryDays = 0
      let measured = 0

      for (const workout of workouts) {
        if (workout.load < 30) continue
        let recoveryDays = 0
        for (let d = 1; d <= 5; d++) {
          const checkDate = new Date(workout.date + 'T12:00:00')
          checkDate.setDate(checkDate.getDate() + d)
          const y = checkDate.getFullYear()
          const m = String(checkDate.getMonth() + 1).padStart(2, '0')
          const day = String(checkDate.getDate()).padStart(2, '0')
          const key = `${y}-${m}-${day}`
          const adj = sorenessLoadByDate.get(key) ?? 0
          if (adj > 0) recoveryDays = d
          else break
        }
        totalRecoveryDays += recoveryDays
        measured++
      }

      if (measured < 2) continue

      const avgRecovery = totalRecoveryDays / measured
      const ratio = avgRecovery / expectedDays

      const existing = updated.overrides[sport]
      const prevCalibrated = existing?.calibrated ?? defaultVal

      let delta = 0
      if (ratio > 1.2) delta = 0.05
      else if (ratio > 1.0) delta = 0.02
      else if (ratio < 0.7) delta = -0.03
      else if (ratio < 0.9) delta = -0.01

      const ema = 0.3
      const newCalibrated = prevCalibrated + ema * delta
      const clamped = Math.max(defaultVal * (1 - MAX_DRIFT), Math.min(defaultVal * (1 + MAX_DRIFT), newCalibrated))
      const rounded = Math.round(clamped * 100) / 100

      updated.overrides[sport] = {
        calibrated: rounded,
        manual: existing?.manual ?? null,
        samples: (existing?.samples ?? 0) + measured,
        avgRecoveryDays: Math.round(avgRecovery * 10) / 10,
      }
    }

    updated.lastCalibrated = new Date().toISOString().slice(0, 10)
    writeStored(updated, athleteId)
    setStored(updated)
  }, [dailyTrimp, sorenessLoadByDate, stored, athleteId])

  useEffect(() => {
    if (!stored.lastCalibrated || dailyTrimp?.length) {
      calibrate()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dailyTrimp?.length])

  const setManualOverride = useCallback((sport: string, value: number | null) => {
    const updated = { ...stored }
    const existing = updated.overrides[sport] ?? {
      calibrated: DEFAULT_MIM[sport] ?? 0.6,
      manual: null,
      samples: 0,
      avgRecoveryDays: 0,
    }
    existing.manual = value
    updated.overrides[sport] = existing
    writeStored(updated, athleteId)
    setStored(updated)
  }, [stored, athleteId])

  const resetOverride = useCallback((sport: string) => {
    const updated = { ...stored }
    delete updated.overrides[sport]
    writeStored(updated, athleteId)
    setStored(updated)
  }, [stored, athleteId])

  const getMultiplier = useCallback((sport: SportType): number => {
    const override = stored.overrides[sport]
    if (override?.manual !== null && override?.manual !== undefined) return override.manual
    if (override?.calibrated !== undefined) return override.calibrated
    return DEFAULT_MIM[sport] ?? 0.6
  }, [stored])

  const allOverrides = useMemo((): MIMOverride[] => {
    const displaySports: SportType[] = [
      'running', 'trail_running', 'cycling', 'ebike', 'mountain_biking',
      'hiking', 'hiking_steep', 'walking',
      'strength_lower', 'strength_full', 'strength_upper',
      'hiit', 'cardio', 'elliptical', 'rowing', 'indoor_rowing',
      'swimming', 'lap_swimming', 'yoga', 'pilates',
      'running_drills', 'myrtl', 'other',
    ]
    return displaySports.map(sport => {
      const defaultVal = DEFAULT_MIM[sport] ?? 0.6
      const override = stored.overrides[sport]
      return {
        sport,
        defaultMIM: defaultVal,
        calibrated: override?.calibrated ?? defaultVal,
        manual: override?.manual ?? null,
        samples: override?.samples ?? 0,
        avgRecoveryDays: override?.avgRecoveryDays ?? 0,
      }
    })
  }, [stored])

  const hasDOMS = useCallback((sport: SportType): boolean => {
    return !!(DOMS_CARRY as Record<string, unknown>)[sport]
  }, [])

  return {
    allOverrides,
    getMultiplier,
    setManualOverride,
    resetOverride,
    calibrate,
    lastCalibrated: stored.lastCalibrated,
    hasDOMS,
  }
}
