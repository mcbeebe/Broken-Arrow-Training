import { describe, it, expect } from 'vitest'
import { mergeAppleHealth, mergeAppleActivities, type AppleActivity } from '../utils/apple'
import { mergeAppleActivitiesIntoWeeks } from '../utils/matching'
import type { GarminHealthData, TrainingWeek } from '../types'

describe('mergeAppleHealth', () => {
  it('keeps history, lets incoming win on a shared date, sorts newest first', () => {
    const existing: GarminHealthData[] = [
      { date: '2026-06-26', rhr: 50 },
      { date: '2026-06-25', rhr: 51 },
    ]
    const incoming: GarminHealthData[] = [
      { date: '2026-06-27', rhr: 49 },
      { date: '2026-06-26', rhr: 48 }, // updates the existing 6/26 entry
    ]
    const merged = mergeAppleHealth(existing, incoming)
    expect(merged.map(d => d.date)).toEqual(['2026-06-27', '2026-06-26', '2026-06-25'])
    expect(merged.find(d => d.date === '2026-06-26')?.rhr).toBe(48)
  })
})

describe('mergeAppleActivities', () => {
  const mk = (appleId: string, date: string, durationMinutes = 30): AppleActivity => ({
    date, appleId, activityId: 1, type: 'running', name: 'Run', durationMinutes, elevationGainFt: 0,
  })
  it('dedups by HKWorkout UUID, incoming wins, newest first', () => {
    const existing = [mk('A', '2026-06-25'), mk('B', '2026-06-26', 30)]
    const incoming = [mk('B', '2026-06-26', 45), mk('C', '2026-06-27')]
    const merged = mergeAppleActivities(existing, incoming)
    expect(merged.map(a => a.appleId)).toEqual(['C', 'B', 'A'])
    expect(merged.find(a => a.appleId === 'B')?.durationMinutes).toBe(45)
  })
})

describe('mergeAppleActivitiesIntoWeeks', () => {
  const week = (actual?: object): TrainingWeek[] => [{
    weekNum: 1,
    phase: 'Base',
    days: [{ day: 'Mon 6/22', type: 'run', workout: '4 mi easy', detail: '', ...(actual ? { actual } : {}) }],
  } as unknown as TrainingWeek]

  const apple = (durationMinutes: number): AppleActivity => ({
    date: '2026-06-22', appleId: 'X', activityId: 1, type: 'running', name: 'Run',
    durationMinutes, avgHR: 150, distanceMi: 4, elevationGainFt: 200,
  })

  it('attaches an Apple workout to an empty plan day', () => {
    const out = mergeAppleActivitiesIntoWeeks(week(), [apple(35)])
    expect(out[0].days[0].actual?.source).toBe('apple')
    expect(out[0].days[0].actual?.distance).toBe(4)
  })

  it('never overwrites a day that already has an actual (Garmin/Strava win)', () => {
    const out = mergeAppleActivitiesIntoWeeks(week({ source: 'garmin', distance: 4.2 }), [apple(35)])
    expect(out[0].days[0].actual?.source).toBe('garmin')
  })

  it('ignores sub-2-minute stub workouts', () => {
    const out = mergeAppleActivitiesIntoWeeks(week(), [apple(1)])
    expect(out[0].days[0].actual).toBeUndefined()
  })
})
