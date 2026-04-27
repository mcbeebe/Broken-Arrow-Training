import { describe, it, expect } from 'vitest'

import { computeIntensityFactor } from '../utils/intensity-factor'

describe('computeIntensityFactor', () => {
  describe('power priority — NP > avgPower > HR-reserve', () => {
    it('uses normalized power / FTP when both present', () => {
      const result = computeIntensityFactor({
        normalizedPower: 220,
        avgPower: 200,
        ftp: 250,
        avgHR: 160,
        restingHR: 50,
        maxHR: 190,
      })
      expect(result).toEqual({ value: 0.88, source: 'power' })
    })

    it('falls back to avgPower / FTP when normalized power is missing', () => {
      const result = computeIntensityFactor({
        avgPower: 200,
        ftp: 250,
        avgHR: 160,
        restingHR: 50,
        maxHR: 190,
      })
      expect(result).toEqual({ value: 0.8, source: 'power' })
    })

    it('falls back to HR-reserve when no power is present', () => {
      const result = computeIntensityFactor({
        avgHR: 148,
        restingHR: 50,
        maxHR: 190,
      })
      expect(result?.source).toBe('hr_reserve')
      expect(result?.value).toBeCloseTo(0.7, 2)
    })

    it('falls back to HR-reserve when FTP is unset, even with power present', () => {
      const result = computeIntensityFactor({
        avgPower: 200,
        avgHR: 148,
        restingHR: 50,
        maxHR: 190,
      })
      expect(result?.source).toBe('hr_reserve')
    })
  })

  describe('null path — no usable input', () => {
    it('returns null with no power and no HR', () => {
      expect(computeIntensityFactor({ ftp: 250 })).toBeNull()
    })

    it('returns null when HR fields are partial', () => {
      expect(computeIntensityFactor({ avgHR: 150, restingHR: 50 })).toBeNull()
      expect(computeIntensityFactor({ avgHR: 150, maxHR: 190 })).toBeNull()
      expect(computeIntensityFactor({ restingHR: 50, maxHR: 190 })).toBeNull()
    })

    it('returns null when maxHR <= restingHR (corrupt profile)', () => {
      expect(computeIntensityFactor({ avgHR: 150, restingHR: 190, maxHR: 180 })).toBeNull()
    })

    it('treats zero/negative power as missing', () => {
      const result = computeIntensityFactor({
        avgPower: 0,
        ftp: 250,
        avgHR: 148,
        restingHR: 50,
        maxHR: 190,
      })
      expect(result?.source).toBe('hr_reserve')
    })
  })

  describe('clamping to the cycling MIM domain [0, 1.5]', () => {
    it('clamps super-threshold power efforts to 1.5', () => {
      const result = computeIntensityFactor({
        normalizedPower: 500,
        ftp: 250,
      })
      expect(result).toEqual({ value: 1.5, source: 'power' })
    })

    it('clamps HR above max (data error) to 1.5', () => {
      // Reserve = (300 - 50) / (190 - 50) = 250 / 140 ≈ 1.79 → clamps to 1.5
      const result = computeIntensityFactor({
        avgHR: 300,
        restingHR: 50,
        maxHR: 190,
      })
      expect(result?.value).toBe(1.5)
    })

    it('clamps HR below resting (cool-down sample) to 0', () => {
      const result = computeIntensityFactor({
        avgHR: 40,
        restingHR: 50,
        maxHR: 190,
      })
      expect(result?.value).toBe(0)
    })
  })

  describe('research-summary calibration anchors (v1.1 §7)', () => {
    it('Z2 endurance HR-reserve 0.7 → IF 0.7', () => {
      const result = computeIntensityFactor({
        avgHR: 148,
        restingHR: 50,
        maxHR: 190,
      })
      expect(result?.value).toBeCloseTo(0.7, 2)
    })

    it('threshold HR-reserve 1.0 → IF 1.0', () => {
      const result = computeIntensityFactor({
        avgHR: 190,
        restingHR: 50,
        maxHR: 190,
      })
      expect(result?.value).toBe(1)
    })

    it('recovery spin HR-reserve 0.5 → IF 0.5', () => {
      const result = computeIntensityFactor({
        avgHR: 120,
        restingHR: 50,
        maxHR: 190,
      })
      expect(result?.value).toBeCloseTo(0.5, 2)
    })
  })
})
