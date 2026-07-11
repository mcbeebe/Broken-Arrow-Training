import { describe, it, expect } from 'vitest'
import type { RaceInfo, SeasonRace } from '../../../types'
import { planSeason, isHyroxRace } from '../../../engines/season/planSeason'
import {
  taperTierTarget,
  residualsAtBridgeStart,
  bridgeEmphasis,
  ISSURIN_RESIDUAL_DAYS,
  TAPER_DAYS,
} from '../../../engines/season/residuals'
import { recoverWeeks, bridgeWeeks } from '../../../engines/season/blockWeeks'
import {
  expectBlockSequence,
  expectCoherentBlockDates,
  expectBlocksReferenceRaces,
} from '../../helpers/seasonAssert'

/**
 * G1a acceptance tests (docs/gap-closure-build-plan.md §3):
 * the half→Hyrox→marathon persona chains through explicit blocks, the
 * state machine is DERIVED (recomputing mid-season can never wedge), C
 * races stamp without transitions, proximity demotes B races honestly,
 * and the science constants are pinned to their sources.
 */

function race(over: Partial<RaceInfo>): RaceInfo {
  return {
    name: 'Race', date: '2026-08-02', startTime: '8:00 AM', distance: 'Half Marathon',
    distanceMiles: 13.1, elevation: '', elevationRange: '', course: '', cutoff: '',
    landmarks: [], gear: [], nutrition: '', ...over,
  }
}

function sr(id: string, priority: SeasonRace['priority'], info: Partial<RaceInfo>): SeasonRace {
  return { id, priority, raceInfo: race(info), status: 'upcoming' }
}

const TODAY = '2026-06-22'

const THREE_RACE_SEASON: SeasonRace[] = [
  sr('half', 'A', { name: 'Summer Half', date: '2026-08-02', distanceMiles: 13.1 }),
  sr('hyrox', 'A', { name: 'Hyrox SF', date: '2026-10-03', distance: 'Hyrox', distanceMiles: 8 }),
  sr('marathon', 'A', { name: 'Fall Marathon', date: '2026-12-06', distance: 'Marathon', distanceMiles: 26.2 }),
]

describe('planSeason — the half→Hyrox→marathon chain (category-first)', () => {
  const { season, advisories } = planSeason(THREE_RACE_SEASON, TODAY)

  it('derives the full state-machine grammar', () => {
    expectBlockSequence(season, [
      'BUILD', 'TAPER', 'RACE',
      'RECOVER', 'BRIDGE', 'BUILD', 'TAPER', 'RACE',
      'RECOVER', 'BRIDGE', 'BUILD', 'TAPER', 'RACE',
    ])
    expectCoherentBlockDates(season)
    expectBlocksReferenceRaces(season)
  })

  it('A races get the full 14-day taper', () => {
    const tapers = season.blocks.filter(b => b.kind === 'TAPER')
    expect(tapers).toHaveLength(3)
    for (const t of tapers.slice(1)) { // first taper can be clipped by `today`
      const days = (Date.parse(t.endDate) - Date.parse(t.startDate)) / 86_400_000 + 1
      expect(days).toBe(TAPER_DAYS.A)
    }
  })

  it('bridges carry the residual profile at their start (Issurin-quantified)', () => {
    const bridges = season.blocks.filter(b => b.kind === 'BRIDGE')
    expect(bridges).toHaveLength(2)
    for (const b of bridges) {
      expect(b.residualsCarried).toBeDefined()
      expect(b.residualsCarried!.aerobicDays).toBeGreaterThan(20) // long residual — plenty left
      expect(b.residualsCarried!.speedDays).toBeLessThanOrEqual(ISSURIN_RESIDUAL_DAYS.speed) // short residual — mostly gone
    }
  })

  it('is honest about three A races in one season (Friel doctrine)', () => {
    expect(advisories.some(a => a.id === 'season_too_many_a_races')).toBe(true)
    // But peaks are ≥8 wk apart, so no spacing advisory.
    expect(advisories.some(a => a.id.startsWith('season_peaks_too_close'))).toBe(false)
  })
})

