import { useCallback, useEffect, useMemo, useState } from 'react'
import type { DailyTRIMP, SportType } from '../types'
import {
  DOMS_CARRY,
  DEFAULT_DOMS_MULT,
  DOMS_MULT_MIN,
  DOMS_MULT_MAX,
  calibrateDOMSCarry,
  invalidateDOMSCalibrationCache,
} from '../utils/trimp'
import { SPORT_LABELS } from './useMIMCalibration'

/**
 * Per-athlete DOMS carry-forward calibration.
 *
 * The default DOMS_CARRY table is averaged from group studies — but
 * individual athletes recover faster or slower. This hook compares
 * predicted DOMS vs the user's logged soreness over a rolling window
 * and proposes a per-sport scalar multiplier that the engine
 * (`applyDOMSCarryForward`) uses next render.
 *
 * Mirrors `useMIMCalibration`: localStorage-backed, suggestions
 * surface for accept/dismiss, manual overrides supported.
 */

export interface DOMSOverride {
  sport: SportType
  defaultMult: number
  calibrated: number
  manual: number | null
  samples: number
  avgRatio: number
}

export interface DOMSSuggestion {
  sport: SportType
  currentMult: number
  suggestedMult: number
  avgRatio: number
  samples: number
  reason: string
}

interface StoredCalibration {
  overrides: Record<string, {
    calibrated: number
    manual: number | null
    samples: number
    avgRatio: number
  }>
  lastCalibrated: string
  pendingSuggestions?: DOMSSuggestion[]
  dismissedSuggestions?: string[]
}

const STORAGE_KEY = 'ba_doms_calibration'
const EMA_WEIGHT = 0.3
const CHANGE_THRESHOLD = 0.05  // suggest only if calibrated drift ≥ 5 %

function scopedKey(athleteId?: string) {
  return athleteId ? `${STORAGE_KEY}_${athleteId}` : STORAGE_KEY
}

function readStored(athleteId?: string): StoredCalibration {
  try {
    const raw = localStorage.getItem(scopedKey(athleteId))
    if (!raw) return { overrides: {}, lastCalibrated: '' }
    return JSON.parse(raw) as StoredCalibration
  } catch {
    return { overrides: {}, lastCalibrated: '' }
  }
}

function writeStored(data: StoredCalibration, athleteId?: string) {
  try {
    localStorage.setItem(scopedKey(athleteId), JSON.stringify(data))
    invalidateDOMSCalibrationCache()
  } catch { /* quota */ }
}

const DOMS_SPORTS: SportType[] = (Object.keys(DOMS_CARRY) as SportType[])

