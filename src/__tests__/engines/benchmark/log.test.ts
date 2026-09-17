/**
 * The benchmark log: newest of each kind wins, races outrank feelings, the
 * LTHR sits beside the pace anchor, and the fields it replaces become its
 * first entries exactly once.
 */
import { describe, it, expect } from 'vitest'
import {
  deriveAnchors, latestByKind, liveEntries, seedFromExisting, entriesFromCapacity,
  isStale, isPlausible, kindsForPlan, planKindOf, type Benchmark,
} from '../../../engines/benchmark/log'
import type { OnboardingConfig } from '../../../hooks/useOnboarding'

let n = 0
function bm(kind: Benchmark['kind'], value: number, dateIso: string, extra: Partial<Benchmark> = {}): Benchmark {
  n += 1
  const unit = kind === 'lthr' ? 'bpm' : kind === 'push_ups' || kind === 'wall_balls_unbroken' ? 'reps' : kind === 'goblet_squat_8rm' ? 'lb' : kind === 'sled_push_rpe' ? 'rpe' : 'seconds'
  return { id: `b${n}`, kind, value, unit, dateIso, source: 'manual', at: 1_000 + n, ...extra }
}

describe('latestByKind', () => {
  it('picks the newest MEASURED entry, not the newest typed', () => {
    const june = bm('race_5k', 1320, '2026-06-01', { at: 9_000 }) // entered later
    const aug = bm('race_5k', 1300, '2026-08-30', { at: 5_000 })  // measured later
    expect(latestByKind([june, aug]).race_5k).toBe(aug)
  })
  it('ignores tombstones', () => {
    const a = bm('race_5k', 1300, '2026-08-30', { deleted: true })
    const b = bm('race_5k', 1320, '2026-06-01')
    expect(latestByKind([a, b]).race_5k).toBe(b)
  })
  it('liveEntries is newest-first and skips deleted', () => {
    const a = bm('race_5k', 1300, '2026-08-30')
    const b = bm('lthr', 168, '2026-07-12')
    const c = bm('plank', 90, '2026-05-01', { deleted: true })
    expect(liveEntries([b, c, a]).map(e => e.id)).toEqual([a.id, b.id])
  })
})

describe('deriveAnchors — the fields the engines already read', () => {
  it('a race is the pace anchor, with its date', () => {
    const d = deriveAnchors([bm('race_5k', 1300, '2026-08-30')])
    expect(d.fitnessAnchor).toEqual({ type: 'race_5k', valueSeconds: 1300, dateIso: '2026-08-30' })
  })
  it('a race outranks an easy pace even when the easy pace is newer', () => {
    const d = deriveAnchors([bm('easy_pace', 540, '2026-09-10'), bm('race_10k', 2700, '2026-06-01')])
    expect(d.fitnessAnchor?.type).toBe('race_10k')
  })
  it('the newest race wins among races', () => {
    const d = deriveAnchors([bm('race_hm', 6000, '2026-03-01'), bm('race_5k', 1300, '2026-08-30')])
    expect(d.fitnessAnchor?.type).toBe('race_5k')
  })
  it('an easy pace is the anchor only when no race exists', () => {
    expect(deriveAnchors([bm('easy_pace', 540, '2026-09-10')]).fitnessAnchor?.type).toBe('easy_pace')
  })
  it('a tested LTHR goes BESIDE the pace anchor, never in place of it', () => {
    const d = deriveAnchors([bm('easy_pace', 540, '2026-06-01'), bm('lthr', 168, '2026-09-10')])
    expect(d.fitnessAnchor?.type).toBe('easy_pace')
    expect(d.testedLthrBpm).toBe(168)
  })
  it('erg splits land on the Hyrox config fields', () => {
    const d = deriveAnchors([bm('ski_erg_1k', 250, '2026-09-01'), bm('row_1k', 230, '2026-09-01')])
    expect(d.skiErg1kSeconds).toBe(250)
    expect(d.row1kSeconds).toBe(230)
  })
  it('strength entries become a capacity dated by the newest of them', () => {
    const d = deriveAnchors([
      bm('push_ups', 40, '2026-08-01'),
      bm('goblet_squat_8rm', 55, '2026-09-05'),
      bm('erg_500', 105, '2026-08-20', { source: 'manual' }),
    ])
    expect(d.capacity).toEqual({ measuredAt: '2026-09-05', pushUps: 40, gobletSquatLb: 55, erg500Sec: 105, ergManual: true })
  })
  it('no strength entries → no capacity object at all', () => {
    expect(deriveAnchors([bm('race_5k', 1300, '2026-08-30')]).capacity).toBeUndefined()
  })
  it('a protocol and a custom unit ride along on any entry', () => {
    const custom = bm('other', 120, '2026-09-01', { label: 'Push-ups in 2 min', unit: 'reps', protocol: 'as many as possible in 2 minutes' })
    expect(latestByKind([custom]).other).toMatchObject({ unit: 'reps', protocol: 'as many as possible in 2 minutes' })
    expect(deriveAnchors([custom])).toEqual({})
  })
  it('coach-only kinds change nothing the engines read', () => {
    const d = deriveAnchors([bm('mile_tt', 330, '2026-09-01'), bm('other', 2890, '2026-09-01', { label: 'Murph' })])
    expect(d).toEqual({})
  })
})