describe('planSeason — guards and honesty', () => {
  it('GUARD: a single race derives the plain BUILD→TAPER→RACE arc — no season machinery', () => {
    const { season, advisories } = planSeason(
      [sr('solo', 'A', { name: 'Only Race', date: '2026-10-18' })], TODAY)
    expectBlockSequence(season, ['BUILD', 'TAPER', 'RACE'])
    expect(advisories).toHaveLength(0)
  })

  it('two A races 5 weeks apart → compressed build + peaks-too-close advisory', () => {
    const { season, advisories } = planSeason([
      sr('first', 'A', { name: 'First', date: '2026-08-02' }),
      sr('second', 'A', { name: 'Second', date: '2026-09-06' }), // 35 days later
    ], TODAY)
    expect(advisories.some(a => a.id === 'season_peaks_too_close_second')).toBe(true)
    // The chain still derives — compressed, never broken (no bridge fits).
    expectBlockSequence(season, ['BUILD', 'TAPER', 'RACE', 'RECOVER', 'BUILD', 'TAPER', 'RACE'])
  })

  it('C races are trained through: a RACE stamp with no transitions', () => {
    const { season } = planSeason([
      sr('goal', 'A', { name: 'Goal Race', date: '2026-10-18' }),
      sr('parkrun', 'C', { name: 'Local 5K', date: '2026-08-15', distance: '5K', distanceMiles: 3.1 }),
    ], TODAY)
    const kinds = season.blocks.map(b => b.kind)
    expect(kinds.filter(k => k === 'RACE')).toHaveLength(2)
    expect(kinds.filter(k => k === 'RECOVER')).toHaveLength(0) // the C race spawned nothing
    expect(kinds.filter(k => k === 'BRIDGE')).toHaveLength(0)
  })

  it('a B race inside the proximity window is demoted to trained-through, honestly', () => {
    const { season, advisories } = planSeason([
      sr('tuneup', 'B', { name: 'Tune-up 10K', date: '2026-10-10', distance: '10K', distanceMiles: 6.2 }),
      sr('goal', 'A', { name: 'Goal Race', date: '2026-10-18' }),
    ], TODAY)
    expect(advisories.some(a => a.id === 'b_race_proximity_tuneup')).toBe(true)
    expect(season.blocks.filter(b => b.kind === 'RECOVER')).toHaveLength(0)
  })

  it('an undated race is excluded with an advisory, never a crash', () => {
    const { season, advisories } = planSeason([
      sr('goal', 'A', { name: 'Goal Race', date: '2026-10-18' }),
      sr('mystery', 'B', { name: 'Someday Race', date: 'when I feel ready' }),
    ], TODAY)
    expect(advisories.some(a => a.id === 'season_undated_race_mystery')).toBe(true)
    expectBlockSequence(season, ['BUILD', 'TAPER', 'RACE'])
  })

  it('DERIVED STATE: recomputing mid-season after race 1 cannot wedge (the anti-Garmin test)', () => {
    // Same calendar, but "today" is a week after the half — the athlete's
    // device was off, nothing was stored. The machine simply re-derives:
    // past race stamped, and the future chain starts from today.
    const { season } = planSeason(THREE_RACE_SEASON, '2026-08-10')
    const kinds = season.blocks.map(b => b.kind)
    expect(kinds[0]).toBe('RACE') // the past half, on the record
    // Everything after today is a valid forward chain — never stuck in recovery.
    expectCoherentBlockDates(season)
    const future = season.blocks.filter(b => b.startDate >= '2026-08-10')
    expect(future.map(b => b.kind)).toEqual(
      ['BUILD', 'TAPER', 'RACE', 'RECOVER', 'BRIDGE', 'BUILD', 'TAPER', 'RACE'])
  })
})

describe('the science layer (L1 — constants pinned to sources)', () => {
  it('Friel TSB taper tiers: A +15..+25 · B −10..0 · C trained through', () => {
    expect(taperTierTarget('A')).toEqual({ tsbLow: 15, tsbHigh: 25 })
    expect(taperTierTarget('B')).toEqual({ tsbLow: -10, tsbHigh: 0 })
    expect(taperTierTarget('C')).toBeNull()
  })

  it('Issurin residual windows: 30/30/18/15/5 days', () => {
    expect(ISSURIN_RESIDUAL_DAYS).toEqual({
      aerobic: 30, maxStrength: 30, glycolytic: 18, strengthEndurance: 15, speed: 5,
    })
  })

  it('residualsAtBridgeStart decays from the race and clamps at zero', () => {
    const r = residualsAtBridgeStart(6)
    expect(r.aerobicDays).toBe(24)
    expect(r.speedDays).toBe(0)
  })

  it('detects a Hyrox race from its facts', () => {
    expect(isHyroxRace(sr('h', 'A', { name: 'HYROX San Francisco', distance: 'Hyrox' }))).toBe(true)
    expect(isHyroxRace(sr('m', 'A', { name: 'Fall Marathon' }))).toBe(false)
  })
})

