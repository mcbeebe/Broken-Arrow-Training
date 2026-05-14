import { useState, useCallback, useEffect } from 'react'
import type { TrainingWeek, PlannedDay } from '../types'

export interface PlanOverride {
  id: string
  weekNum: number
  dayIndex: number
  updates: Partial<Omit<PlannedDay, 'day' | 'actual'>>
  rationale?: string
  appliedAt: number
}

const STORAGE_KEY = 'ba_plan_overrides'

function scopedKey(athleteId?: string) {
  return athleteId ? `${STORAGE_KEY}_${athleteId}` : STORAGE_KEY
}

function readOverrides(athleteId?: string): PlanOverride[] {
  try {
    const raw = localStorage.getItem(scopedKey(athleteId))
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function writeOverrides(overrides: PlanOverride[], athleteId?: string) {
  try {
    localStorage.setItem(scopedKey(athleteId), JSON.stringify(overrides))
  } catch { /* quota */ }
}

export function usePlanOverrides(athleteId?: string) {
  const [overrides, setOverrides] = useState<PlanOverride[]>(() => readOverrides(athleteId))

  useEffect(() => {
    setOverrides(readOverrides(athleteId))
  }, [athleteId])

  const applyOverride = useCallback((override: Omit<PlanOverride, 'id' | 'appliedAt'>) => {
    const next: PlanOverride = {
      ...override,
      id: `override_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      appliedAt: Date.now(),
    }
    const filtered = overrides.filter(o =>
      !(o.weekNum === next.weekNum && o.dayIndex === next.dayIndex),
    )
    const nextList = [...filtered, next]
    writeOverrides(nextList, athleteId)
    setOverrides(nextList)
    return next.id
  }, [overrides, athleteId])

  const removeOverride = useCallback((id: string) => {
    const nextList = overrides.filter(o => o.id !== id)
    writeOverrides(nextList, athleteId)
    setOverrides(nextList)
  }, [overrides, athleteId])

  const removeForDay = useCallback((weekNum: number, dayIndex: number) => {
    const nextList = overrides.filter(o => !(o.weekNum === weekNum && o.dayIndex === dayIndex))
    writeOverrides(nextList, athleteId)
    setOverrides(nextList)
  }, [overrides, athleteId])

  const resetAll = useCallback(() => {
    writeOverrides([], athleteId)
    setOverrides([])
  }, [athleteId])

  // Keep override anchors aligned with a day swap. Without this, an
  // override sticks to its old slot — which after a swap holds a
  // different base workout — and the override silently merges into
  // the wrong day (e.g. an UPPER BODY edit lands on a Rest slot,
  // making the swap destination appear empty).
  const swapDayIndices = useCallback((weekNum: number, fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return
    const nextList = overrides.map(o => {
      if (o.weekNum !== weekNum) return o
      if (o.dayIndex === fromIndex) return { ...o, dayIndex: toIndex }
      if (o.dayIndex === toIndex) return { ...o, dayIndex: fromIndex }
      return o
    })
    writeOverrides(nextList, athleteId)
    setOverrides(nextList)
  }, [overrides, athleteId])

  const applyOverridesToWeeks = useCallback((weeks: TrainingWeek[]): TrainingWeek[] => {
    if (overrides.length === 0) return weeks
    return weeks.map(week => {
      const weekOverrides = overrides.filter(o => o.weekNum === week.num)
      if (weekOverrides.length === 0) return week
      return {
        ...week,
        days: week.days.map((day, idx) => {
          const ov = weekOverrides.find(o => o.dayIndex === idx)
          if (!ov) return day
          return { ...day, ...ov.updates }
        }),
      }
    })
  }, [overrides])

  return {
    overrides,
    applyOverride,
    removeOverride,
    removeForDay,
    resetAll,
    swapDayIndices,
    applyOverridesToWeeks,
  }
}
