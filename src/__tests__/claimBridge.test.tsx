/**
 * Claim bridge — a demoted activity the sync gates wouldn't auto-match can
 * be claimed as today's workout in one tap: the day resolves, the biometrics
 * attach, and the claimed activity stops double-showing as a secondary.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { renderHook, act } from '@testing-library/react'
import type { ActualWorkout, PlannedDay, TrainingWeek } from '../types'
import { useManualLog, claimEntry } from '../hooks/useManualLog'
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

  it('with a main workout already picked, claiming an other activity swaps them — and the swap reverses', () => {
    localStorage.clear()
    const run: ActualWorkout = {
      stravaId: 4242, source: 'strava', distance: 5, movingTime: 3600, elapsedTime: 3700,
      elevationGain: 120, avgHR: 142, type: 'Run', name: 'Long run', startDate: '2026-09-20T08:00:00',
    }
    const hike: ActualWorkout = {
      stravaId: 4343, source: 'strava', distance: 4.4, movingTime: 4320, elapsedTime: 4500,
      elevationGain: 900, avgHR: 137, type: 'Hike', name: 'Berkeley Hiking', startDate: '2026-09-20T11:00:00',
    }
    const week = (): TrainingWeek => ({
      num: 1, dates: 'Sep 14–20', startIso: '2026-09-14', miles: 20, focus: 'Build',
      days: [{
        day: 'Sun 9/20', type: 'long', workout: 'Long run', detail: '', zone: 'Z2', route: 'Any route', time: '60 min',
        actual: run, secondaryActuals: [hike],
      }],
    })
    const { result } = renderHook(() => useManualLog('mike'))

    // The sync picked the run; the athlete says the hike was the session.
    act(() => result.current.logWorkout('Sun 9/20', hike, '2026-09-20'))
    let [w] = result.current.applyLogsToWeeks([week()])
    expect(w.days[0].actual).toEqual(hike)                       // as recorded, not merged over the run
    expect(w.days[0].secondaryActuals?.map(s => s.name)).toEqual(['Long run']) // the run steps down, still visible

    // Vice versa: pick the run back from the list.
    act(() => result.current.logWorkout('Sun 9/20', run, '2026-09-20'))
    ;[w] = result.current.applyLogsToWeeks([week()])
    expect(w.days[0].actual?.name).toBe('Long run')
    expect(w.days[0].secondaryActuals?.map(s => s.name)).toEqual(['Berkeley Hiking'])
  })

  it('a claimed activity the sync no longer lists shows as recorded — never merged over the sync\'s pick', () => {
    localStorage.clear()
    const run: ActualWorkout = {
      stravaId: 4242, garminId: 9, source: 'garmin', distance: 5, movingTime: 3600, elapsedTime: 3700,
      elevationGain: 120, avgHR: 142, epoc: 80, hrZoneSummary: [{ zone: 2, seconds: 3000 }],
      type: 'Run', name: 'Long run', startDate: '2026-09-20T08:00:00',
    }
    const hike: ActualWorkout = {
      stravaId: 4343, source: 'strava', distance: 4.4, movingTime: 4320, elapsedTime: 4500,
      elevationGain: 900, avgHR: 137, type: 'Hike', name: 'Berkeley Hiking', startDate: '2026-09-20T11:00:00',
    }
    const week: TrainingWeek = {
      num: 1, dates: 'Sep 14–20', startIso: '2026-09-14', miles: 20, focus: 'Build',
      days: [{ day: 'Sun 9/20', type: 'long', workout: 'Long run', detail: '', zone: 'Z2', route: 'Any route', time: '60 min', actual: run }],
    }
    const { result } = renderHook(() => useManualLog('mike'))
    act(() => result.current.logWorkout('Sun 9/20', hike, '2026-09-20')) // the hike was deleted on Strava since
    const [w] = result.current.applyLogsToWeeks([week])
    expect(w.days[0].actual).toEqual(hike)
    expect(w.days[0].actual?.epoc).toBeUndefined()
    expect(w.days[0].actual?.garminId).toBeUndefined()
    expect(w.days[0].secondaryActuals?.map(s => s.name)).toEqual(['Long run'])
  })

  it('the live synced copy wins the swap, with the entry\'s edits layered on', () => {
    localStorage.clear()
    const run: ActualWorkout = {
      stravaId: 4242, source: 'strava', distance: 5, movingTime: 3600, elapsedTime: 3700,
      elevationGain: 120, type: 'Run', name: 'Long run', startDate: '2026-09-20T08:00:00',
    }
    const hike: ActualWorkout = {
      stravaId: 4343, source: 'strava', distance: 4.4, movingTime: 4320, elapsedTime: 4500,
      elevationGain: 900, avgHR: 137, type: 'Hike', name: 'Berkeley Hiking', startDate: '2026-09-20T11:00:00',
    }
    const week: TrainingWeek = {
      num: 1, dates: 'Sep 14–20', startIso: '2026-09-14', miles: 20, focus: 'Build',
      days: [{
        day: 'Sun 9/20', type: 'long', workout: 'Long run', detail: '', zone: 'Z2', route: 'Any route', time: '60 min',
        actual: run, secondaryActuals: [{ ...hike, name: 'Berkeley Hiking — renamed', maxHR: 171 }],
      }],
    }
    const { result } = renderHook(() => useManualLog('mike'))
    // The athlete edited the claimed hike's time and wrote a note.
    act(() => result.current.logWorkout('Sun 9/20', { ...hike, movingTime: 4000, notes: 'steep' }, '2026-09-20'))
    const [w] = result.current.applyLogsToWeeks([week])
    expect(w.days[0].actual).toMatchObject({ name: 'Berkeley Hiking', maxHR: 171, movingTime: 4000, notes: 'steep' })
  })

  it('claimEntry carries the day\'s notes, RPE and strength log across the swap', () => {
    const prev: ActualWorkout = {
      stravaId: 4242, source: 'strava', distance: 5, movingTime: 3600, elapsedTime: 3700, elevationGain: 120,
      type: 'Run', name: 'Long run', startDate: '2026-09-20T08:00:00', notes: 'felt great, new shoes', rpe: 6,
      strengthLog: [{ name: 'Plank', focus: 'core', sets: [{ reps: 45, weight: 'BW' }] }],
    }
    const hike: ActualWorkout = {
      stravaId: 4343, source: 'strava', distance: 4.4, movingTime: 4320, elapsedTime: 4500,
      elevationGain: 900, type: 'Hike', name: 'Berkeley Hiking', startDate: '2026-09-20T11:00:00',
    }
    const entry = claimEntry(hike, prev)
    expect(entry).toMatchObject({ stravaId: 4343, name: 'Berkeley Hiking', notes: 'felt great, new shoes', rpe: 6 })
    expect(entry.strengthLog).toEqual(prev.strengthLog)
    // The activity's own fields are never overwritten by the old entry's.
    expect(entry.movingTime).toBe(4320)
    expect(claimEntry(hike, undefined)).toEqual(hike)
  })

  it('Apple activities swap and de-dup by their workout id', () => {
    localStorage.clear()
    const appleRun: ActualWorkout = {
      stravaId: 0, appleId: 'A-1', source: 'apple', distance: 3, movingTime: 1800, elapsedTime: 1800,
      elevationGain: 0, type: 'running', name: 'Outdoor Run', startDate: '2026-09-07T08:00:00',
    }
    const appleWalk: ActualWorkout = {
      stravaId: 0, appleId: 'A-2', source: 'apple', distance: 1, movingTime: 1200, elapsedTime: 1200,
      elevationGain: 0, type: 'walking', name: 'Walk', startDate: '2026-09-07T18:00:00',
    }
    const week: TrainingWeek = {
      num: 1, dates: 'Sep 7–13', startIso: '2026-09-07', miles: 20, focus: 'Build',
      days: [{ day: 'Mon 9/7', type: 'quality', workout: 'Intervals', detail: '', zone: 'Z4', route: 'Track', time: '40 min', secondaryActuals: [appleRun, appleWalk] }],
    }
    const { result } = renderHook(() => useManualLog('mike'))
    act(() => result.current.logWorkout('Mon 9/7', appleWalk, '2026-09-07'))
    const [w] = result.current.applyLogsToWeeks([week])
    expect(w.days[0].actual?.appleId).toBe('A-2')
    expect(w.days[0].secondaryActuals?.map(s => s.appleId)).toEqual(['A-1'])
  })

  it('editing the synced main workout still merges onto it and leaves the other activities alone', () => {
    localStorage.clear()
    const run: ActualWorkout = {
      stravaId: 4242, garminId: 9, source: 'garmin', distance: 5, movingTime: 3600, elapsedTime: 3700,
      elevationGain: 120, avgHR: 142, epoc: 80, type: 'Run', name: 'Long run', startDate: '2026-09-20T08:00:00',
    }
    const week: TrainingWeek = {
      num: 1, dates: 'Sep 14–20', startIso: '2026-09-14', miles: 20, focus: 'Build',
      days: [{
        day: 'Sun 9/20', type: 'long', workout: 'Long run', detail: '', zone: 'Z2', route: 'Any route', time: '60 min',
        actual: run, secondaryActuals: [walk()],
      }],
    }
    const { result } = renderHook(() => useManualLog('mike'))
    // ManualLog keeps the existing stravaId and layers notes/RPE on top.
    act(() => result.current.logWorkout('Sun 9/20', { ...run, garminId: undefined, source: 'manual', rpe: 7, notes: 'legs heavy' }, '2026-09-20'))
    const [w] = result.current.applyLogsToWeeks([week])
    expect(w.days[0].actual).toMatchObject({ garminId: 9, source: 'garmin', epoc: 80, rpe: 7, notes: 'legs heavy' })
    expect(w.days[0].secondaryActuals?.map(s => s.garminId)).toEqual([777])
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

  it('once the day has a main workout, each other activity offers to become it instead', () => {
    localStorage.clear()
    const onClaim = vi.fn()
    const day: PlannedDay = {
      day: 'Mon 9/7', type: 'quality', workout: 'Intervals', detail: '', zone: 'Z4', route: 'Track', time: '40 min',
      actual: { ...erg(), garminId: 999, name: 'Matched run', type: 'Run' },
      secondaryActuals: [erg(), walk()],
    }
    render(<WorkoutModal {...base} day={day} onClaimSecondary={onClaim} />)
    expect(screen.getByText(/The Run session above is your main workout/)).toBeTruthy()
    expect(screen.getAllByText('Make this my main workout')).toHaveLength(2)
    fireEvent.click(screen.getByTestId('claim-secondary-1'))
    expect(onClaim.mock.calls[0][0].garminId).toBe(777)
  })

  it('without a claim handler, the list is read-only', () => {
    localStorage.clear()
    const day: PlannedDay = {
      day: 'Mon 9/7', type: 'quality', workout: 'Intervals', detail: '', zone: 'Z4', route: 'Track', time: '40 min',
      actual: { ...erg(), garminId: 999, name: 'Matched run' },
      secondaryActuals: [erg()],
    }
    render(<WorkoutModal {...base} day={day} />)
    expect(screen.queryByTestId('claim-secondary-0')).toBeNull()
  })
})
