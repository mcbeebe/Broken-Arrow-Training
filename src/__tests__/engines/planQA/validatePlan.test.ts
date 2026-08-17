/**
 * P1 — the plan QA gate.
 *
 * Two jobs: (1) prove each rule detects the defect class it encodes
 * (tampered-plan tests), and (2) run the validator across the golden
 * personas so CI fails before a defective plan reaches an athlete.
 * The dual-race season test intentionally asserts DETECTION of the known
 * P3 defects (identical Hyrox weeks) — when P3 lands, flip it to a
 * clean-pass assertion.
 */
import { describe, it, expect } from 'vitest'
import type { TrainingPlan, TrainingWeek, SeasonRace } from '../../../types'
import type { OnboardingConfig } from '../../../hooks/useOnboarding'
import { validatePlan, qaFindingsToAdvisories } from '../../../engines/planQA/validatePlan'
import { generatePlanFromMethod } from '../../../engines/planGenerator/generatePlan'
import { getMethodById, RECOMMENDABLE_METHODS } from '../../../data/methods'
import { planSeason } from '../../../engines/season/planSeason'
import { spliceSeasonWeeks } from '../../../engines/season/spliceSeason'
import { normalizeSeasonConfig } from '../../../utils/seasonConfig'
import { seasonRaceId } from '../../../engines/season'

const TODAY = '2026-08-16'

function config(overrides: Partial<OnboardingConfig> = {}): OnboardingConfig {
  return {
    raceType: 'trail',
    raceName: 'Test Race',
    raceDate: '2026-12-13',
    raceDistance: 'half_marathon',
    experienceLevel: 'intermediate',
    trainingDaysPerWeek: 5,
    currentWeeklyMileage: 20,
    longRunDay: 'Sunday',
    wearable: 'garmin',
    athleteName: 'Test',
    age: 40,
    maxHR: 190,
    completedAt: '',
    ...overrides,
  }
}

const errorIds = (plan: Pick<TrainingPlan, 'weeks' | 'zones' | 'race'>) =>
  validatePlan(plan).errors.map(e => e.id)

describe('golden personas pass the gate', () => {
  it('the Mike persona (Roche SWAP, trail half, 10-week runway) generates clean', () => {
    const plan = generatePlanFromMethod(getMethodById('roche_swap')!, config({
      raceName: 'Oakland Hills Trail Run',
      raceDate: '2026-10-24',
      fitnessAnchor: { type: 'easy_pace', valueSeconds: 9 * 60 + 30 },
      maxHR: 200,
      age: 45,
    }), TODAY)
    expect(errorIds(plan)).toEqual([])
  })

  it('the climby persona satisfies the vert-specificity rule', () => {
    const plan = generatePlanFromMethod(getMethodById('roche_swap')!, config({
      raceName: 'Oakland Hills Trail Run',
      raceDate: '2026-10-24',
      raceDescription: 'Trail half, 2900 ft of gain, technical footing',
      fitnessAnchor: { type: 'easy_pace', valueSeconds: 9 * 60 + 30 },
    }), TODAY)
    // The race parsed as climby → the plan must carry climbing/descent work.
    expect(plan.race.elevationGainFt).toBe(2900)
    expect(errorIds(plan)).toEqual([])
  })

  it('every recommendable method generates a clean half-marathon and marathon plan', () => {
    for (const method of RECOMMENDABLE_METHODS) {
      for (const raceDistance of ['half_marathon', 'marathon'] as const) {
        const plan = generatePlanFromMethod(method, config({ raceDistance }), TODAY)
        expect(errorIds(plan), `${method.id} / ${raceDistance}`).toEqual([])
      }
    }
  })
})

