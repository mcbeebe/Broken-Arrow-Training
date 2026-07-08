import { describe, it, expect } from 'vitest'
import type { RaceInfo, SeasonRace } from '../../../types'
import { planSeason } from '../../../engines/season/planSeason'
import { buildSeasonContext } from '../../../engines/season/coachContext'

function race(over: Partial<RaceInfo>): RaceInfo {
  return {
    name: 'Race', date: '2026-08-02', startTime: '', distance: 'Half Marathon',
    distanceMiles: 13.1, elevation: '', elevationRange: '', course: '', cutoff: '',
    landmarks: [], gear: [], nutrition: '', ...over,
  }
}

function sr(id: string, priority: SeasonRace['priority'], info: Partial<RaceInfo>): SeasonRace {
  return { id, priority, raceInfo: race(info), status: 'upcoming' }
}

const THREE = [
  sr('half', 'A', { name: 'Summer Half', date: '2026-08-02' }),
  sr('hyrox', 'A', { name: 'Hyrox SF', date: '2026-10-03', distance: 'Hyrox', distanceMiles: 8 }),
  sr('marathon', 'A', { name: 'Fall Marathon', date: '2026-12-06', distanceMiles: 26.2 }),
]

describe('buildSeasonContext (G1b — the SEASON coach section)', () => {
  it('narrates the calendar, current block purpose, and days to the next race', () => {
    const result = planSeason(THREE, '2026-06-22')
    // Mid-build toward the half.
    const ctx = buildSeasonContext(result, '2026-07-01')!
    expect(ctx).toContain('Season calendar:')
    expect(ctx).toContain('Summer Half (A, 2026-08-02)')
    expect(ctx).toContain('BUILD toward Summer Half')
    expect(ctx).toContain('Next race: Summer Half in 32 days')
  })

  it('narrates a BRIDGE with the residual rationale toward Hyrox', () => {
    const result = planSeason(THREE, '2026-06-22')
    const bridge = result.season.blocks.find(b => b.kind === 'BRIDGE')!
    const ctx = buildSeasonContext(result, bridge.startDate)!
    expect(ctx).toContain('BRIDGE toward Hyrox SF')
    expect(ctx).toContain('aerobic base')
  })

  it('narrates RECOVER as "recovery IS the training"', () => {
    const result = planSeason(THREE, '2026-06-22')
    const recover = result.season.blocks.find(b => b.kind === 'RECOVER')!
    const ctx = buildSeasonContext(result, recover.startDate)!
    expect(ctx).toContain('RECOVER after Summer Half')
    expect(ctx).toContain('recovery')
  })

  it('carries season advisories into the narration', () => {
    const result = planSeason(THREE, '2026-06-22') // 3 A races → honesty advisory
    const ctx = buildSeasonContext(result, '2026-07-01')!
    expect(ctx).toContain('Season advisories:')
    expect(ctx).toContain('A races')
  })

  it('GUARD: a single-race season narrates nothing', () => {
    const result = planSeason([THREE[0]], '2026-06-22')
    expect(buildSeasonContext(result, '2026-07-01')).toBeNull()
  })
})
