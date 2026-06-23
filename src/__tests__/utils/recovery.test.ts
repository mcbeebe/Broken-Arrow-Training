/**
 * R5 (PR-5) — post-race recovery formulas.
 */
import { describe, it, expect } from 'vitest'
import { postRaceRecovery, recoverySummaryLine } from '../../utils/recovery'

describe('postRaceRecovery', () => {
  it('gives 1 rest day per 10 miles raced', () => {
    expect(postRaceRecovery(100).restDays).toBe(10)
    expect(postRaceRecovery(26.2).restDays).toBe(3)
  })
  it('uses 1 day per 10 km for high-vert races', () => {
    expect(postRaceRecovery(100, { highVert: true }).restDays).toBeGreaterThan(postRaceRecovery(100).restDays)
  })
  it('adds an extra sleep hour for ≈ miles/10 nights, ≥10 after a 100', () => {
    expect(postRaceRecovery(100).sleepExtraHrPerNight).toBe(1)
    expect(postRaceRecovery(100).sleepExtraNights).toBe(10)
    expect(postRaceRecovery(50).sleepExtraNights).toBe(5)
  })
})

describe('recoverySummaryLine (coach)', () => {
  it('gives concrete numbers + a deload framing for a long race', () => {
    const line = recoverySummaryLine(100)!
    expect(line).toMatch(/10 days off/)
    expect(line).toMatch(/reverse taper/i)
    expect(line).toMatch(/deload/i)
  })
  it('is null for short races', () => {
    expect(recoverySummaryLine(6.2)).toBeNull()
  })
})
