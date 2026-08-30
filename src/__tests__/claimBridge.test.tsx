/**
 * Claim bridge — a demoted activity the sync gates wouldn't auto-match can
 * be claimed as today's workout in one tap: the day resolves, the biometrics
 * attach, and the claimed activity stops double-showing as a secondary.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { renderHook, act } from '@testing-library/react'
import type { ActualWorkout, PlannedDay, TrainingWeek } from '../types'
import { useManualLog } from '../hooks/useManualLog'
import WorkoutModal from '../components/WorkoutModal'

afterEach(cleanup)

const erg = (): ActualWorkout => ({
  stravaId: 0, garminId: 555, source: 'garmin', distance: 0, movingTime: 214, elapsedTime: 214,
  elevationGain: 0, avgHR: 168, type: 'indoor_rowing', name: '1km erg TT', startDate: '2026-09-07T16:00:00',
})
const walk = (): ActualWorkout => ({
  stravaId: 0, garminId: 777, source: 'garmin', distance: 1.2, movingTime: 900, elapsedTime: 900,
  elevationGain: 0, type: 'walk', name: 'Evening walk', startDate: '2026-09-07T19:00:00',
})

function demotedWeek(): TrainingWeek {
  const day: PlannedDay = {
    day: 'Mon 9/7', type: 'quality', workout: 'Intervals', detail: '', zone: 'Z4', route: 'Track', time: '40 min',
    secondaryActuals: [erg(), walk()], // both demoted; day.actual undefined → grades missed
  }
  return { num: 1, dates: 'Sep 7–13', startIso: '2026-09-07', miles: 20, focus: 'Build', days: [day] }
}

describe('useManualLog — claim resolves the day and de-dups the secondary', () => {
  it('claiming a cross-family erg sets it as the actual and drops it from secondaries', () => {
    localStorage.clear()
    const { result } = renderHook(() => useManualLog('mike'))
    act(() => result.current.logWorkout('Mon 9/7', erg(), '2026-09-07'))
    const [w] = result.current.applyLogsToWeeks([demotedWeek()])
    const d = w.days[0]
    expect(d.actual?.garminId).toBe(555)      // day resolved from the erg
    expect(d.actual?.avgHR).toBe(168)         // biometrics attached
    // the claimed erg no longer double-shows; the unrelated walk stays
    expect(d.secondaryActuals?.map(s => s.garminId)).toEqual([777])
  })

  it('a hand-typed manual log (no source id) never strips real secondaries', () => {
    localStorage.clear()
    const { result } = renderHook(() => useManualLog('mike'))
    const typed: ActualWorkout = {
      stravaId: 0, source: 'manual', distance: 3, movingTime: 1500, elapsedTime: 1500,
      elevationGain: 0, type: 'Run', name: 'Logged by hand', startDate: '2026-09-07T08:00:00',
    }
    act(() => result.current.logWorkout('Mon 9/7', typed, '2026-09-07'))
    const [w] = result.current.applyLogsToWeeks([demotedWeek()])
    expect(w.days[0].actual?.name).toBe('Logged by hand')
    expect(w.days[0].secondaryActuals?.length).toBe(2) // both secondaries survive
  })
})

describe('WorkoutModal — the claim button', () => {
  const base = { weekNum: 1, athleteId: 't', onClose: () => {} }

  it('offers "count this as today\'s workout" on an unclaimed day and calls back', () => {
    localStorage.clear()
    const onClaim = vi.fn()
    const day: PlannedDay = {
      day: 'Mon 9/7', type: 'quality', workout: 'Intervals', detail: '', zone: 'Z4', route: 'Track', time: '40 min',
      secondaryActuals: [erg()],
    }
    render(<WorkoutModal {...base} day={day} onClaimSecondary={onClaim} />)
    fireEvent.click(screen.getByTestId('claim-secondary-0'))
    expect(onClaim).toHaveBeenCalledTimes(1)
    expect(onClaim.mock.calls[0][0].garminId).toBe(555)
  })

  it('shows no claim button once the day already has an actual', () => {
    localStorage.clear()
    const day: PlannedDay = {
      day: 'Mon 9/7', type: 'quality', workout: 'Intervals', detail: '', zone: 'Z4', route: 'Track', time: '40 min',
      actual: { ...erg(), garminId: 999, name: 'Matched run' },
      secondaryActuals: [erg()],
    }
    render(<WorkoutModal {...base} day={day} onClaimSecondary={vi.fn()} />)
    expect(screen.queryByTestId('claim-secondary-0')).toBeNull()
  })
})
