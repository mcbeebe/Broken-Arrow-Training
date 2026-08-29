/**
 * T4 — "Not now" must not mean "never again".
 */
import { describe, it, expect } from 'vitest'
import {
  SNOOZE_DAYS, snoozeUntil, activeSnoozes, withSnooze, migrateLegacyDismissals,
} from '../utils/suggestionSnooze'

const DAY = 24 * 60 * 60 * 1000
const NOW = Date.UTC(2026, 7, 29)

describe('dismiss is a snooze', () => {
  it('silences the suggestion for 30 days, then lets it back', () => {
    const list = withSnooze([], 'rowing', NOW)
    expect(activeSnoozes(list, NOW).has('rowing')).toBe(true)
    expect(activeSnoozes(list, NOW + 29 * DAY).has('rowing')).toBe(true)
    // Day 31: the engine may ask again.
    expect(activeSnoozes(list, NOW + 31 * DAY).has('rowing')).toBe(false)
  })

  it('never blacklists — the window is finite for every sport', () => {
    let list = withSnooze([], 'rowing', NOW)
    list = withSnooze(list, 'running', NOW)
    for (const s of list) expect(s.until).toBeLessThanOrEqual(snoozeUntil(NOW))
    expect(activeSnoozes(list, NOW + (SNOOZE_DAYS + 1) * DAY).size).toBe(0)
  })

  it('re-snoozing restarts the clock rather than stacking entries', () => {
    const first = withSnooze([], 'rowing', NOW)
    const again = withSnooze(first, 'rowing', NOW + 20 * DAY)
    expect(again.filter(s => s.sport === 'rowing')).toHaveLength(1)
    expect(activeSnoozes(again, NOW + 40 * DAY).has('rowing')).toBe(true)
  })

  it('drops expired entries so the list cannot grow forever', () => {
    const old = [{ sport: 'hiking', until: NOW - DAY }]
    expect(withSnooze(old, 'rowing', NOW)).toHaveLength(1)
  })

  it('turns old permanent dismissals into snoozes that fade out', () => {
    const migrated = migrateLegacyDismissals(['rowing', 'hiking'], NOW)
    // Not resurfaced immediately — the athlete did say no once.
    expect(activeSnoozes(migrated, NOW).size).toBe(2)
    // But not forever either.
    expect(activeSnoozes(migrated, NOW + (SNOOZE_DAYS + 1) * DAY).size).toBe(0)
  })

  it('handles an empty or missing history', () => {
    expect(migrateLegacyDismissals(undefined, NOW)).toEqual([])
    expect(activeSnoozes(undefined, NOW).size).toBe(0)
  })
})

/**
 * The other half of T4: an athlete who wears an Apple Watch should never be
 * told to connect a Garmin. Empty states name both sources; the places that
 * genuinely mean Garmin (the workout push, the EPOC provenance note, the
 * Settings section) still say Garmin, because there it is the truth.
 */
describe('device copy names the right source', () => {
  const SOURCES = import.meta.glob('../components/*.tsx', {
    query: '?raw', import: 'default', eager: true,
  }) as Record<string, string>

  it('never tells an athlete to "Connect Garmin" in an empty state', () => {
    const offenders = Object.entries(SOURCES)
      .filter(([, src]) => /Connect Garmin and sync/.test(src))
      .map(([p]) => p)
    expect(offenders).toEqual([])
  })

  it('offers both sources where a watch is being asked for', () => {
    const dash = SOURCES['../components/Dashboard.tsx']
    const perf = SOURCES['../components/PerformanceChart.tsx']
    for (const src of [dash, perf]) {
      expect(src).toMatch(/Connect your watch/)
      expect(src).toMatch(/Apple/)
    }
  })
})