describe('seedFromExisting — the old fields become the first entries', () => {
  const config = {
    raceType: 'road', completedAt: '2026-05-20T10:00:00Z',
    fitnessAnchor: { type: 'race_5k', valueSeconds: 1335, dateIso: '2026-05-02' },
    testedLthrBpm: 168, skiErg1kSeconds: 250,
  } as unknown as OnboardingConfig

  it('seeds the anchor with ITS date and the rest with onboarding\'s', () => {
    const seeded = seedFromExisting(config, null, 5_000)
    const byKind = Object.fromEntries(seeded.map(b => [b.kind, b]))
    expect(byKind.race_5k).toMatchObject({ value: 1335, dateIso: '2026-05-02', source: 'derived' })
    expect(byKind.lthr).toMatchObject({ value: 168, dateIso: '2026-05-20' })
    expect(byKind.ski_erg_1k).toMatchObject({ value: 250, dateIso: '2026-05-20' })
  })
  it('seeds the strength capacity dated when it was measured', () => {
    const seeded = seedFromExisting(null, { measuredAt: '2026-06-03', pushUps: 40, erg1kSec: 240, ergManual: true }, 5_000)
    expect(seeded.map(b => [b.kind, b.value, b.dateIso, b.source])).toEqual([
      ['push_ups', 40, '2026-06-03', 'logged'],
      ['erg_1k', 240, '2026-06-03', 'manual'],
    ])
  })
  it('round-trips: deriving from the seed reproduces the fields', () => {
    const seeded = seedFromExisting(config, { measuredAt: '2026-06-03', pushUps: 40 }, 5_000)
    const d = deriveAnchors(seeded)
    expect(d.fitnessAnchor).toEqual({ type: 'race_5k', valueSeconds: 1335, dateIso: '2026-05-02' })
    expect(d.testedLthrBpm).toBe(168)
    expect(d.skiErg1kSeconds).toBe(250)
    expect(d.capacity).toEqual({ measuredAt: '2026-06-03', pushUps: 40 })
  })
  it('ids are deterministic so two devices seeding independently union to one entry each', () => {
    const a = seedFromExisting(config, null, 1)
    const b = seedFromExisting(config, null, 2)
    expect(a.map(x => x.id)).toEqual(b.map(x => x.id))
  })
  it('an anchor of type none seeds nothing', () => {
    expect(seedFromExisting({ fitnessAnchor: { type: 'none' } } as unknown as OnboardingConfig, null, 1)).toEqual([])
  })
})

describe('entriesFromCapacity — a benchmark session writes to the log', () => {
  it('records only what differs from the log\'s current view', () => {
    const log = [bm('push_ups', 40, '2026-06-03')]
    const out = entriesFromCapacity({ measuredAt: '2026-06-03', pushUps: 40, plankSec: 90 }, log, 7_000)
    expect(out.map(b => b.kind)).toEqual(['plank'])
  })
  it('a re-test on a new date records every measured field again', () => {
    const log = [bm('push_ups', 40, '2026-06-03')]
    const out = entriesFromCapacity({ measuredAt: '2026-07-08', pushUps: 40 }, log, 7_000)
    expect(out).toHaveLength(1)
    expect(out[0].dateIso).toBe('2026-07-08')
  })
})

describe('staleness and plausibility', () => {
  it('a race anchor is stale past the generator\'s 12-week revalidation', () => {
    expect(isStale({ kind: 'race_5k', dateIso: '2026-06-01' }, '2026-09-17')).toBe(true)
    expect(isStale({ kind: 'race_5k', dateIso: '2026-08-01' }, '2026-09-17')).toBe(false)
  })
  it('a strength item is stale past the 5-week re-test clock', () => {
    expect(isStale({ kind: 'plank', dateIso: '2026-08-01' }, '2026-09-17')).toBe(true)
    expect(isStale({ kind: 'plank', dateIso: '2026-09-01' }, '2026-09-17')).toBe(false)
  })
  it('coach-only kinds never go stale', () => {
    expect(isStale({ kind: 'other', dateIso: '2020-01-01' }, '2026-09-17')).toBe(false)
  })
  it('a typo never becomes a race target', () => {
    expect(isPlausible('race_5k', 130)).toBe(false)   // 2:10 — a mile split, not a 5K
    expect(isPlausible('race_5k', 1300)).toBe(true)
    expect(isPlausible('lthr', 300)).toBe(false)
  })
  it('presets follow the plan type', () => {
    expect(kindsForPlan('hyrox')).toContain('ski_erg_1k')
    expect(kindsForPlan('road')).not.toContain('ski_erg_1k')
    expect(kindsForPlan('road')).toContain('race_marathon')
    expect(kindsForPlan('hyrox')).not.toContain('race_marathon')
    expect(planKindOf({ raceType: 'hyrox' })).toBe('hyrox')
    expect(planKindOf(null)).toBe('road')
  })
})

