import { describe, it, expect } from 'vitest'
import type { OnboardingConfig } from '../../hooks/useOnboarding'
import type { ImportedPlanV1 } from '../../utils/planImport/types'
import {
  buildImportedConfig, defaultStart, startForWeek, weekOfDate, IMPORT_FIELD_RULES,
} from '../../utils/planImport/buildImportedConfig'
import { importedToTrainingPlan } from '../../utils/planImport/toTrainingPlan'
import { isoDayOfWeek, weekNumContaining } from '../../utils/planDates'

/**
 * Initiative 004, PR 5: the config an uploaded plan is saved as. The athlete
 * stays the same; the old plan's race, method and reshapes go.
 */

const marathonBase: OnboardingConfig = {
  raceType: 'road', raceName: 'Spring Marathon', raceDate: '2027-04-18',
  raceDistance: 'marathon', raceDistanceMiles: 26.2, elevationGainFt: 900,
  raceDescription: 'Hilly second half', athleteGoal: 'Sub 3:30', goalRaceTimeSeconds: 12600,
  selectedMethodId: 'pfitz', weekReshapes: [{ fromWeek: 4, shape: { 1: 'rest', 2: 'run', 3: 'quality', 4: 'run', 5: 'rest', 6: 'run', 7: 'long' }, at: 1 }],
  planStartDate: '2026-09-07', planStartPinnedIso: '2026-09-07',
  experienceLevel: 'intermediate', trainingDaysPerWeek: 5, wearable: 'garmin',
  athleteName: 'Mike', age: 42, maxHR: 181, sex: 'male', ftpWatts: 250,
  injuryStatus: 'none', equipmentAccess: ['gym'],
  additionalRaces: [{ name: 'Fall Half', date: '2026-11-01', priority: 'B', format: 'road' }],
  hyroxDivision: 'pro', weakStation: 'sled_push', goalMode: 'season',
  valuePropsSeenAt: '2026-09-01T00:00:00Z', connectStepSeenAt: '2026-09-01T00:00:00Z',
  welcomeLetterSeenAt: '2026-09-01T00:00:00Z', primerSeenAt: '2026-09-01T00:00:00Z',
  completedAt: '2026-09-01T00:00:00.000Z',
} as OnboardingConfig

const tenK = (sport: ImportedPlanV1['sport'] = 'road'): ImportedPlanV1 => ({
  v: 1,
  source: { name: 'Club 10K block.pdf', kind: 'pdf', importedAt: '2026-10-09T12:00:00.000Z' },
  title: 'Club 10K block',
  sport,
  raceDistance: '10K',
  weeks: Array.from({ length: 6 }, (_, i) => ({
    focus: `Block week ${i + 1}`,
    sessions: [
      { day: 2, type: 'run', title: 'Easy', distanceMi: 4 },
      { day: 4, type: 'quality', title: 'Intervals', detail: '6 x 800 m' },
      { day: 7, type: 'long', title: 'Long run', distanceMi: 7 + i },
    ],
  })),
})

const CHOICES = { startIso: '2026-10-14', raceName: 'Turkey Trot 10K', raceDate: '2026-11-22' }

