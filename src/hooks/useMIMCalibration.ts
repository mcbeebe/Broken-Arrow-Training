import { useState, useCallback, useEffect, useMemo } from 'react'
import type { DailyTRIMP, SportType } from '../types'
import { DOMS_CARRY, describeMIMEngine, type MIMEngine } from '../utils/trimp'

export interface MIMOverride {
  sport: SportType
  defaultMIM: number
  calibrated: number
  manual: number | null
  samples: number
  avgRecoveryDays: number
  /** Which formula the engine uses to resolve MIM at workout time —
   *  static lookup or one of the v1.1 dynamic formulas. */
  engine: MIMEngine
  /** Short human label for the formula (e.g. "0.4 + 0.4·IF²"). */
  formulaLabel: string
  /** Typical realized range when the dynamic formula is used. */
  typicalRange?: [number, number]
  /** Avg of `sportMultiplier` actually applied across recent (last 30d)
   *  TRIMP records for this sport — what the engine *really* did, not
   *  the table default. `null` when no recent samples. */
  recentAvgMIM: number | null
  /** Number of TRIMP records in the recent-avg window. */
  recentSampleCount: number
}

export interface MIMSuggestion {
  sport: SportType
  currentMIM: number
  suggestedMIM: number
  avgRecoveryDays: number
  expectedRecoveryDays: number
  samples: number
  reason: string
}

const STORAGE_KEY = 'ba_mim_calibration'
const MAX_DRIFT = 0.3
const CHANGE_THRESHOLD = 0.05

function scopedKey(athleteId?: string) {
  return athleteId ? `${STORAGE_KEY}_${athleteId}` : STORAGE_KEY
}

interface StoredCalibration {
  overrides: Record<string, { calibrated: number; manual: number | null; samples: number; avgRecoveryDays: number }>
  lastCalibrated: string
  pendingSuggestions?: MIMSuggestion[]
  dismissedSuggestions?: string[]
}