// ── Series: tracking one benchmark over time ───────────────────────────

import { groupBySeries, seriesKey, sameSeries, progressDirection, seriesProgress } from '../../../engines/benchmark/log'

describe('benchmark series', () => {
  const mk = (over: Partial<Benchmark> & Pick<Benchmark, 'id' | 'kind' | 'value' | 'dateIso'>): Benchmark =>
    ({ unit: 'seconds', source: 'manual', at: 1, ...over })

  it('a custom benchmark groups by its label, case- and space-insensitively; presets by kind', () => {
    expect(seriesKey({ kind: 'other', label: ' Dead  Hang ' })).toBe('other:dead hang')
    expect(seriesKey({ kind: 'race_5k', label: 'ignored' })).toBe('race_5k')
    expect(sameSeries({ kind: 'other', label: 'Murph' }, { kind: 'other', label: 'murph' })).toBe(true)
    expect(sameSeries({ kind: 'other', label: 'Murph' }, { kind: 'other', label: 'Cindy' })).toBe(false)
  })

  it('groupBySeries keeps every live entry, newest first, presets in plan order, custom series last', () => {
    const live = [
      mk({ id: 'm1', kind: 'other', label: 'Murph', value: 3000, dateIso: '2026-06-01' }),
      mk({ id: 'p1', kind: 'push_ups', unit: 'reps', value: 30, dateIso: '2026-05-01' }),
      mk({ id: 'p2', kind: 'push_ups', unit: 'reps', value: 38, dateIso: '2026-08-01' }),
      mk({ id: 'k1', kind: 'race_5k', value: 1300, dateIso: '2026-07-01' }),
      mk({ id: 'm2', kind: 'other', label: 'murph', value: 2820, dateIso: '2026-09-01' }),
      mk({ id: 'gone', kind: 'race_5k', value: 1200, dateIso: '2026-09-10', deleted: true }),
    ]
    const series = groupBySeries(live, 'general')
    expect(series.map(s => s.key)).toEqual(['race_5k', 'push_ups', 'other:murph'])
    expect(series[1].entries.map(e => e.id)).toEqual(['p2', 'p1'])
    expect(series[2].label).toBe('murph')  // the newest spelling names the series
    expect(series[2].entries.map(e => e.id)).toEqual(['m2', 'm1'])
  })

  it('progress direction: times fall, reps and loads rise, a plank rises, HR/RPE/custom times are neutral', () => {
    expect(progressDirection({ kind: 'race_5k', unit: 'seconds' })).toBe('lower')
    expect(progressDirection({ kind: 'push_ups', unit: 'reps' })).toBe('higher')
    expect(progressDirection({ kind: 'goblet_squat_8rm', unit: 'lb' })).toBe('higher')
    expect(progressDirection({ kind: 'plank', unit: 'seconds' })).toBe('higher')
    expect(progressDirection({ kind: 'lthr', unit: 'bpm' })).toBe('neutral')
    expect(progressDirection({ kind: 'sled_push_rpe', unit: 'rpe' })).toBe('neutral')
    expect(progressDirection({ kind: 'other', unit: 'seconds' })).toBe('neutral')
    expect(progressDirection({ kind: 'other', unit: 'reps' })).toBe('higher')
  })

  it('seriesProgress reports the change vs previous and since first, the best, and a verdict by direction', () => {
    const entries = [
      mk({ id: 'c', kind: 'race_5k', value: 1290, dateIso: '2026-09-01' }),
      mk({ id: 'b', kind: 'race_5k', value: 1270, dateIso: '2026-07-15' }),
      mk({ id: 'a', kind: 'race_5k', value: 1335, dateIso: '2026-05-02' }),
    ]
    const p = seriesProgress(entries)!
    expect(p.latest.id).toBe('c')
    expect(p.previous?.id).toBe('b')
    expect(p.oldest.id).toBe('a')
    expect(p.best.id).toBe('b')
    expect(p.deltaVsPrevious).toBe(20)
    expect(p.deltaSinceFirst).toBe(-45)
    expect(p.spanWeeks).toBe(17)
    expect(p.verdict).toBe('worse')

    const reps = seriesProgress([
      mk({ id: 'y', kind: 'push_ups', unit: 'reps', value: 38, dateIso: '2026-08-01' }),
      mk({ id: 'x', kind: 'push_ups', unit: 'reps', value: 30, dateIso: '2026-05-01' }),
    ])!
    expect(reps.verdict).toBe('better')
    expect(reps.best.id).toBe('y')

    const one = seriesProgress([mk({ id: 'z', kind: 'lthr', unit: 'bpm', value: 168, dateIso: '2026-08-01' })])!
    expect(one.previous).toBeNull()
    expect(one.deltaVsPrevious).toBeNull()
    expect(one.verdict).toBe('neutral')
    expect(seriesProgress([])).toBeNull()
  })
})
