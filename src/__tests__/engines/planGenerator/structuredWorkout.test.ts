import { describe, it, expect } from 'vitest'
import type { PlannedDay, WorkoutType } from '../../../types'
import { buildGarminPayloadForDay } from '../../../engines/planGenerator/garminWorkout'
import type { StructuredWorkout } from '../../../engines/planGenerator/structuredWorkout'

/**
 * D5 refactor proof (PR-11): the Garmin payload types are now aliases of
 * the platform-neutral StructuredWorkout intermediate — so the payloads
 * must be BIT-IDENTICAL to the pre-refactor shapes. The snapshot below is
 * the pre-refactor output pinned verbatim; a future Apple WorkoutKit
 * renderer consumes the same intermediate, which is what makes a third
 * platform a renderer instead of a rewrite.
 */

function day(over: Partial<PlannedDay> & { type?: WorkoutType } = {}): PlannedDay {
  return {
    day: 'Thu 7/16',
    type: over.type ?? 'run',
    workout: over.workout ?? 'Easy Run 4mi',
    detail: over.detail ?? 'Easy aerobic effort',
    zone: over.zone ?? '4 mi · Z2 (108-148)',
    route: '', time: '45 min',
    ...over,
  }
}

describe('structuredWorkout intermediate (D5)', () => {
  it('Garmin payload is byte-identical to the pre-refactor shape (pinned snapshot)', () => {
    const payload = buildGarminPayloadForDay(day(), '2026-07-16')!
    expect(payload).toEqual({
      name: 'Easy Run 4mi',
      sport: 'running',
      scheduleDate: '2026-07-16',
      estimatedDurationSecs: 45 * 60,
      steps: [
        {
          stepType: 'interval',
          endCondition: { type: 'distance', value: Math.round(4 * 1609.344) },
          target: { type: 'heart.rate', low: 108, high: 148 },
          description: 'Easy aerobic effort',
        },
      ],
    })
  })

  it('the payload type IS the neutral intermediate (compile-time identity)', () => {
    // Assignment in both directions compiles only if the alias is exact.
    const p = buildGarminPayloadForDay(day(), '2026-07-16')!
    const neutral: StructuredWorkout = p
    const back: NonNullable<ReturnType<typeof buildGarminPayloadForDay>> = neutral
    expect(back.sport).toBe('running')
  })

  it('unpushable days still return null through the alias boundary', () => {
    expect(buildGarminPayloadForDay(day({ type: 'rest', zone: '—', workout: 'Rest' }), '2026-07-16')).toBeNull()
  })
})
