import { describe, it, expect } from 'vitest'
import { getZoneForHR, parseZoneRange, isInTargetZone, getSportHRZoneOffset, adjustZoneStringForSport } from '../utils/zones'
import { mikePlan } from '../data'

const zones = mikePlan.zones

describe('getZoneForHR', () => {
  it('returns Z1 for HR in recovery range', () => {
    const zone = getZoneForHR(115, zones)
    expect(zone).not.toBeNull()
    expect(zone!.zone).toContain('Z1')
  })

  it('returns Z2 for HR in aerobic range', () => {
    const zone = getZoneForHR(135, zones)
    expect(zone).not.toBeNull()
    expect(zone!.zone).toContain('Z2')
  })

  it('returns Z3 for HR in tempo range', () => {
    const zone = getZoneForHR(155, zones)
    expect(zone).not.toBeNull()
    expect(zone!.zone).toContain('Z3')
  })

  it('returns Z4 for HR in threshold range', () => {
    const zone = getZoneForHR(170, zones)
    expect(zone).not.toBeNull()
    expect(zone!.zone).toContain('Z4')
  })

  it('returns null for HR outside all zones', () => {
    expect(getZoneForHR(50, zones)).toBeNull()
    expect(getZoneForHR(200, zones)).toBeNull()
  })

  it('returns zone at exact boundary', () => {
    const zone = getZoneForHR(128, zones)
    expect(zone).not.toBeNull()
  })
})

describe('parseZoneRange', () => {
  it('parses HR range string with en-dash', () => {
    const result = parseZoneRange('108–128')
    expect(result).toEqual({ low: 108, high: 128 })
  })

  it('parses HR range string with hyphen', () => {
    const result = parseZoneRange('108-128')
    expect(result).toEqual({ low: 108, high: 128 })
  })

  it('returns null for non-range string', () => {
    expect(parseZoneRange('—')).toBeNull()
  })
})

describe('isInTargetZone', () => {
  it('returns true when HR is in range', () => {
    expect(isInTargetZone(135, 128, 148)).toBe(true)
  })

  it('returns true at boundaries', () => {
    expect(isInTargetZone(128, 128, 148)).toBe(true)
    expect(isInTargetZone(148, 128, 148)).toBe(true)
  })

  it('returns false when HR is below range', () => {
    expect(isInTargetZone(100, 128, 148)).toBe(false)
  })

  it('returns false when HR is above range', () => {
    expect(isInTargetZone(160, 128, 148)).toBe(false)
  })
})

describe('getSportHRZoneOffset', () => {
  it('returns 0 for running', () => {
    expect(getSportHRZoneOffset('running')).toBe(0)
    expect(getSportHRZoneOffset('trail_running')).toBe(0)
  })

  it('returns 10 for cycling-class sports', () => {
    expect(getSportHRZoneOffset('cycling')).toBe(10)
    expect(getSportHRZoneOffset('mountain_biking')).toBe(10)
    expect(getSportHRZoneOffset('ebike')).toBe(10)
  })

  it('returns 12 for swimming', () => {
    expect(getSportHRZoneOffset('swimming')).toBe(12)
    expect(getSportHRZoneOffset('lap_swimming')).toBe(12)
  })

  it('returns 0 for unknown / undefined', () => {
    expect(getSportHRZoneOffset(undefined)).toBe(0)
    expect(getSportHRZoneOffset('strength_full')).toBe(0)
  })
})

describe('adjustZoneStringForSport', () => {
  it('shifts the parenthesized HR range down for cycling', () => {
    expect(adjustZoneStringForSport('4.0 mi · Z4 (167–177)', 'cycling'))
      .toBe('4.0 mi · Z4 (157–167)')
  })

  it('preserves dash character (en-dash vs hyphen)', () => {
    expect(adjustZoneStringForSport('Z2 (128-148)', 'cycling')).toBe('Z2 (118-138)')
    expect(adjustZoneStringForSport('Z2 (128–148)', 'cycling')).toBe('Z2 (118–138)')
  })

  it('returns the input unchanged for running', () => {
    const s = '4.0 mi · Z4 (167–177)'
    expect(adjustZoneStringForSport(s, 'running')).toBe(s)
  })

  it('returns the input unchanged when no range is present', () => {
    expect(adjustZoneStringForSport('—', 'cycling')).toBe('—')
    expect(adjustZoneStringForSport('Z1', 'cycling')).toBe('Z1')
  })
})