function readStored(athleteId?: string): StoredCalibration {
  try {
    const raw = localStorage.getItem(scopedKey(athleteId))
    if (!raw) return { overrides: {}, lastCalibrated: '' }
    const data: StoredCalibration = JSON.parse(raw)
    // Migrate: clear stale auto-calibrated values from the old code that
    // applied silently. If a calibrated value differs from the default by
    // less than the change threshold and there's no manual override, it was
    // never explicitly accepted — reset it to the default.
    for (const [sport, o] of Object.entries(data.overrides)) {
      const def = DEFAULT_MIM[sport] ?? 0.6
      if (o.manual === null && Math.abs(o.calibrated - def) < CHANGE_THRESHOLD) {
        o.calibrated = def
      }
    }
    return data
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
  running_steep: 1.3,
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

export const SPORT_LABELS: Record<string, string> = {
  running: 'Running', trail_running: 'Trail Running', running_steep: 'Steep Running', cycling: 'Cycling',
  ebike: 'E-Bike', mountain_biking: 'Mountain Biking', hiking: 'Hiking',
  hiking_steep: 'Steep Hiking', walking: 'Walking', swimming: 'Swimming',
  lap_swimming: 'Lap Swimming', aqua_jogging: 'Aqua Jogging',
  strength_upper: 'Strength (Upper)', strength_lower: 'Strength (Lower)',
  strength_full: 'Strength (Full)', hiit: 'HIIT', cardio: 'Cardio',
  elliptical: 'Elliptical', rowing: 'Rowing', indoor_rowing: 'Indoor Rowing',
  yoga: 'Yoga', pilates: 'Pilates', running_drills: 'Running Drills',
  myrtl: 'Myrtl', other: 'Other',
}

const EXPECTED_RECOVERY_DAYS: Record<string, number> = {
  strength_lower: 2.5,
  strength_full: 2.0,
  hiking_steep: 1.5,
  running_steep: 1.5,
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

  const calibrate = useCallback((): string => {
    if (!dailyTrimp || dailyTrimp.length < 3) return 'Not enough training data yet (need 3+ days).'
    if (!sorenessLoadByDate || sorenessLoadByDate.size === 0) return 'No soreness check-ins logged yet. Log soreness after workouts to enable calibration.'

    const updated = { ...stored }
    const newSuggestions: MIMSuggestion[] = []
    const dismissed = new Set(updated.dismissedSuggestions ?? [])

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
      const currentMIM = existing?.manual ?? existing?.calibrated ?? defaultVal

      let delta = 0
      if (ratio > 1.2) delta = 0.05
      else if (ratio > 1.0) delta = 0.02
      else if (ratio < 0.7) delta = -0.03
      else if (ratio < 0.9) delta = -0.01

      if (Math.abs(delta) < 0.01) continue

      const ema = 0.3
      const newCalibrated = currentMIM + ema * delta
      const clamped = Math.max(defaultVal * (1 - MAX_DRIFT), Math.min(defaultVal * (1 + MAX_DRIFT), newCalibrated))
      const rounded = Math.round(clamped * 100) / 100

      if (Math.abs(rounded - currentMIM) >= CHANGE_THRESHOLD && !dismissed.has(sport)) {
        const sportLabel = SPORT_LABELS[sport] || sport
        const direction = rounded > currentMIM ? 'increase' : 'decrease'
        newSuggestions.push({
          sport: sport as SportType,
          currentMIM,
          suggestedMIM: rounded,
          avgRecoveryDays: Math.round(avgRecovery * 10) / 10,
          expectedRecoveryDays: expectedDays,
          samples: measured,
          reason: `Your avg recovery after ${sportLabel} is ${(avgRecovery).toFixed(1)} days (expected ${expectedDays}). Suggesting ${direction} from ${currentMIM.toFixed(2)} → ${rounded.toFixed(2)}.`,
        })
      }

      // Update avg recovery stats even without applying the MIM change
      updated.overrides[sport] = {
        ...existing,
        calibrated: existing?.calibrated ?? defaultVal,
        manual: existing?.manual ?? null,
        samples: (existing?.samples ?? 0) + measured,
        avgRecoveryDays: Math.round(avgRecovery * 10) / 10,
      }
    }

    updated.lastCalibrated = new Date().toISOString().slice(0, 10)
    updated.pendingSuggestions = newSuggestions.length > 0 ? newSuggestions : undefined
    writeStored(updated, athleteId)
    setStored(updated)
    if (newSuggestions.length > 0) return `Found ${newSuggestions.length} calibration suggestion(s). Check Summary tab.`
    return 'Calibration complete — all values within expected range. No changes needed.'
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

  // Roll up actual realized MIM per sport from the last 30 days of
  // TRIMP records. Captures the dynamic-formula output (cycling IF,
  // hiking grade) so the Settings table can show "what the engine did"
  // rather than just the static default.
  const realizedBySport = useMemo(() => {
    const out = new Map<SportType, { sum: number; count: number }>()
    if (!dailyTrimp || dailyTrimp.length === 0) return out
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000
    for (const day of dailyTrimp) {
      const t = new Date(day.date + 'T00:00:00').getTime()
      if (Number.isFinite(t) && t < cutoff) continue
      for (const rec of day.records) {
        const bucket = out.get(rec.sportType) ?? { sum: 0, count: 0 }
        bucket.sum += rec.sportMultiplier
        bucket.count += 1
        out.set(rec.sportType, bucket)
      }
    }
    return out
  }, [dailyTrimp])

  const allOverrides = useMemo((): MIMOverride[] => {
    const displaySports: SportType[] = [
      'running', 'trail_running', 'running_steep', 'cycling', 'ebike', 'mountain_biking',
      'hiking', 'hiking_steep', 'walking',
      'strength_lower', 'strength_full', 'strength_upper',
      'hiit', 'cardio', 'elliptical', 'rowing', 'indoor_rowing',
      'swimming', 'lap_swimming', 'yoga', 'pilates',
      'running_drills', 'myrtl', 'other',
    ]
    return displaySports.map(sport => {
      const defaultVal = DEFAULT_MIM[sport] ?? 0.6
      const override = stored.overrides[sport]
      const desc = describeMIMEngine(sport)
      const realized = realizedBySport.get(sport)
      const recentAvgMIM = realized && realized.count > 0
        ? Math.round((realized.sum / realized.count) * 100) / 100
        : null
      return {
        sport,
        defaultMIM: defaultVal,
        calibrated: override?.calibrated ?? defaultVal,
        manual: override?.manual ?? null,
        samples: override?.samples ?? 0,
        avgRecoveryDays: override?.avgRecoveryDays ?? 0,
        engine: desc.engine,
        formulaLabel: desc.formulaLabel,
        typicalRange: desc.typicalRange,
        recentAvgMIM,
        recentSampleCount: realized?.count ?? 0,
      }
    }).sort((a, b) => {
      const aActive = a.manual ?? a.calibrated
      const bActive = b.manual ?? b.calibrated
      return bActive - aActive
    })
  }, [stored])

  const acceptSuggestion = useCallback((sport: string): string => {
    const updated = { ...stored }
    const suggestion = (updated.pendingSuggestions ?? []).find(s => s.sport === sport)
    if (!suggestion) return ''

    const existing = updated.overrides[sport] ?? {
      calibrated: DEFAULT_MIM[sport] ?? 0.6,
      manual: null,
      samples: 0,
      avgRecoveryDays: 0,
    }
    existing.calibrated = suggestion.suggestedMIM
    updated.overrides[sport] = existing
    updated.pendingSuggestions = (updated.pendingSuggestions ?? []).filter(s => s.sport !== sport)
    if (updated.pendingSuggestions.length === 0) updated.pendingSuggestions = undefined
    writeStored(updated, athleteId)
    setStored(updated)

    const label = SPORT_LABELS[sport] || sport
    return `MIM for ${label} updated from ${suggestion.currentMIM.toFixed(2)} to ${suggestion.suggestedMIM.toFixed(2)} based on ${suggestion.avgRecoveryDays}-day avg recovery (${suggestion.samples} sessions).`
  }, [stored, athleteId])

  const dismissSuggestion = useCallback((sport: string) => {
    const updated = { ...stored }
    updated.pendingSuggestions = (updated.pendingSuggestions ?? []).filter(s => s.sport !== sport)
    if (updated.pendingSuggestions?.length === 0) updated.pendingSuggestions = undefined
    updated.dismissedSuggestions = [...(updated.dismissedSuggestions ?? []), sport]
    writeStored(updated, athleteId)
    setStored(updated)
  }, [stored, athleteId])

  const pendingSuggestions = useMemo(
    () => stored.pendingSuggestions ?? [],
    [stored.pendingSuggestions],
  )

  const hasDOMS = useCallback((sport: SportType): boolean => {
    return !!(DOMS_CARRY as Record<string, unknown>)[sport]
  }, [])

  return {
    allOverrides,
    pendingSuggestions,
    getMultiplier,
    setManualOverride,
    resetOverride,
    acceptSuggestion,
    dismissSuggestion,
    calibrate,
    lastCalibrated: stored.lastCalibrated,
    hasDOMS,
  }
}
