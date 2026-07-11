import { describe, it, expect } from 'vitest'
import type { SeasonRace, TrainingWeek } from '../types'
import type { OnboardingConfig } from '../hooks/useOnboarding'
import { getMethodById } from '../data/methods'
import { generatePlanFromMethod } from '../engines/planGenerator/generatePlan'
import { planSeason } from '../engines/season/planSeason'
import { spliceSeasonWeeks, nearestRaceDistance } from '../engines/season/spliceSeason'
import { normalizeSeasonConfig } from '../utils/seasonConfig'
import { seasonRaceId } from '../engines/season'
import { dayIsoInWeek } from '../utils/planDates'

/**
 * THE field case (screenshots of 7/12): athlete entered Hyrox Anaheim
 * 12/5 as the race (their main goal), added Oakland Hills Half 10/24,
 * chose plan start Aug 3. The old pipeline anchored the plan on the
 * Hyrox (12 fixed weeks → started 9/14, August empty) and silently
 * dropped the half. After normalization the HALF anchors the plan from
 * Aug 3, and the Hyrox chains after it with its own race day.
 */

const TODAY = '2026-07-12'

const entered: OnboardingConfig = {
  raceType: 'hyrox', raceName: 'Hyrox Anaheim', raceDate: '2026-12-05',
  raceDescription: 'First Hyrox', athleteGoal: 'Strong first Hyrox',
  experienceLevel: 'intermediate', trainingDaysPerWeek: 6, longRunDay: 'Saturday',
  strengthDaysPerWeek: 1, strengthExperience: 'intermediate',
  crossTrainingModes: ['cycling'], crossTrainingDaysPerWeek: 1,
  wearable: 'garmin', athleteName: 'Mike', age: 45, maxHR: 178,
  planStartDate: '2026-08-03', goalMode: 'season', anchorIsPrimary: true,
  completedAt: '2026-07-12T00:00:00.000Z',
  additionalRaces: [
    { name: 'Oakland Hills Half Marathon', date: '2026-10-24', priority: 'B', distanceMiles: 13.1, format: 'road' },
  ],
} as unknown as OnboardingConfig

function assemble(): { weeks: TrainingWeek[]; normalized: OnboardingConfig } {
  const normalized = { ...normalizeSeasonConfig(entered), selectedMethodId: 'higdon' }
  const base = generatePlanFromMethod(getMethodById('higdon')!, normalized, TODAY)
  // Mirror useSeason's composition: anchor from the active plan + extras.
  const races: SeasonRace[] = [
    { id: seasonRaceId(base.race), priority: 'A', status: 'upcoming', isPrimary: false, raceInfo: base.race },
    ...normalized.additionalRaces!.map(r => ({
      id: seasonRaceId({ name: r.name, date: r.date } as never),
      priority: r.priority,
      status: 'upcoming' as const,
      isPrimary: r.isPrimary,
      integration: r.integration,
      raceInfo: {
        name: r.name, date: r.date, startTime: '',
        distance: r.format === 'hyrox' ? 'Hyrox' : `${r.distanceMiles} mi`,
        distanceMiles: r.distanceMiles ?? 0,
        elevation: '', elevationRange: '', course: '', cutoff: '',
        landmarks: [], gear: [], nutrition: '', description: r.description, format: r.format,
      },
    })),
  ]
  const result = planSeason(races, TODAY)
  return {
    weeks: spliceSeasonWeeks(base.weeks, { season: { races, blocks: result.season.blocks }, advisories: result.advisories }, normalized, TODAY),
    normalized,
  }
}

describe('field re-anchor: entered Hyrox 12/5 (primary) + earlier half 10/24 + start Aug 3', () => {
  const { weeks, normalized } = assemble()

  it('the HALF anchors the plan (road, half_marathon); the Hyrox keeps the main-goal flag', () => {
    expect(normalized.raceName).toBe('Oakland Hills Half Marathon')
    expect(normalized.raceType).toBe('road')
    expect(nearestRaceDistance(13.1)).toBe('half_marathon')
    expect(normalized.anchorIsPrimary).toBe(false)
    expect(normalized.additionalRaces![0]).toMatchObject({ name: 'Hyrox Anaheim', isPrimary: true, integration: 'layered' })
  })

  it('week 1 starts on the chosen start date, Aug 3 — August is no longer empty', () => {
    expect(weeks[0].startIso).toBe('2026-08-03')
  })

  it('the half has its RACE DAY card on 10/24 (the day the old pipeline showed Hyrox stations)', () => {
    const hits = weeks.flatMap(w => w.days.map(d => ({ d, w })))
      .filter(({ d, w }) => d.type === 'race' && dayIsoInWeek(d.day, w) === '2026-10-24')
    expect(hits).toHaveLength(1)
    expect(hits[0].d.workout).toContain('Oakland Hills')
  })

  it('the Hyrox chains after the half with its own race day on 12/5', () => {
    const hits = weeks.flatMap(w => w.days.map(d => ({ d, w })))
      .filter(({ d, w }) => d.type === 'race' && dayIsoInWeek(d.day, w) === '2026-12-05')
    expect(hits).toHaveLength(1)
    expect(hits[0].d.workout).toContain('Hyrox Anaheim')
  })

  it('layered Hyrox prep is woven into the half build (integration: layered)', () => {
    const anchorRegionDays = weeks
      .filter(w => w.startIso && w.startIso < '2026-10-24')
      .flatMap(w => w.days)
    expect(anchorRegionDays.some(d => /Layered toward Hyrox Anaheim/i.test(d.detail))).toBe(true)
  })

  it('no stray races: every race-typed day after the anchor is one of the two events', () => {
    const strays = weeks.flatMap(w => w.days.map(d => ({ d, w })))
      .filter(({ d }) => d.type === 'race')
      .map(({ d, w }) => dayIsoInWeek(d.day, w))
      .filter(iso => iso !== null && iso > '2026-10-24' && iso !== '2026-12-05')
    expect(strays).toEqual([])
  })
})
