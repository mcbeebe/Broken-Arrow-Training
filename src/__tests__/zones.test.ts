import { describe, it, expect } from 'vitest'
import { getZoneForHR, parseZoneRange, isInTargetZone } from '../utils/zones'
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