export function useDOMSCalibration(
  athleteId?: string,
  dailyTrimp?: DailyTRIMP[],
  sorenessLoadByDate?: Map<string, number>,
) {
  const [stored, setStored] = useState<StoredCalibration>(() => readStored(athleteId))

  useEffect(() => {
    setStored(readStored(athleteId))
  }, [athleteId])

  const getMultiplier = useCallback((sport: SportType): number => {
    const o = stored.overrides[sport]
    if (!o) return DEFAULT_DOMS_MULT
    if (o.manual !== null && o.manual !== undefined) return o.manual
    if (o.calibrated !== undefined) return o.calibrated
    return DEFAULT_DOMS_MULT
  }, [stored])

  const calibrate = useCallback((): string => {
    if (!dailyTrimp || dailyTrimp.length < 5) {
      return 'Not enough training history yet (need 5+ days).'
    }
    if (!sorenessLoadByDate || sorenessLoadByDate.size === 0) {
      return 'No soreness check-ins logged yet — start checking in to enable DOMS calibration.'
    }

    const samples = calibrateDOMSCarry({
      dailyTrimp,
      sorenessByDate: sorenessLoadByDate,
      currentMultiplier: getMultiplier,
    })
    if (samples.length === 0) {
      return 'No isolated DOMS workouts found in the window — need a few clean training-rest sequences.'
    }

    const updated: StoredCalibration = { ...stored, overrides: { ...stored.overrides } }
    const dismissed = new Set(updated.dismissedSuggestions ?? [])
    const newSuggestions: DOMSSuggestion[] = []

    for (const s of samples) {
      const existing = updated.overrides[s.sport]
      const currentMult = existing?.manual ?? existing?.calibrated ?? DEFAULT_DOMS_MULT

      // EMA blend the current multiplier toward the observed ratio.
      // ratio > 1 → user is more sore than predicted → bump multiplier up.
      const target = currentMult * s.ratio
      const blended = currentMult + EMA_WEIGHT * (target - currentMult)
      const clamped = Math.max(DOMS_MULT_MIN, Math.min(DOMS_MULT_MAX, blended))
      const rounded = Math.round(clamped * 100) / 100

      // Always update displayed avgRatio + samples even when no suggestion fires
      updated.overrides[s.sport] = {
        calibrated: existing?.calibrated ?? DEFAULT_DOMS_MULT,
        manual: existing?.manual ?? null,
        samples: (existing?.samples ?? 0) + s.samples,
        avgRatio: s.ratio,
      }

      if (Math.abs(rounded - currentMult) < CHANGE_THRESHOLD) continue
      if (dismissed.has(s.sport)) continue

      const sportLabel = SPORT_LABELS[s.sport] || s.sport
      const direction = rounded > currentMult ? 'increase' : 'decrease'
      const reason = `${sportLabel}: measured soreness ran ${(s.ratio * 100).toFixed(0)}% of predicted DOMS over ${s.samples} sessions. Suggesting ${direction} from ${currentMult.toFixed(2)}× → ${rounded.toFixed(2)}×.`
      newSuggestions.push({
        sport: s.sport,
        currentMult,
        suggestedMult: rounded,
        avgRatio: s.ratio,
        samples: s.samples,
        reason,
      })
    }

    updated.lastCalibrated = new Date().toISOString().slice(0, 10)
    updated.pendingSuggestions = newSuggestions.length > 0 ? newSuggestions : undefined
    writeStored(updated, athleteId)
    setStored(updated)

    if (newSuggestions.length > 0) {
      return `Found ${newSuggestions.length} DOMS calibration suggestion(s).`
    }
    return 'DOMS calibration up to date — no changes needed.'
  }, [dailyTrimp, sorenessLoadByDate, stored, athleteId, getMultiplier])

  // Auto-run calibration when the input data set grows
  useEffect(() => {
    if (!stored.lastCalibrated || (dailyTrimp && dailyTrimp.length > 0)) {
      calibrate()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dailyTrimp?.length, sorenessLoadByDate?.size])

  const acceptSuggestion = useCallback((sport: string): string => {
    const suggestion = (stored.pendingSuggestions ?? []).find(s => s.sport === sport)
    if (!suggestion) return ''
    const updated: StoredCalibration = { ...stored, overrides: { ...stored.overrides } }
    const existing = updated.overrides[sport] ?? {
      calibrated: DEFAULT_DOMS_MULT,
      manual: null,
      samples: 0,
      avgRatio: 1,
    }
    existing.calibrated = suggestion.suggestedMult
    updated.overrides[sport] = existing
    updated.pendingSuggestions = (updated.pendingSuggestions ?? []).filter(s => s.sport !== sport)
    if (updated.pendingSuggestions.length === 0) updated.pendingSuggestions = undefined
    writeStored(updated, athleteId)
    setStored(updated)
    const label = SPORT_LABELS[sport] || sport
    return `DOMS multiplier for ${label} updated to ${suggestion.suggestedMult.toFixed(2)}× (was ${suggestion.currentMult.toFixed(2)}×, ${suggestion.samples} samples).`
  }, [stored, athleteId])

  const dismissSuggestion = useCallback((sport: string) => {
    const updated: StoredCalibration = { ...stored }
    updated.pendingSuggestions = (updated.pendingSuggestions ?? []).filter(s => s.sport !== sport)
    if (updated.pendingSuggestions?.length === 0) updated.pendingSuggestions = undefined
    updated.dismissedSuggestions = [...(updated.dismissedSuggestions ?? []), sport]
    writeStored(updated, athleteId)
    setStored(updated)
  }, [stored, athleteId])

  const setManualOverride = useCallback((sport: string, value: number | null) => {
    const updated: StoredCalibration = { ...stored, overrides: { ...stored.overrides } }
    const existing = updated.overrides[sport] ?? {
      calibrated: DEFAULT_DOMS_MULT,
      manual: null,
      samples: 0,
      avgRatio: 1,
    }
    existing.manual = value === null ? null : Math.max(DOMS_MULT_MIN, Math.min(DOMS_MULT_MAX, value))
    updated.overrides[sport] = existing
    writeStored(updated, athleteId)
    setStored(updated)
  }, [stored, athleteId])

  const resetOverride = useCallback((sport: string) => {
    const updated: StoredCalibration = { ...stored, overrides: { ...stored.overrides } }
    delete updated.overrides[sport]
    writeStored(updated, athleteId)
    setStored(updated)
  }, [stored, athleteId])

  const allOverrides = useMemo((): DOMSOverride[] => {
    return DOMS_SPORTS.map(sport => {
      const o = stored.overrides[sport]
      return {
        sport,
        defaultMult: DEFAULT_DOMS_MULT,
        calibrated: o?.calibrated ?? DEFAULT_DOMS_MULT,
        manual: o?.manual ?? null,
        samples: o?.samples ?? 0,
        avgRatio: o?.avgRatio ?? 1,
      }
    })
  }, [stored])

  const pendingSuggestions = useMemo(
    () => stored.pendingSuggestions ?? [],
    [stored.pendingSuggestions],
  )

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
  }
}
