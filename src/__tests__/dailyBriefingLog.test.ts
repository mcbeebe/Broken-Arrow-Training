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
  it('maps hours to the same buckets dayPeriod() uses', () => {
    expect(periodForTs(tsAtHour(5))).toBe('evening')   // pre-dawn wraps to evening
    expect(periodForTs(tsAtHour(6))).toBe('morning')
    expect(periodForTs(tsAtHour(12))).toBe('morning')
    expect(periodForTs(tsAtHour(13))).toBe('afternoon')
    expect(periodForTs(tsAtHour(19))).toBe('afternoon')
    expect(periodForTs(tsAtHour(20))).toBe('evening')
    expect(periodForTs(tsAtHour(23))).toBe('evening')
  })
})

describe('mergeBriefing', () => {
  it('appends a new period and keeps morning→afternoon→evening order', () => {
    let log: BriefingLogEntry[] = []
    log = mergeBriefing(log, entry('afternoon', 14))
    log = mergeBriefing(log, entry('morning', 7))
    log = mergeBriefing(log, entry('evening', 21))
    expect(log.map(e => e.period)).toEqual(['morning', 'afternoon', 'evening'])
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
    const log = [entry('morning', 7), entry('afternoon', 14)]
    // Live read is the afternoon one → only morning is "prior".
    expect(priorBriefings(log, insight(14)).map(e => e.period)).toEqual(['morning'])
  })

  it('returns nothing when the live insight is the earliest period', () => {
    const log = [entry('morning', 7)]
    expect(priorBriefings(log, insight(7))).toEqual([])
  })

  it('returns the whole log when there is no live insight', () => {
    const log = [entry('morning', 7), entry('afternoon', 14)]
    expect(priorBriefings(log, null)).toEqual(log)
  })

  it('surfaces morning + afternoon once the evening read is live', () => {
    const log = [entry('morning', 7), entry('afternoon', 14), entry('evening', 21)]
    expect(priorBriefings(log, insight(21)).map(e => e.period)).toEqual(['morning', 'afternoon'])
  })
})
