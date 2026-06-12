import { describe, it, expect } from 'vitest'
import { parseTimeToSeconds } from '../utils/parseTime'

describe('parseTimeToSeconds', () => {
  describe('mm:ss form', () => {
    it('parses a 5K time', () => {
      expect(parseTimeToSeconds('21:30')).toBe(21 * 60 + 30)
    })

    it('parses single-digit minutes', () => {
      expect(parseTimeToSeconds('5:30')).toBe(5 * 60 + 30)
    })

    it('parses 0:00', () => {
      expect(parseTimeToSeconds('0:00')).toBe(0)
    })

    it('parses an easy pace string like 9:15', () => {
      expect(parseTimeToSeconds('9:15')).toBe(555)
    })

    it('treats values >59 in seconds component literally (no normalization)', () => {
      // We don't reject "1:90" — coerce to 60+90 = 150s. This matches user expectation
      // when they paste raw stopwatch text.
      expect(parseTimeToSeconds('1:90')).toBe(150)
    })
  })

  describe('hh:mm:ss form', () => {
    it('parses a half-marathon time', () => {
      expect(parseTimeToSeconds('1:45:00')).toBe(1 * 3600 + 45 * 60)
    })

    it('parses a marathon time', () => {
      expect(parseTimeToSeconds('3:30:15')).toBe(3 * 3600 + 30 * 60 + 15)
    })

    it('parses 0:00:00', () => {
      expect(parseTimeToSeconds('0:00:00')).toBe(0)
    })
  })

  describe('whitespace tolerance', () => {
    it('trims surrounding whitespace', () => {
      expect(parseTimeToSeconds('  21:30  ')).toBe(1290)
    })

    it('tolerates spaces around colons', () => {
      expect(parseTimeToSeconds('1 : 45 : 00')).toBe(6300)
    })
  })

  describe('digit-only form (no colon — mobile numeric keypad)', () => {
    it('parses 3-4 digit input as mm:ss', () => {
      expect(parseTimeToSeconds('900')).toBe(9 * 60)        // 9:00
      expect(parseTimeToSeconds('830')).toBe(8 * 60 + 30)   // 8:30
      expect(parseTimeToSeconds('1230')).toBe(12 * 60 + 30) // 12:30
    })

    it('parses 5-6 digit input as hh:mm:ss', () => {
      expect(parseTimeToSeconds('13015')).toBe(1 * 3600 + 30 * 60 + 15)
      expect(parseTimeToSeconds('33015')).toBe(3 * 3600 + 30 * 60 + 15)
    })

    it('rejects a digit-only seconds component >= 60', () => {
      expect(parseTimeToSeconds('190')).toBeUndefined()  // would be 1:90
    })

    it('still rejects 1-2 digit input as ambiguous', () => {
      expect(parseTimeToSeconds('9')).toBeUndefined()
      expect(parseTimeToSeconds('21')).toBeUndefined()
    })
  })

  describe('rejects invalid input', () => {
    it('returns undefined for empty string', () => {
      expect(parseTimeToSeconds('')).toBeUndefined()
    })

    it('returns undefined for whitespace only', () => {
      expect(parseTimeToSeconds('   ')).toBeUndefined()
    })

    it('returns undefined for a single number (no colon)', () => {
      expect(parseTimeToSeconds('21')).toBeUndefined()
    })

    it('returns undefined for non-numeric components', () => {
      expect(parseTimeToSeconds('21:ab')).toBeUndefined()
      expect(parseTimeToSeconds('aa:30')).toBeUndefined()
    })

    it('returns undefined for negative numbers', () => {
      expect(parseTimeToSeconds('-1:00')).toBeUndefined()
    })

    it('returns undefined for decimal components', () => {
      expect(parseTimeToSeconds('1.5:00')).toBeUndefined()
    })

    it('returns undefined for too many segments', () => {
      expect(parseTimeToSeconds('1:2:3:4')).toBeUndefined()
    })

    it('returns undefined for empty segments', () => {
      expect(parseTimeToSeconds(':30')).toBeUndefined()
      expect(parseTimeToSeconds('21:')).toBeUndefined()
      expect(parseTimeToSeconds('::')).toBeUndefined()
    })
  })
})
