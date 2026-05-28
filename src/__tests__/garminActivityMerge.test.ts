import { describe, it, expect } from 'vitest'
import { mergeGarminActivities } from '../utils/garmin'
import type { GarminActivity } from '../types'

/**
 * Regression for the "I resynced Garmin and all my previous COMPLETED data
 * disappeared" report.
 *
 * A sync only ever fetches activities inside its window, then caches the
 * result. The cache used to be REPLACED outright, so any sync that returned a
 * shorter list than the cache (a transient/partial fetch) permanently erased
 * older completed sessions — recent weeks survived, earlier weeks went to
 * zero. mergeGarminActivities makes the cache monotonic: a fetch can only add
 * or refresh activities, never drop ones the user already has.
 */

function act(overrides: Partial<GarminActivity> = {}): GarminActivity {
  return {
    date: '2026-04-15',
    activityId: 1,
    type: 'running',
    name: 'Morning Run',
    durationMinutes: 50,
    elevationGainFt: 120,
    distanceMi: 6,
    ...overrides,
  }
}

describe('mergeGarminActivities', () => {
  it('keeps older cached activities that are absent from a shorter fetch', () => {
    const cached = [
      act({ activityId: 1, date: '2026-04-15' }),
      act({ activityId: 2, date: '2026-04-22' }),
      act({ activityId: 3, date: '2026-04-29' }),
    ]
    // A partial/transient fetch returns only the most recent activity.
    const fetched = [act({ activityId: 3, date: '2026-04-29' })]

    const merged = mergeGarminActivities(cached, fetched)

    expect(merged.map(a => a.activityId).sort()).toEqual([1, 2, 3])
  })

  it('de-dupes by activityId, with the incoming (fresher) entry winning', () => {
    const cached = [act({ activityId: 7, name: 'Run', distanceMi: 5 })]
    const fetched = [act({ activityId: 7, name: 'Run', distanceMi: 6.2 })]

    const merged = mergeGarminActivities(cached, fetched)

    expect(merged).toHaveLength(1)
    expect(merged[0].distanceMi).toBe(6.2)
  })

  it('adds genuinely new activities from the fetch', () => {
    const cached = [act({ activityId: 1, date: '2026-04-15' })]
    const fetched = [act({ activityId: 9, date: '2026-05-20' })]

    const merged = mergeGarminActivities(cached, fetched)

    expect(merged.map(a => a.activityId).sort()).toEqual([1, 9])
  })

  it('falls back to a composite identity when activityId is missing', () => {
    const cached = [act({ activityId: undefined, date: '2026-04-15', name: 'Run A' })]
    const fetched = [
      act({ activityId: undefined, date: '2026-04-15', name: 'Run A' }), // same identity → dedupe
      act({ activityId: undefined, date: '2026-04-15', name: 'Run B' }), // different name → kept
    ]

    const merged = mergeGarminActivities(cached, fetched)

    expect(merged).toHaveLength(2)
    expect(merged.map(a => a.name).sort()).toEqual(['Run A', 'Run B'])
  })

  it('returns activities sorted newest-first', () => {
    const merged = mergeGarminActivities(
      [act({ activityId: 1, date: '2026-04-15' })],
      [act({ activityId: 2, date: '2026-05-01' }), act({ activityId: 3, date: '2026-03-10' })],
    )

    expect(merged.map(a => a.date)).toEqual(['2026-05-01', '2026-04-15', '2026-03-10'])
  })
})