describe('each rule detects its defect class', () => {
  const cleanPlan = () => generatePlanFromMethod(getMethodById('roche_swap')!, config({
    raceDate: '2026-10-24',
    fitnessAnchor: { type: 'easy_pace', valueSeconds: 9 * 60 + 30 },
  }), TODAY)

  const tamper = (mutate: (weeks: TrainingWeek[]) => void) => {
    const plan = cleanPlan()
    const weeks = plan.weeks.map(w => ({ ...w, days: w.days.map(d => ({ ...d })) }))
    mutate(weeks)
    return { ...plan, weeks }
  }

  it('qa_duration_range: the v1 "30-90 min" placeholder is an error', () => {
    const plan = tamper(weeks => { weeks[3].days[2].time = '30-90 min' })
    expect(errorIds(plan)).toContain('qa_duration_range')
  })

  it('qa_duration_consistency: a 150-min step under a 45-min header is an error', () => {
    const plan = tamper(weeks => {
      const day = weeks[0].days.find(d => d.type === 'long')!
      day.time = '42-50 min'
      day.plannedWorkout = {
        ...day.plannedWorkout!,
        segments: day.plannedWorkout!.segments.map(s => ({
          ...s,
          duration: s.duration ? { value: 150, unit: 'min' as const } : s.duration,
        })),
      }
    })
    expect(errorIds(plan)).toContain('qa_duration_consistency')
  })

  it('qa_d1_load: a 66-80 min run the day before the race is an error', () => {
    const plan = tamper(weeks => {
      const last = weeks[weeks.length - 1]
      const raceIdx = last.days.findIndex(d => d.type === 'race')
      const before = last.days[raceIdx - 1]
      before.type = 'run'
      before.time = '66-80 min'
      delete before.plannedWorkout
    })
    expect(errorIds(plan)).toContain('qa_d1_load')
  })

  it('qa_duplicate_weeks: a repeated pair warns; 3+ clones are an error', () => {
    const pair = tamper(weeks => {
      weeks[4] = { ...weeks[4], days: weeks[1].days.map(d => ({ ...d })) }
    })
    const pairResult = validatePlan(pair)
    expect(pairResult.warnings.map(w => w.id)).toContain('qa_duplicate_weeks')
    expect(pairResult.errors.map(e => e.id)).not.toContain('qa_duplicate_weeks')

    // Clone onto build weeks — cutback weeks are excluded from the rule.
    const block = tamper(weeks => {
      weeks[3] = { ...weeks[3], days: weeks[1].days.map(d => ({ ...d })) }
      weeks[4] = { ...weeks[4], days: weeks[1].days.map(d => ({ ...d })) }
    })
    expect(errorIds(block)).toContain('qa_duplicate_weeks')
  })

  it('qa_rest_day: a week with no rest day is an error', () => {
    const plan = tamper(weeks => {
      for (const d of weeks[1].days) {
        if (d.type === 'rest') { d.type = 'run'; d.workout = 'Easy run'; d.time = '40-50 min' }
      }
    })
    expect(errorIds(plan)).toContain('qa_rest_day')
  })

  it('qa_taper_monotonic: a taper week bigger than its predecessor is an error', () => {
    const plan = tamper(weeks => {
      const t = weeks.findIndex(w => /taper/i.test(w.focus))
      weeks[t] = { ...weeks[t], miles: Number(weeks[t - 1].miles) + 8 }
    })
    expect(errorIds(plan)).toContain('qa_taper_monotonic')
  })

  it('qa_zone_gaps: the v1 155-162 bpm dead band is an error', () => {
    const plan = cleanPlan()
    const zones = plan.zones.map(z => ({ ...z }))
    zones[2] = { ...zones[2], hr: '144–155' }
    zones[3] = { ...zones[3], hr: '162–176' }
    expect(validatePlan({ ...plan, zones }).errors.map(e => e.id)).toContain('qa_zone_gaps')
  })

  it('qa_vert_specificity: a mountain race with a flat plan is an error', () => {
    const plan = cleanPlan()
    // Strip vert content and stamp the real race profile (13.3 mi / 2900 ft).
    const weeks = plan.weeks.map(w => ({
      ...w,
      days: w.days.map(d => ({
        ...d,
        detail: d.detail.replace(/vert|downhill|descen[dt]|power.?hik\w*|~?\d+ ft gain/gi, ''),
        workout: d.workout.replace(/downhill|descent/gi, 'run'),
      })),
    }))
    const race = { ...plan.race, elevationGainFt: 2900, distanceMiles: 13.3 }
    expect(validatePlan({ weeks, zones: plan.zones, race }).errors.map(e => e.id))
      .toContain('qa_vert_specificity')
  })

  it('aggregates findings into one advisory per rule id, errors as critical', () => {
    const plan = tamper(weeks => {
      weeks[2].days[1].time = '30-90 min'
      weeks[3].days[2].time = '30-95 min'
    })
    const advisories = qaFindingsToAdvisories(validatePlan(plan))
    const ranges = advisories.filter(a => a.id === 'qa_duration_range')
    expect(ranges).toHaveLength(1)
    expect(ranges[0].severity).toBe('critical')
    expect(ranges[0].detail).toContain('more like this')
  })
})

describe('dual-race season (P3 flipped this to a clean-pass assertion)', () => {
  it('the spliced Hyrox block no longer clones weeks', () => {
    const entered = config({
      raceType: 'hyrox',
      raceName: 'Hyrox Anaheim',
      raceDate: '2026-12-05',
      trainingDaysPerWeek: 6,
      planStartDate: '2026-08-17',
      goalMode: 'season',
      anchorIsPrimary: true,
      additionalRaces: [
        { name: 'Oakland Hills Trail Run', date: '2026-10-24', priority: 'B', distanceMiles: 13.1, format: 'trail' },
      ],
    } as unknown as Partial<OnboardingConfig>) as OnboardingConfig & { additionalRaces: NonNullable<OnboardingConfig['additionalRaces']> }

    const normalized = { ...normalizeSeasonConfig(entered), selectedMethodId: 'roche_swap' }
    const base = generatePlanFromMethod(getMethodById('roche_swap')!, normalized, TODAY)
    const races: SeasonRace[] = [
      { id: seasonRaceId(base.race), priority: 'A', status: 'upcoming', isPrimary: false, raceInfo: base.race },
      ...normalized.additionalRaces!.map(r => ({
        id: seasonRaceId({ name: r.name, date: r.date } as never),
        priority: r.priority,
        status: 'upcoming' as const,
        isPrimary: r.isPrimary,
        raceInfo: {
          name: r.name, date: r.date, startTime: '',
          distance: r.format === 'hyrox' ? 'Hyrox' : `${r.distanceMiles} mi`,
          distanceMiles: r.distanceMiles ?? 0,
          elevation: '', elevationRange: '', course: '', cutoff: '',
          landmarks: [], gear: [], nutrition: '', description: r.description, format: r.format,
        },
      })),
    ]
    const season = planSeason(races, TODAY)
    const weeks = spliceSeasonWeeks(base.weeks, season, normalized, TODAY)
    const result = validatePlan({ weeks })
    // P3 shipped continuous progression (volumes, reps, and station
    // fractions key on the week index) plus key-session overlays — the
    // pre-P3 assertion here DETECTED the byte-identical Hyrox weeks;
    // now the gate must find none.
    expect(result.findings.map(f => f.id)).not.toContain('qa_duplicate_weeks')
  })
})