describe('block week generation — RECOVER and BRIDGE content', () => {
  const recoverBlock = {
    id: 'recover_x', kind: 'RECOVER' as const, raceId: 'x',
    startDate: '2026-08-03', endDate: '2026-08-09',
  }

  it('RECOVER: R5 rest days first (with the sleep prescription), then reverse-taper easy only', () => {
    const weeks = recoverWeeks(recoverBlock, 50) // 50-miler → 5 rest days
    const days = weeks.flatMap(w => w.days)
    expect(days.slice(0, 5).every(d => d.type === 'rest')).toBe(true)
    expect(days[0].detail).toContain('Sleep +1 hr')
    // GUARD: no quality anywhere in recovery — volume before speed.
    expect(days.every(d => !/tempo|interval|threshold|stride/i.test(d.workout + d.detail))).toBe(true)
  })

  it('BRIDGE toward Hyrox: aerobic held with an intensity touch; strength-endurance + glycolytic concentrated', () => {
    const block = {
      id: 'bridge_h', kind: 'BRIDGE' as const, raceId: 'h',
      startDate: '2026-08-06', endDate: '2026-08-19', // 14 days
    }
    const days = bridgeWeeks(block, true).flatMap(w => w.days)
    const per7 = days.slice(0, 7)
    expect(per7.filter(d => d.type === 'run')).toHaveLength(2) // Hickson maintenance dose
    expect(per7.some(d => /threshold/i.test(d.detail))).toBe(true) // the intensity touch
    expect(per7.filter(d => d.type === 'strength')).toHaveLength(2) // SE + glycolytic
    expect(per7.some(d => /glycolytic/i.test(d.workout))).toBe(true)
  })

  it('BRIDGE toward a running race: exactly one weekly strength dose (Bickel) while volume rebuilds', () => {
    const block = {
      id: 'bridge_m', kind: 'BRIDGE' as const, raceId: 'm',
      startDate: '2026-10-07', endDate: '2026-10-20',
    }
    const days = bridgeWeeks(block, false).flatMap(w => w.days)
    const per7 = days.slice(0, 7)
    expect(per7.filter(d => d.type === 'strength')).toHaveLength(1) // Bickel 1×/wk
    expect(per7.filter(d => d.type === 'run' || d.type === 'long').length).toBeGreaterThanOrEqual(4)
    expect(per7.some(d => d.type === 'long')).toBe(true)
  })

  it('bridgeEmphasis explains itself in athlete language (feeds the SEASON coach section)', () => {
    expect(bridgeEmphasis(true).rationale).toContain('aerobic base')
    expect(bridgeEmphasis(false).holdDose).toContain('Bickel')
  })
})

describe('date-sanity window (the frozen-tab guard)', () => {
  it('a fat-fingered year is excluded with an advisory instead of generating years of blocks', () => {
    const { season, advisories } = planSeason([
      sr('half', 'A', { name: 'Summer Half', date: '2026-08-02' }),
      // Typo'd year — parseable, absurd. Pre-guard this produced a BUILD
      // block spanning a decade and froze the tab in the day walkers.
      sr('typo', 'A', { name: 'Hyrox LA', date: '2036-12-12', distance: 'Hyrox', distanceMiles: 8 }),
    ], TODAY)
    expect(season.blocks.every(b => b.raceId !== 'typo')).toBe(true)
    expect(advisories.some(a => a.id === 'season_date_out_of_range_typo')).toBe(true)
  })

  it('an ancient-past year is excluded the same way', () => {
    const { season, advisories } = planSeason([
      sr('half', 'A', { name: 'Summer Half', date: '2026-08-02' }),
      sr('ancient', 'C', { name: 'Turkey Trot', date: '0206-11-26' }),
    ], TODAY)
    expect(season.blocks.every(b => b.raceId !== 'ancient')).toBe(true)
    expect(advisories.some(a => a.id === 'season_date_out_of_range_ancient')).toBe(true)
  })

  it('legitimate far-out races (a marathon 9 months ahead) still plan normally', () => {
    const { season, advisories } = planSeason([
      sr('half', 'A', { name: 'Summer Half', date: '2026-08-02' }),
      sr('cim', 'A', { name: 'CIM Marathon', date: '2027-04-11', distance: 'Marathon', distanceMiles: 26.2 }),
    ], TODAY)
    expect(season.blocks.some(b => b.raceId === 'cim' && b.kind === 'RACE')).toBe(true)
    expect(advisories.some(a => a.id.startsWith('season_date_out_of_range'))).toBe(false)
  })

  it('GUARD: even a corrupt block reaching the day walkers truncates instead of freezing', () => {
    const start = Date.now()
    const weeks = bridgeWeeks({
      id: 'bridge_corrupt', kind: 'BRIDGE' as const, raceId: 'x',
      startDate: '2026-08-06', endDate: '2096-08-06', // 70 years
    }, true)
    expect(Date.now() - start).toBeLessThan(5000)
    expect(weeks.flatMap(w => w.days).length).toBeLessThanOrEqual(800)
  })
})
