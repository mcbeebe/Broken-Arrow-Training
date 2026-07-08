import { describe, it, expect } from 'vitest'
import type { RaceInfo, Season } from '../../../types'
import {
  seasonFromSingleRace,
  seasonRaceId,
  raceDateToIso,
  parseSeason,
  sortedSeasonRaces,
  SEASON_STORAGE_KEY,
} from '../../../engines/season'
import {
  expectBlockSequence,
  expectCoherentBlockDates,
  expectBlocksReferenceRaces,
  daysBetweenIso,
} from '../../helpers/seasonAssert'

function makeRace(overrides: Partial<RaceInfo> = {}): RaceInfo {
  return {
    name: 'Broken Arrow 18K',
    date: 'Sunday, June 21, 2026',
    startTime: '8:00 AM',
    distance: '18K',
    distanceMiles: 11.2,
    elevation: '~2,700 ft gain',
    elevationRange: '6,200–8,700 ft',
    course: 'Palisades Tahoe',
    cutoff: '6 hours',
    landmarks: [],
    gear: [],
    nutrition: '',
    ...overrides,
  }
}

describe('season model (G1 foundation — PR-1)', () => {
  it('wraps a single race into the degenerate one-race season, priority A', () => {
    const season = seasonFromSingleRace(makeRace())
    expect(season.races).toHaveLength(1)
    expect(season.races[0].priority).toBe('A')
    expect(season.races[0].status).toBe('upcoming')
    expect(season.races[0].raceInfo.name).toBe('Broken Arrow 18K')
    // PR-1 ships no block decomposition — the single plan IS the arc.
    expect(season.blocks).toHaveLength(0)
  })

  it('is idempotent: same race in → same race id out (regeneration-safe)', () => {
    const a = seasonFromSingleRace(makeRace())
    const b = seasonFromSingleRace(makeRace())
    expect(a.races[0].id).toBe(b.races[0].id)
    expect(seasonRaceId(makeRace())).toBe('broken-arrow-18k_2026-06-21')
  })

  it('marks a past race completed when today is provided', () => {
    const season = seasonFromSingleRace(makeRace(), '2026-07-07')
    expect(season.races[0].status).toBe('completed')
  })

  it('parses both free-text and ISO race dates', () => {
    expect(raceDateToIso('Sunday, June 21, 2026')).toBe('2026-06-21')
    expect(raceDateToIso('2026-06-21')).toBe('2026-06-21')
    expect(raceDateToIso('someday soon')).toBeNull()
  })

  it('storage key is registered and athlete-scoped by convention', () => {
    expect(SEASON_STORAGE_KEY).toBe('ba_season_v1')
  })

  describe('parseSeason (storage/sync round-trip)', () => {
    it('accepts a valid season and rejects malformed data', () => {
      const season = seasonFromSingleRace(makeRace())
      expect(parseSeason(JSON.parse(JSON.stringify(season)))).not.toBeNull()
      expect(parseSeason(null)).toBeNull()
      expect(parseSeason({ races: 'nope', blocks: [] })).toBeNull()
      expect(parseSeason({ races: [{ id: 'x', priority: 'D', raceInfo: {} }], blocks: [] })).toBeNull()
      expect(parseSeason({
        races: [],
        blocks: [{ id: 'b', kind: 'NAP', raceId: 'x', startDate: '2026-01-01', endDate: '2026-01-02' }],
      })).toBeNull()
    })
  })

  it('sorts races by date with undated races last', () => {
    const season: Season = {
      races: [
        { id: 'later', priority: 'A', raceInfo: makeRace({ name: 'Marathon', date: '2026-11-08' }), status: 'upcoming' },
        { id: 'undated', priority: 'C', raceInfo: makeRace({ name: 'Mystery', date: 'tbd' }), status: 'upcoming' },
        { id: 'sooner', priority: 'B', raceInfo: makeRace({ name: 'Hyrox', date: '2026-09-12' }), status: 'upcoming' },
      ],
      blocks: [],
    }
    expect(sortedSeasonRaces(season).map(r => r.id)).toEqual(['sooner', 'later', 'undated'])
  })

  describe('seasonAssert harness (encodes the PR-6 grammar as specs)', () => {
    // A hand-built valid three-race chain — the shape planSeason (PR-6)
    // must produce for the half→Hyrox→marathon golden persona.
    const chained: Season = {
      races: [
        { id: 'half', priority: 'A', raceInfo: makeRace({ name: 'Half', date: '2026-08-02' }), status: 'upcoming' },
        { id: 'hyrox', priority: 'A', raceInfo: makeRace({ name: 'Hyrox', date: '2026-10-03' }), status: 'upcoming' },
      ],
      blocks: [
        { id: 'b1', kind: 'BUILD', raceId: 'half', startDate: '2026-06-22', endDate: '2026-07-19' },
        { id: 'b2', kind: 'TAPER', raceId: 'half', startDate: '2026-07-20', endDate: '2026-08-01' },
        { id: 'b3', kind: 'RACE', raceId: 'half', startDate: '2026-08-02', endDate: '2026-08-02' },
        { id: 'b4', kind: 'RECOVER', raceId: 'half', startDate: '2026-08-03', endDate: '2026-08-09' },
        { id: 'b5', kind: 'BRIDGE', raceId: 'hyrox', startDate: '2026-08-10', endDate: '2026-08-23' },
        { id: 'b6', kind: 'BUILD', raceId: 'hyrox', startDate: '2026-08-24', endDate: '2026-09-20' },
        { id: 'b7', kind: 'TAPER', raceId: 'hyrox', startDate: '2026-09-21', endDate: '2026-10-02' },
        { id: 'b8', kind: 'RACE', raceId: 'hyrox', startDate: '2026-10-03', endDate: '2026-10-03' },
      ],
    }

    it('expectBlockSequence matches the state-machine grammar', () => {
      expectBlockSequence(chained, ['BUILD', 'TAPER', 'RACE', 'RECOVER', 'BRIDGE', 'BUILD', 'TAPER', 'RACE'])
    })

    it('expectCoherentBlockDates and expectBlocksReferenceRaces hold', () => {
      expectCoherentBlockDates(chained)
      expectBlocksReferenceRaces(chained)
    })

    it('daysBetweenIso backs the ≥8-week peak-spacing rule', () => {
      expect(daysBetweenIso('2026-08-02', '2026-10-03')).toBe(62)
      expect(daysBetweenIso('2026-08-02', '2026-10-03') >= 8 * 7).toBe(true)
    })
  })
})
