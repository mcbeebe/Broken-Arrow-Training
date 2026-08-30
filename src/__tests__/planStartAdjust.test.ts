/**
 * Plan-start adjustment — the non-destructive week re-pin behind Settings →
 * Plan Start. Fixes the "off by a week after a mid-block redo" without a
 * second re-onboard.
 */
import { describe, it, expect } from 'vitest'
import { shiftIsoByWeeks, mondayOnOrBefore } from '../utils/planDates'

describe('shiftIsoByWeeks', () => {
  it('moves a whole number of weeks, staying on the same weekday', () => {
    expect(shiftIsoByWeeks('2026-08-31', -1)).toBe('2026-08-24') // Mon → prior Mon
    expect(shiftIsoByWeeks('2026-08-31', 1)).toBe('2026-09-07')
    expect(shiftIsoByWeeks('2026-08-31', 0)).toBe('2026-08-31')
  })

  it('crosses month and year boundaries cleanly', () => {
    expect(shiftIsoByWeeks('2026-01-04', -1)).toBe('2025-12-28')
    expect(shiftIsoByWeeks('2026-12-28', 1)).toBe('2027-01-04')
  })

  it('is noon-anchored, so a shift never slips a day', () => {
    // Two shifts of -1 equal one shift of -2, with no drift.
    expect(shiftIsoByWeeks(shiftIsoByWeeks('2026-08-31', -1), -1)).toBe(shiftIsoByWeeks('2026-08-31', -2))
  })

  it('composes with mondayOnOrBefore so any picked date lands on a Monday', () => {
    // Picking a Wednesday and snapping gives that week's Monday.
    expect(mondayOnOrBefore('2026-08-26')).toBe('2026-08-24') // Wed → Mon
    // Then a week earlier is the prior Monday.
    expect(shiftIsoByWeeks(mondayOnOrBefore('2026-08-26'), -1)).toBe('2026-08-17')
  })
})
