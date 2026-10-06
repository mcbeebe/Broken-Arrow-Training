/**
 * G10 attribution, moved out of src/main.tsx so the landing entry and the
 * app share one implementation: first touch wins and is never overwritten.
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { REFERRAL_KEY, recordReferralSource } from '../../landing/referral'

afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('recordReferralSource', () => {
  it('uses the key the app has always used', () => {
    expect(REFERRAL_KEY).toBe('ba_referral_source_v1')
  })

  it('records the first ?from= with a timestamp, in the existing JSON shape', () => {
    recordReferralSource('?from=tool-heat', 1234)
    expect(JSON.parse(localStorage.getItem(REFERRAL_KEY)!)).toEqual({ from: 'tool-heat', at: 1234 })
  })

  it('first touch wins and is never overwritten', () => {
    recordReferralSource('?from=tool-heat', 1)
    recordReferralSource('?from=tool-fueling', 2)
    expect(JSON.parse(localStorage.getItem(REFERRAL_KEY)!)).toEqual({ from: 'tool-heat', at: 1 })
  })

  it('does nothing without ?from=', () => {
    recordReferralSource('?view=today', 1)
    recordReferralSource('', 1)
    recordReferralSource('?from=', 1)
    expect(localStorage.getItem(REFERRAL_KEY)).toBeNull()
  })

  it('survives a localStorage that throws on read', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    expect(() => recordReferralSource('?from=tool-heat', 1)).not.toThrow()
  })

  it('survives a localStorage that throws on write', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    expect(() => recordReferralSource('?from=tool-heat', 1)).not.toThrow()
  })

  it('defaults the timestamp to now', () => {
    vi.spyOn(Date, 'now').mockReturnValue(42)
    recordReferralSource('?from=tool-predictor')
    expect(JSON.parse(localStorage.getItem(REFERRAL_KEY)!).at).toBe(42)
  })
})
