/**
 * Zone contiguity (P0.6 hardening) — the same dead-band fix that closed the
 * 155–162 gap between zones, applied at the ceiling: the top zone must reach
 * maxHR so an all-out effort's HR is never unclassifiable.
 */
import { describe, it, expect } from 'vitest'
import type { HRZone } from '../../../types'
import { makeZonesContiguous } from '../../../engines/planGenerator/generatePlan'
import { getZoneForHR } from '../../../utils/zones'

const z = (zone: string, low: number, high: number): HRZone =>
  ({ zone, hr: `${low}–${high}`, pct: '', desc: '' })

describe('makeZonesContiguous — ceiling', () => {
  it('extends the top zone up to maxHR when it stops short', () => {
    const out = makeZonesContiguous([z('Z1', 110, 140), z('Z2', 141, 175)], 200)
    expect(out[out.length - 1].hr).toBe('141–200') // top band's ceiling pulled up to maxHR
    expect(out[out.length - 1].pct).toBe('71–100%') // 141/200 ≈ 71%
  })

  it('leaves no HR up to maxHR unclassifiable', () => {
    const zones = makeZonesContiguous(
      [z('Z1', 110, 140), z('Z2', 141, 160), z('Z3', 161, 175)],
      200,
    )
    for (let hr = 110; hr <= 200; hr++) {
      expect(getZoneForHR(hr, zones), `hr ${hr} should be classifiable`).not.toBeNull()
    }
    expect(getZoneForHR(200, zones)?.zone).toBe('Z3')
  })

  it('never pulls a legitimately higher ceiling down', () => {
    const out = makeZonesContiguous([z('Z1', 110, 140), z('Z2', 141, 210)], 200)
    expect(out[1].hr).toBe('141–210') // already ≥ maxHR — untouched
  })

  it('still closes an interior gap (the original 155–162 case)', () => {
    const out = makeZonesContiguous([z('Z2', 140, 154), z('Z3', 163, 180)], 200)
    expect(out[0].hr).toBe('140–162') // Z2 ceiling pulled up to Z3.low-1
  })
})
