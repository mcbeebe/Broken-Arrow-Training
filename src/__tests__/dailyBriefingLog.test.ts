import { describe, it, expect } from 'vitest'
import {
  periodForTs,
  mergeBriefing,
  priorBriefings,
  type BriefingLogEntry,
} from '../hooks/useDailyBriefingLog'
import type { CoachInsight } from '../types'

// Build a timestamp for a given local hour today.
function tsAtHour(hour: number): number {
  const d = new Date()
  d.setHours(hour, 0, 0, 0)
  return d.getTime()
}

function entry(period: BriefingLogEntry['period'], hour: number, text = 'read'): BriefingLogEntry {
  return { period, generatedAt: tsAtHour(hour), text, tip: undefined }
}

describe('periodForTs', () => {
  it('splits the day into morning/evening at the boundary (default 2 PM)', () => {
    expect(periodForTs(tsAtHour(5))).toBe('morning')
    expect(periodForTs(tsAtHour(6))).toBe('morning')
    expect(periodForTs(tsAtHour(12))).toBe('morning')
    expect(periodForTs(tsAtHour(13))).toBe('morning')
    expect(periodForTs(tsAtHour(14))).toBe('evening')
    expect(periodForTs(tsAtHour(20))).toBe('evening')
    expect(periodForTs(tsAtHour(23))).toBe('evening')
  })

  it('honors a custom evening-start hour', () => {
    expect(periodForTs(tsAtHour(17), 18)).toBe('morning')
    expect(periodForTs(tsAtHour(18), 18)).toBe('evening')
    expect(periodForTs(tsAtHour(11), 12)).toBe('morning')
    expect(periodForTs(tsAtHour(12), 12)).toBe('evening')
  })
})

describe('mergeBriefing', () => {
  it('appends a new period and keeps morning→evening order', () => {
    let log: BriefingLogEntry[] = []
    log = mergeBriefing(log, entry('evening', 21))
    log = mergeBriefing(log, entry('morning', 7))
    expect(log.map(e => e.period)).toEqual(['morning', 'evening'])
  })

  it('replaces a same-period read (regenerate) instead of duplicating', () => {
    let log: BriefingLogEntry[] = [entry('morning', 7, 'first')]
    log = mergeBriefing(log, entry('morning', 9, 'regenerated'))
    expect(log).toHaveLength(1)
    expect(log[0].text).toBe('regenerated')
    expect(log[0].generatedAt).toBe(tsAtHour(9))
  })
})

describe('priorBriefings', () => {
  const insight = (hour: number): CoachInsight => ({
    text: 'live',
    generatedAt: tsAtHour(hour),
  })

  it('returns only periods earlier than the live insight', () => {
    const log = [entry('morning', 7), entry('evening', 21)]
    // Live read is the evening one → only morning is "prior".
    expect(priorBriefings(log, insight(21)).map(e => e.period)).toEqual(['morning'])
  })

  it('returns nothing when the live insight is the earliest period', () => {
    const log = [entry('morning', 7)]
    expect(priorBriefings(log, insight(7))).toEqual([])
  })

  it('returns the whole log when there is no live insight', () => {
    const log = [entry('morning', 7), entry('evening', 21)]
    expect(priorBriefings(log, null)).toEqual(log)
  })

  it('respects a custom evening-start hour when ranking the live read', () => {
    const log = [entry('morning', 9)]
    // Default boundary (2 PM): a 3 PM live read is "evening" → morning is prior.
    expect(priorBriefings(log, insight(15)).map(e => e.period)).toEqual(['morning'])
    // Custom boundary (6 PM): the same 3 PM read is still "morning" → nothing prior.
    expect(priorBriefings(log, insight(15), 18)).toEqual([])
  })
})
