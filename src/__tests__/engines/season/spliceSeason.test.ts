import { describe, it, expect } from 'vitest'
import type { RaceInfo, SeasonRace, TrainingWeek, PlannedDay } from '../../../types'
import type { OnboardingConfig } from '../../../hooks/useOnboarding'
import { planSeason } from '../../../engines/season/planSeason'
import { spliceSeasonWeeks, nearestRaceDistance } from '../../../engines/season/spliceSeason'

/**
 * G1 completion tests: the splice appends the chain after the anchor race
 * (RECOVER → BRIDGE → the next race's full generated plan) with continuous
 * week numbering — and the locked guards hold: a single-race season is
 * byte-identical, the anchor's weeks are never touched, and past blocks
 * generate nothing (derived state can't rewrite history).
 */

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

function baseWeek(num: number): TrainingWeek {
  return {
    num, dates: 'Jul 6-12', miles: 20, focus: 'Anchor build',
    days: [{ day: 'Mon 7/6', type: 'run', workout: 'Easy 4', detail: '', zone: '4 mi · Z2 (108-148)', route: '', time: '45 min' } as PlannedDay],
  }
}

const config = {
  raceType: 'trail', raceName: 'Summer Half', raceDate: '2026-08-02',
  raceDistance: 'half_marathon', experienceLevel: 'intermediate',
  trainingDaysPerWeek: 4, wearable: 'none', athleteName: 'T', age: 40,
  maxHR: 180, selectedMethodId: 'daniels', completedAt: '',
} as OnboardingConfig

const TODAY = '2026-06-22'

describe('spliceSeasonWeeks', () => {
  const anchor = sr('half', 'A', { name: 'Summer Half', date: '2026-08-02' })
  const second = sr('fall', 'A', { name: 'Fall Marathon', date: '2026-11-01', distance: 'Marathon', distanceMiles: 26.2 })

  it('GUARD: single-race season returns the base weeks byte-identical', () => {
    const result = planSeason([anchor], TODAY)
    const base = [baseWeek(1), baseWeek(2)]
    expect(spliceSeasonWeeks(base, result, config, TODAY)).toEqual(base)
  })

  it('appends RECOVER → BRIDGE → the next race’s generated plan, numbering continuously', () => {
    const result = planSeason([anchor, second], TODAY)
    const base = [baseWeek(1), baseWeek(2)]
    const spliced = spliceSeasonWeeks(base, result, config, TODAY)

    // Anchor weeks untouched, in place.
    expect(spliced.slice(0, 2)).toEqual(base)
    expect(spliced.length).toBeGreaterThan(base.length + 2)

    // Week numbering is continuous and strictly increasing.
    for (let i = 1; i < spliced.length; i++) {
      expect(spliced[i].num).toBe(spliced[i - 1].num + 1)
    }

    const focuses = spliced.map(w => w.focus)
    expect(focuses.some(f => f.includes('After Summer Half') && /recovery/i.test(f))).toBe(true)
    expect(focuses.some(f => f.includes('Toward Fall Marathon') && /Bridge/i.test(f))).toBe(true)
    // The second race's own generated plan, tagged with its name.
    expect(focuses.some(f => f.startsWith('[Fall Marathon]'))).toBe(true)
    // And it ends at (or just before) the marathon — a real build+taper.
    const marathonWeeks = spliced.filter(w => w.focus.startsWith('[Fall Marathon]'))
    expect(marathonWeeks.length).toBeGreaterThanOrEqual(6)
  })

  it('DERIVED STATE: recomputing after race 1 has passed splices only the future', () => {
    const result = planSeason([anchor, second], '2026-08-20') // half is history
    const base = [baseWeek(1)]
    const spliced = spliceSeasonWeeks(base, result, config, '2026-08-20')
    const focuses = spliced.map(w => w.focus)
    // Recovery block (8/3-8/5) is fully past — never regenerated.
    expect(focuses.some(f => /recovery/i.test(f) && f.includes('After Summer Half'))).toBe(false)
    // The marathon build still splices (it's the future).
    expect(focuses.some(f => f.startsWith('[Fall Marathon]'))).toBe(true)
  })

  it('GUARD: a config-less athlete or an undated race never breaks the anchor plan', () => {
    const result = planSeason([anchor, second], TODAY)
    const base = [baseWeek(1)]
    expect(spliceSeasonWeeks(base, result, null, TODAY)).toEqual(base)
  })

  it('nearestRaceDistance buckets miles sensibly', () => {
    expect(nearestRaceDistance(3.1)).toBe('5k')
    expect(nearestRaceDistance(13.1)).toBe('half_marathon')
    expect(nearestRaceDistance(26.2)).toBe('marathon')
    expect(nearestRaceDistance(31)).toBe('50k')
    expect(nearestRaceDistance(100)).toBe('100_mile')
  })
})