describe('buildImportedConfig', () => {
  it('sets the plan, its race and its start, on a Monday', () => {
    const cfg = buildImportedConfig(marathonBase, tenK(), CHOICES)
    expect(cfg.importedPlan).toEqual(tenK())
    expect(cfg.raceType).toBe('road')
    expect(cfg.raceName).toBe('Turkey Trot 10K')
    expect(cfg.raceDate).toBe('2026-11-22')
    expect(cfg.planStartPinnedIso).toBe('2026-10-12')
    expect(isoDayOfWeek(cfg.planStartPinnedIso!)).toBe(1)
  })

  it('clears what described the old plan', () => {
    const cfg = buildImportedConfig(marathonBase, tenK(), CHOICES)
    for (const field of ['raceDistance', 'raceDistanceMiles', 'elevationGainFt', 'raceDescription', 'athleteGoal',
      'goalRaceTimeSeconds', 'selectedMethodId', 'weekReshapes', 'planStartDate'] as const) {
      expect(cfg, field).not.toHaveProperty(field)
    }
  })

  it('keeps the athlete, their season and the screens they have seen', () => {
    const cfg = buildImportedConfig(marathonBase, tenK(), CHOICES)
    for (const field of ['athleteName', 'age', 'maxHR', 'sex', 'ftpWatts', 'wearable', 'experienceLevel', 'injuryStatus',
      'equipmentAccess', 'additionalRaces', 'hyroxDivision', 'weakStation', 'goalMode', 'trainingDaysPerWeek',
      'valuePropsSeenAt', 'connectStepSeenAt', 'welcomeLetterSeenAt', 'primerSeenAt', 'completedAt'] as const) {
      expect(cfg[field], field).toEqual(marathonBase[field])
    }
  })

  it('every rule-table field is a real field, and every rule is used as written', () => {
    const cfg = buildImportedConfig(marathonBase, tenK(), CHOICES)
    for (const [field, rule] of Object.entries(IMPORT_FIELD_RULES)) {
      if (rule === 'clear') expect(cfg, field).not.toHaveProperty(field)
      if (rule === 'keep' && field in marathonBase) expect(cfg[field as keyof OnboardingConfig], field).toEqual(marathonBase[field as keyof OnboardingConfig])
    }
  })

  it('the plan\'s sport becomes the race type', () => {
    for (const sport of ['road', 'trail', 'hyrox', 'general'] as const) {
      expect(buildImportedConfig(marathonBase, tenK(sport), CHOICES).raceType).toBe(sport)
    }
  })

  it('no race: an empty name and date, never a malformed one', () => {
    const cfg = buildImportedConfig(marathonBase, tenK(), { startIso: '2026-10-12', raceName: '  ', raceDate: '11/22' })
    expect(cfg.raceName).toBe('')
    expect(cfg.raceDate).toBe('')
  })

  it('never changes the base it was given', () => {
    const before = JSON.stringify(marathonBase)
    buildImportedConfig(marathonBase, tenK(), CHOICES)
    expect(JSON.stringify(marathonBase)).toBe(before)
  })

  it('the regression: an uploaded 10K on a marathon config reads 10K, with no old vert or goal', () => {
    const plan = importedToTrainingPlan(tenK(), buildImportedConfig(marathonBase, tenK(), CHOICES), '2026-10-14')
    expect(plan.race.distance).toBe('10K')
    expect(plan.race.distanceMiles).toBe(0)
    expect(plan.race.elevation).toBe('')
    expect(plan.race.description).toBeUndefined()
    expect(plan.race.athleteGoal).toBeUndefined()
    expect(plan.race.name).toBe('Turkey Trot 10K')
    // And the old config, for contrast, would have called it a marathon.
    expect(importedToTrainingPlan(tenK(), { ...marathonBase, importedPlan: tenK() }, '2026-10-14').race.distance).not.toBe('10K')
  })

  it('a plan with no race is named after itself', () => {
    const cfg = buildImportedConfig(marathonBase, tenK(), { startIso: '2026-10-12', raceName: '', raceDate: '' })
    expect(importedToTrainingPlan(tenK(), cfg, '2026-10-14').race.name).toBe('Club 10K block')
  })
})

describe('"I\'m already on week N"', () => {
  it.each([1, 2, 4, 6])('week %i is the week holding today, wherever today falls in the week', n => {
    for (const today of ['2026-10-12', '2026-10-15', '2026-10-18']) {
      const startIso = startForWeek(n, 6, today)
      expect(isoDayOfWeek(startIso)).toBe(1)
      const plan = importedToTrainingPlan(tenK(), { ...marathonBase, planStartPinnedIso: startIso, importedPlan: tenK() }, today)
      expect(weekNumContaining(plan.weeks, today)).toBe(n)
    }
  })

  it('is clamped to the plan', () => {
    expect(startForWeek(9, 6, '2026-10-14')).toBe(startForWeek(6, 6, '2026-10-14'))
    expect(startForWeek(0, 6, '2026-10-14')).toBe('2026-10-12')
  })
})

describe('the start the review offers first', () => {
  const today = '2026-10-14'

  it('is the plan\'s printed start, on its Monday', () => {
    expect(defaultStart({ startDate: '2026-10-21' }, 6, today)).toBe('2026-10-19')
  })

  it('is a printed start still running today', () => {
    expect(defaultStart({ startDate: '2026-09-30' }, 6, today)).toBe('2026-09-28')
  })

  it('skips a printed start so old the plan is over, and counts back from its race', () => {
    // Sunday 22 November closes the sixth week that starts Monday 12 October.
    expect(defaultStart({ startDate: '2025-01-06', raceDate: '2026-11-22' }, 6, today)).toBe('2026-10-12')
    const fromRace = defaultStart({ raceDate: '2026-11-22' }, 6, today)
    expect(weekOfDate('2026-11-22', fromRace, 6)).toEqual({ week: 6 })
  })

  it('is this week\'s Monday otherwise, never the athlete\'s old race', () => {
    expect(defaultStart({}, 6, today)).toBe('2026-10-12')
    expect(defaultStart({ raceDate: '2026-01-01' }, 6, today)).toBe('2026-10-12')
  })
})

describe('weekOfDate', () => {
  it('is strict at both ends', () => {
    expect(weekOfDate('2026-10-11', '2026-10-12', 6)).toBe('before')
    expect(weekOfDate('2026-10-12', '2026-10-12', 6)).toEqual({ week: 1 })
    expect(weekOfDate('2026-11-22', '2026-10-12', 6)).toEqual({ week: 6 })
    expect(weekOfDate('2026-11-23', '2026-10-12', 6)).toBe('after')
  })
})
