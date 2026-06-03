import { useState, useCallback, useEffect } from 'react'
import type { TrainingWeek, PlannedDay } from '../types'
import { stampKey } from '../utils/syncStamps'

const STORAGE_KEY = 'ba_day_swaps'

interface DaySwap {
  weekNum: number
  fromIndex: number
  toIndex: number
}

function loadSwaps(athleteId: string): DaySwap[] {
  const raw = localStorage.getItem(`${STORAGE_KEY}_${athleteId}`)
  if (!raw) return []
  return JSON.parse(raw) as DaySwap[]
}

function saveSwaps(athleteId: string, swaps: DaySwap[]): void {
  const key = `${STORAGE_KEY}_${athleteId}`
  localStorage.setItem(key, JSON.stringify(swaps))
  stampKey(key)
}

/**
 * Swap the workout content between two days, keeping day labels fixed.
 */
function swapDayContent(dayA: PlannedDay, dayB: PlannedDay): [PlannedDay, PlannedDay] {
  return [
    { ...dayB, day: dayA.day },
    { ...dayA, day: dayB.day },
  ]
}

export function useDaySwap(athleteId: string) {
  const [swaps, setSwaps] = useState<DaySwap[]>(() => loadSwaps(athleteId))

  // Re-read on cross-device sync pulls (synthetic `storage` events).
  useEffect(() => {
    const watched = `${STORAGE_KEY}_${athleteId}`
    function onStorage(e: StorageEvent) {
      if (e.key !== watched) return
      setSwaps(loadSwaps(athleteId))
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [athleteId])

  const swapDays = useCallback((weekNum: number, fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return
    setSwaps(prev => {
      const next = [...prev, { weekNum, fromIndex, toIndex }]
      saveSwaps(athleteId, next)
      return next
    })
  }, [athleteId])

  const resetWeek = useCallback((weekNum: number) => {
    setSwaps(prev => {
      const next = prev.filter(s => s.weekNum !== weekNum)
      saveSwaps(athleteId, next)
      return next
    })
  }, [athleteId])

  const applySwapsToWeeks = useCallback((weeks: TrainingWeek[]): TrainingWeek[] => {
    return weeks.map(week => {
      const weekSwaps = swaps.filter(s => s.weekNum === week.num)
      if (weekSwaps.length === 0) return week

      const days = [...week.days]
      for (const swap of weekSwaps) {
        const [newA, newB] = swapDayContent(days[swap.fromIndex], days[swap.toIndex])
        days[swap.fromIndex] = newA
        days[swap.toIndex] = newB
      }
      return { ...week, days }
    })
  }, [swaps])

  const hasSwaps = useCallback((weekNum: number): boolean => {
    return swaps.some(s => s.weekNum === weekNum)
  }, [swaps])

  return { swapDays, resetWeek, applySwapsToWeeks, hasSwaps }
}