// ── Race-day guarantees for non-anchor races (field bug: the second
//    race had NO race day anywhere — TAPER/RACE blocks were silently
//    dropped by the splice) ─────────────────────────────────────────

import { parseDayToDate } from '../../../utils/planDates'
import { isHyroxRaceInfo } from '../../../engines/season/planSeason'

describe('splice race-day guarantees', () => {
  const anchor = sr('half', 'A', { name: 'Summer Half', date: '2026-08-02' })
  const second = sr('fall', 'A', { name: 'Fall Marathon', date: '2026-11-01', distance: 'Marathon', distanceMiles: 26.2 })

  it('every chained non-anchor race gets exactly one race-day card on its date', () => {
    const result = planSeason([anchor, second], TODAY)
    const spliced = spliceSeasonWeeks([baseWeek(1)], result, config, TODAY)
    const raceDays = spliced.flatMap(w => w.days)
      .filter(d => d.type === 'race' && parseDayToDate(d.day, undefined, '2026-11-01') === '2026-11-01')
    expect(raceDays).toHaveLength(1)
    expect(raceDays[0].workout).toContain('Fall Marathon')
  })

  it('a C-priority train-through race between two chained races gets a race-day stamp', () => {
    const turkey = sr('trot', 'C', { name: 'Turkey Trot', date: '2026-09-20', distance: '10K', distanceMiles: 6.2 })
    const result = planSeason([anchor, turkey, second], TODAY)
    const spliced = spliceSeasonWeeks([baseWeek(1)], result, config, TODAY)
    const trotDays = spliced.flatMap(w => w.days)
      .filter(d => d.type === 'race' && parseDayToDate(d.day, undefined, '2026-09-20') === '2026-09-20')
    expect(trotDays).toHaveLength(1)
    expect(trotDays[0].workout).toContain('Turkey Trot')
    expect(trotDays[0].detail).toMatch(/train|tired legs/i)
    // The C race spawns no recovery/build of its own — the marathon build
    // still arrives intact.
    expect(spliced.some(w => w.focus.startsWith('[Fall Marathon]'))).toBe(true)
  })

  it('no calendar date appears in two weeks across the whole splice', () => {
    const result = planSeason([anchor, second], TODAY)
    const spliced = spliceSeasonWeeks([baseWeek(1)], result, config, TODAY)
    const seen = new Map<string, number>()
    for (const w of spliced.slice(1)) { // fixture anchor week has loose dates
      for (const d of w.days) {
        const iso = parseDayToDate(d.day, w.dates, '2026-08-02')
        if (!iso) continue
        expect(seen.has(iso), `date ${iso} in week ${w.num} AND ${seen.get(iso)}`).toBe(false)
        seen.set(iso, w.num)
      }
    }
  })
})

describe('isHyroxRaceInfo — one predicate for routing AND bridge emphasis', () => {
  it('detects hyrox from name, distance, or description alone', () => {
    expect(isHyroxRaceInfo({ name: 'Hyrox Anaheim' })).toBe(true)
    expect(isHyroxRaceInfo({ name: 'Anaheim Open', distance: 'Hyrox' })).toBe(true)
    expect(isHyroxRaceInfo({ name: 'Anaheim Open', description: 'my first hyrox' })).toBe(true)
    expect(isHyroxRaceInfo({ name: 'Anaheim Open' })).toBe(false)
  })
})

