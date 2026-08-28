import { describe, it, expect } from 'vitest'
import { formatSeconds } from '../utils/format'

describe('formatSeconds', () => {
  it('keeps seconds visible on short efforts — a 3:34 TT is not "3 min"', () => {
    expect(formatSeconds(214)).toBe('3:34')
    expect(formatSeconds(545)).toBe('9:05')
  })
  it('longer durations stay coarse', () => {
    expect(formatSeconds(2700)).toBe('45 min')
    expect(formatSeconds(3900)).toBe('1:05')
  })
})
