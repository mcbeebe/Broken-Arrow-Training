import { describe, it, expect } from 'vitest'
import {
  sorenessTrendDirection,
  checkEscalatingSoreness,
  checkInjuryRisk,
} from '../utils/readiness'
import { classifyDamage } from '../utils/trainingSignals'

// Soreness adjustments keyed off today's local date, index 0 = today,
// index 1 = yesterday, etc. (newest-first), matching how the readiness
// engine walks the recent window.
function sorenessMap(adjustmentsNewestFirst: number[]): Map<string, number> {
  const map = new Map<string, number>()
  const today = new Date()
  for (let i = 0; i < adjustmentsNewestFirst.length; i++) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    map.set(`${y}-${m}-${day}`, adjustmentsNewestFirst[i])
  }
  return map
}

describe('sorenessTrendDirection', () => {
  it('returns flat for fewer than two points', () => {
    expect(sorenessTrendDirection([])).toBe('flat')
    expect(sorenessTrendDirection([40])).toBe('flat')
  })

  it('reads a declining series (oldest→newest) as falling', () => {
    expect(sorenessTrendDirection([65, 40, 20])).toBe('falling')
  })

  it('reads a climbing series as rising', () => {
    expect(sorenessTrendDirection([20, 40, 65])).toBe('rising')
  })

  it('treats a steady series as flat', () => {
    expect(sorenessTrendDirection([40, 40, 40])).toBe('flat')
  })
})

describe('checkEscalatingSoreness — direction', () => {
  it('marks elevated-but-easing soreness as falling, not trending', () => {
    // Newest-first: today the least sore, two days ago the most.
    const sore = checkEscalatingSoreness(sorenessMap([20, 40, 65]))
    expect(sore.direction).toBe('falling')
    expect(sore.trending).toBe(false)
    // Still elevated on 3/3 reported days, so the legacy escalating flag
    // remains true — direction is what tells callers it's recovering.
    expect(sore.elevatedDays).toBe(3)
  })

  it('marks climbing soreness as rising and trending', () => {
    const sore = checkEscalatingSoreness(sorenessMap([65, 40, 20]))
    expect(sore.direction).toBe('rising')
    expect(sore.trending).toBe(true)
  })
})

describe('checkInjuryRisk — easing soreness is not flagged as escalating', () => {
  it('suppresses the escalating-soreness flag when soreness is falling', () => {
    const flags = checkInjuryRisk([], [], sorenessMap([20, 40, 65]))
    expect(flags.find(f => f.id === 'escalating_soreness')).toBeUndefined()
  })

  it('still raises the flag when soreness is climbing', () => {
    const flags = checkInjuryRisk([], [], sorenessMap([65, 40, 20]))
    expect(flags.find(f => f.id === 'escalating_soreness')).toBeDefined()
  })
})

describe('classifyDamage — easing soreness is not elevated', () => {
  it('caps falling-but-sore at mild rather than elevated/escalating', () => {
    const reading = classifyDamage(sorenessMap([20, 40, 65]))
    expect(reading.state).toBe('mild')
    expect(reading.severity).toBe(1)
  })

  it('classifies climbing high soreness as escalating', () => {
    const reading = classifyDamage(sorenessMap([65, 40, 35]))
    expect(reading.state).toBe('escalating')
  })
})
