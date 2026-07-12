import { describe, it, expect } from 'vitest'
import { getWorkoutStyle } from '../utils/styles'

/**
 * Cross-day icons follow the modality — a swim day showing the cyclist
 * read as "the app forgot what I picked".
 */
describe('getWorkoutStyle cross-modality icons', () => {
  it('sniffs the modality from the workout title', () => {
    expect(getWorkoutStyle('cross', 'Cross-train · Swimming').label).toBe('🏊')
    expect(getWorkoutStyle('cross', 'Cross-train · Rowing').label).toBe('🚣')
    expect(getWorkoutStyle('cross', 'Cross-train · Hiking').label).toBe('🥾')
    expect(getWorkoutStyle('cross', 'Cross-train · Yoga / mobility').label).toBe('🧘')
    expect(getWorkoutStyle('cross', 'Cross-train · Cycling').label).toBe('🚴')
    expect(getWorkoutStyle('cross', 'Easy cross — Swimming').label).toBe('🏊')
  })

  it('defaults to the cyclist for unnamed cross days and never touches other types', () => {
    expect(getWorkoutStyle('cross', 'Station circuit (4 stations)').label).toBe('🚴')
    expect(getWorkoutStyle('cross').label).toBe('🚴')
    expect(getWorkoutStyle('run', 'Swim-adjacent run title').label).toBe('🏃')
    expect(getWorkoutStyle('long', 'Hike the ridge').label).toBe('🏔')
  })
})
