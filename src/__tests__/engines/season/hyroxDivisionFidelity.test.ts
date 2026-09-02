/**
 * P3.1 — a Hyrox race that is NOT the anchor carries its own division into
 * the spliced block's generation. v1 spread the anchor config (division
 * undefined → Open) so every Pro athlete's second race was built at Open
 * loads, with no UI path to declare otherwise.
 */
import { describe, it, expect } from 'vitest'
import { generatePlanFromMethod } from '../../../engines/planGenerator/generatePlan'
import { planSeason } from '../../../engines/season/planSeason'
import { spliceSeasonWeeks } from '../../../engines/season/spliceSeason'
import { seasonRaceId } from '../../../engines/season'
import { normalizeSeasonConfig } from '../../../utils/seasonConfig'
import { getMethodById } from '../../../data/methods'
import type { OnboardingConfig } from '../../../hooks/useOnboarding'
import type { RaceInfo } from '../../../types'

const TODAY = '2026-08-16'

function seasonConfig(sex?: 'male' | 'female'): OnboardingConfig {
  return {
    raceType: 'road',
    raceName: 'Flat City 10k',
    raceDate: '2026-09-13',
    raceDistance: '10k',
    experienceLevel: 'intermediate',
    trainingDaysPerWeek: 5,
    longRunDay: 'Sunday',
    wearable: 'garmin',
    athleteName: 'Mike',
    age: 45,
    maxHR: 200,
    sex,
    fitnessAnchor: { type: 'easy_pace', valueSeconds: 9 * 60 + 30 },
    goalMode: 'season',
    anchorIsPrimary: false,
    equipmentAccess: ['gym'],
    additionalRaces: [{
      name: 'Hyrox Dallas', date: '2026-12-12', priority: 'A', isPrimary: true,
      format: 'hyrox', integration: 'sequential', hyroxDivision: 'pro',
    }],
    completedAt: '',
  }
}

function spliced(cfg: OnboardingConfig) {
  const normalized = { ...normalizeSeasonConfig(cfg), selectedMethodId: 'roche_swap' }
  const base = generatePlanFromMethod(getMethodById('roche_swap')!, normalized, TODAY)
  const races = [
    { id: seasonRaceId(base.race), priority: 'B' as const, status: 'upcoming' as const, isPrimary: false, raceInfo: base.race },
    ...normalized.additionalRaces!.map(r => {
      const raceInfo: RaceInfo = {
        name: r.name, date: r.date, startTime: '', distance: 'Hyrox', distanceMiles: 8,
        elevation: '', elevationRange: '', course: '', cutoff: '', landmarks: [], gear: [], nutrition: '',
        format: r.format, hyroxDivision: r.hyroxDivision,
      }
      return { id: seasonRaceId(raceInfo), priority: r.priority, status: 'upcoming' as const, isPrimary: r.isPrimary, raceInfo }
    }),
  ]
  const season = planSeason(races, TODAY)
  return spliceSeasonWeeks(base.weeks, season, normalized, TODAY)
}

describe('P3.1 — a non-anchor Hyrox generates from its own division', () => {
  it('a Pro second race carries Pro loads in its spliced block', () => {
    const weeks = spliced(seasonConfig('male'))
    const hyroxText = weeks
      .filter(w => /Hyrox Dallas/i.test(w.focus))
      .flatMap(w => w.days.map(d => d.detail))
      .join('\n')
    expect(hyroxText.length).toBeGreaterThan(0)
    expect(hyroxText).toContain('202 kg')
    expect(hyroxText).not.toContain('152 kg')
  })

  it("a female athlete's second race carries the women's loads for that division", () => {
    const weeks = spliced(seasonConfig('female'))
    const hyroxText = weeks
      .filter(w => /Hyrox Dallas/i.test(w.focus))
      .flatMap(w => w.days.map(d => d.detail))
      .join('\n')
    // Women's Pro sled push is 152 kg; the men's Pro 202 kg must not appear.
    expect(hyroxText).toContain('152 kg')
    expect(hyroxText).not.toContain('202 kg')
  })
})
