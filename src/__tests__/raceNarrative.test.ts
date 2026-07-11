import { describe, it, expect } from 'vitest'
import { generateRaceNarrative } from '../utils/raceNarrative'
import type { RaceInfo, Season, SeasonRace, TrainingWeek } from '../types'

/**
 * The Plan → Race tab narrative. Field bugs: "The Half Marathon course
 * with  of climbing" (empty elevation interpolated mid-sentence), and a
 * two-race season narrated as if the anchor race were the whole story —
 * the ★ main goal never mentioned.
 */

function race(over: Partial<RaceInfo> = {}): RaceInfo {
  return {
    name: 'Oakland Hills Half Maraton', date: '2026-10-24', startTime: '', distance: 'Half Marathon',
    distanceMiles: 13.1, elevation: '', elevationRange: '', course: '', cutoff: '',
    landmarks: [], gear: [], nutrition: '', ...over,
  }
}

function weeksOf(n: number): TrainingWeek[] {
  return Array.from({ length: n }, (_, i) => ({
    num: i + 1, dates: '', miles: 20, focus: 'Foundation',
    days: [
      { day: 'Sat', type: 'long' as const, workout: 'Long run', detail: '', zone: '', route: '', time: '' },
      { day: 'Tue', type: 'quality' as const, workout: 'Aerobic + 30-30s', detail: '', zone: '', route: '', time: '' },
    ],
  }))
}

function seasonRace(name: string, date: string, over: Partial<SeasonRace> = {}): SeasonRace {
  return {
    id: name.toLowerCase().replace(/\s+/g, '-'), priority: 'B', status: 'upcoming',
    raceInfo: race({ name, date }), ...over,
  }
}

const mikeSeason: Season = {
  races: [
    seasonRace('Oakland Hills Half Maraton', '2026-10-24', { priority: 'B' }),
    seasonRace('Hyrox - Anaheim', '2026-12-05', { priority: 'A', isPrimary: true, raceInfo: race({ name: 'Hyrox - Anaheim', date: '2026-12-05', distance: 'Hyrox', distanceMiles: 8 }) }),
  ],
  blocks: [],
}

describe('elevation guards', () => {
  it('empty elevation never renders "with of climbing" or "gains across" (base + build)', () => {
    for (const weekNum of [1, 8]) { // week 1 = base, week 8 of 18 = build
      const { paragraphs } = generateRaceNarrative({ race: race(), weekNum, totalWeeks: 18, weeks: weeksOf(18) })
      const all = paragraphs.join(' ')
      expect(all).not.toMatch(/with\s+of climbing/)
      expect(all).not.toMatch(/gains\s+across/)
    }
  })

  it('a race WITH elevation keeps the climbing clause', () => {
    const { paragraphs } = generateRaceNarrative({ race: race({ elevation: '2,900 ft' }), weekNum: 1, totalWeeks: 18, weeks: weeksOf(18) })
    expect(paragraphs.join(' ')).toMatch(/with 2,900 ft of climbing/)
  })
})

describe('season paragraph', () => {
  it('names the ★ main goal with date and countdown for a two-race season', () => {
    const { paragraphs } = generateRaceNarrative({
      race: race(), weekNum: 1, totalWeeks: 12, weeks: weeksOf(12),
      season: mikeSeason, todayIso: '2026-08-03',
    })
    const all = paragraphs.join(' ')
    expect(all).toContain('Your main goal is Hyrox - Anaheim')
    expect(all).toContain('December 5')
    expect(all).toContain('124 days out') // 2026-08-03 → 2026-12-05
    // The displayed anchor race is framed as a step toward it.
    expect(all).toMatch(/double duty/)
    // The Hyrox-aware clause explains what the base buys.
    expect(all).toMatch(/8×1km of compromised running/)
  })

  it('when the displayed race IS the main goal, others become stepping stones', () => {
    const { paragraphs } = generateRaceNarrative({
      race: race({ name: 'Hyrox - Anaheim', date: '2026-12-05' }), weekNum: 1, totalWeeks: 12, weeks: weeksOf(12),
      season: mikeSeason, todayIso: '2026-08-03',
    })
    const all = paragraphs.join(' ')
    expect(all).toContain('Hyrox - Anaheim is your main goal this season')
    expect(all).toMatch(/stepping stone/)
  })

  it('absent for single-race athletes and when no season is passed', () => {
    const single: Season = { races: [mikeSeason.races[0]], blocks: [] }
    for (const season of [undefined, null, single]) {
      const { paragraphs } = generateRaceNarrative({
        race: race(), weekNum: 1, totalWeeks: 12, weeks: weeksOf(12), season, todayIso: '2026-08-03',
      })
      expect(paragraphs.join(' ')).not.toMatch(/main goal/)
    }
  })

  it('unparseable extra-race dates degrade to no season paragraph, never a crash', () => {
    const fuzzy: Season = {
      races: [mikeSeason.races[0], seasonRace('Someday Marathon', 'sometime next year')],
      blocks: [],
    }
    const { paragraphs } = generateRaceNarrative({
      race: race(), weekNum: 1, totalWeeks: 12, weeks: weeksOf(12), season: fuzzy, todayIso: '2026-08-03',
    })
    expect(paragraphs.join(' ')).not.toMatch(/main goal/)
  })
})
