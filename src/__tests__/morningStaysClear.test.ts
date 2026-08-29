/**
 * The structural half of P8: admin is not merely discouraged in the
 * morning, it cannot render there. Every proposal surface is gated on the
 * evening phase, so "the morning is for the next hour" is enforced by the
 * code rather than by remembering.
 */
import { describe, it, expect } from 'vitest'

const APP = Object.values(import.meta.glob('../App.tsx', {
  query: '?raw', import: 'default', eager: true,
}))[0] as string

const GATED = [
  'benchAssessment.qualifies',
  'recalAssessment.qualifies',
  'mimCalibration.pendingSuggestions.length > 0',
  'domsCalibration.pendingSuggestions.length > 0',
]

describe('proposals wait for the close', () => {
  for (const surface of GATED) {
    it(`gates ${surface} on the evening phase`, () => {
      const line = APP.split('\n').find(l => l.includes(surface) && l.trim().startsWith('{'))
      expect(line, `no render guard found for ${surface}`).toBeTruthy()
      expect(line).toContain("todayPhase === 'evening'")
    })
  }

  it('offers the count in the morning instead, as one line', () => {
    // Held back, not hidden: the athlete still knows something is waiting,
    // and can go to it — it simply does not interrupt the morning.
    expect(APP).toMatch(/data-testid="ledger-row"/)
    expect(APP).toMatch(/todayPhase === 'morning' && notesWaiting > 0/)
    expect(APP).toMatch(/at your close/)
  })
})