describe('splice stamps week-scoped season race context (PR-2)', () => {
  const anchor = sr('half', 'A', { name: 'Summer Half', date: '2026-08-02' })
  const second = sr('fall', 'A', { name: 'Fall Marathon', date: '2026-11-01', distance: 'Marathon', distanceMiles: 26.2 })

  it('appended weeks carry the race they build toward; anchor weeks do not', () => {
    const result = planSeason([anchor, second], TODAY)
    const spliced = spliceSeasonWeeks([baseWeek(1)], result, config, TODAY)
    expect(spliced[0].seasonRace).toBeUndefined() // anchor untouched
    const appended = spliced.slice(1)
    expect(appended.length).toBeGreaterThan(0)
    for (const w of appended) {
      expect(w.seasonRace?.name).toBe('Fall Marathon')
      expect(w.seasonRace?.dateIso).toBe('2026-11-01')
    }
    // Block kinds progress RECOVER → BRIDGE → BUILD/TAPER through the chain.
    expect(appended[0].seasonRace?.blockKind).toBe('RECOVER')
    expect(appended.some(w => w.seasonRace?.blockKind === 'BUILD')).toBe(true)
  })
})

describe('explicit per-race format routes generation (no name-sniffing)', () => {
  const anchor = sr('half', 'A', { name: 'Summer Half', date: '2026-08-02' })

  it('"Anaheim Open" with format hyrox goes through the Hyrox engine', () => {
    const open = sr('open', 'A', { name: 'Anaheim Open', date: '2026-11-01', distanceMiles: 8, format: 'hyrox' })
    const result = planSeason([anchor, open], TODAY)
    const spliced = spliceSeasonWeeks([baseWeek(1)], result, config, TODAY)
    const openWeeks = spliced.filter(w => w.focus.startsWith('[Anaheim Open]'))
    expect(openWeeks.length).toBeGreaterThan(0)
    // Hyrox engine fingerprint: station work in the build.
    expect(openWeeks.some(w => w.days.some(d => /station/i.test(d.workout) || /station/i.test(d.detail)))).toBe(true)
  })

  it('a race NAMED "Hyrox tune-up" with explicit format trail is NOT routed to the Hyrox engine', () => {
    const trail = sr('tune', 'B', { name: 'Hyrox tune-up trail 10k', date: '2026-11-01', distanceMiles: 6.2, format: 'trail' })
    const result = planSeason([anchor, trail], TODAY)
    const spliced = spliceSeasonWeeks([baseWeek(1)], result, config, TODAY)
    const tuneWeeks = spliced.filter(w => w.focus.startsWith('[Hyrox tune-up trail 10k]'))
    expect(tuneWeeks.length).toBeGreaterThan(0)
    expect(tuneWeeks.some(w => w.days.some(d => /wall ball|sled|SkiErg/i.test(d.detail)))).toBe(false)
  })
})

describe('seasonRace stamp carries the race format for coaching routing', () => {
  const anchor = sr('half', 'A', { name: 'Summer Half', date: '2026-08-02' })

  it('a Hyrox block week is stamped format hyrox (explicit format)', () => {
    const open = sr('open', 'A', { name: 'Anaheim Open', date: '2026-11-01', distanceMiles: 8, format: 'hyrox' })
    const result = planSeason([anchor, open], TODAY)
    const spliced = spliceSeasonWeeks([baseWeek(1)], result, config, TODAY)
    const openWeeks = spliced.filter(w => w.seasonRace?.name === 'Anaheim Open')
    expect(openWeeks.length).toBeGreaterThan(0)
    for (const w of openWeeks) expect(w.seasonRace?.format).toBe('hyrox')
  })

  it('a name-sniffed Hyrox (no explicit format) is stamped hyrox too', () => {
    const hyrox = sr('hy', 'A', { name: 'Hyrox - Anaheim', date: '2026-11-01', distanceMiles: 8 })
    const result = planSeason([anchor, hyrox], TODAY)
    const spliced = spliceSeasonWeeks([baseWeek(1)], result, config, TODAY)
    const weeks = spliced.filter(w => w.seasonRace?.name === 'Hyrox - Anaheim')
    expect(weeks.length).toBeGreaterThan(0)
    for (const w of weeks) expect(w.seasonRace?.format).toBe('hyrox')
  })

  it('a road race week is never stamped hyrox', () => {
    const second = sr('fall', 'A', { name: 'Fall Marathon', date: '2026-11-01', distance: 'Marathon', distanceMiles: 26.2, format: 'road' })
    const result = planSeason([anchor, second], TODAY)
    const spliced = spliceSeasonWeeks([baseWeek(1)], result, config, TODAY)
    const weeks = spliced.filter(w => w.seasonRace?.name === 'Fall Marathon')
    expect(weeks.length).toBeGreaterThan(0)
    for (const w of weeks) expect(w.seasonRace?.format).toBe('road')
  })
})
