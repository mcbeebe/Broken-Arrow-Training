import { describe, it, expect } from 'vitest'
import { formatDuration, importedToTrainingPlan, weekMiles } from '../../utils/planImport/toTrainingPlan'
import type { ImportedPlanV1, ImportedSession } from '../../utils/planImport/types'
import type { OnboardingConfig } from '../../hooks/useOnboarding'
import { parseDistance, parseDuration, parseHRRange } from '../../utils/targets'
import { rezoneWeeks } from '../../utils/rezone'
import { dayIsoInWeek, addDays } from '../../utils/planDates'
import { validatePlan } from '../../engines/planQA/validatePlan'
import { formatWeekMilesChip, formatWeekMilesHeader, getMilesNumber } from '../../utils/format'
import type { HRZone } from '../../types'

const config = {
  raceType: 'road',
  raceName: '',
  raceDate: '',
  experienceLevel: 'intermediate',
  trainingDaysPerWeek: 5,
  wearable: 'garmin',
  athleteName: 'Sam',
  age: 40,
  maxHR: 180,
  planStartPinnedIso: '2026-10-12',
  completedAt: '2026-10-08T12:00:00.000Z',
} as OnboardingConfig

function plan(weeks: ImportedSession[][], overrides: Partial<ImportedPlanV1> = {}): ImportedPlanV1 {
  return {
    v: 1,
    source: { name: 'plan.pdf', kind: 'pdf', importedAt: '2026-10-08T12:00:00.000Z' },
    title: 'Spring Marathon Plan',
    sport: 'road',
    weeks: weeks.map((sessions, i) => ({ focus: `Week ${i + 1} focus`, sessions })),
    ...overrides,
  }
}

const weekOne: ImportedSession[] = [
  { day: 2, type: 'run', title: 'Easy run', detail: 'Conversational pace', distanceMi: 6, intensity: 'easy', durationMin: 60 },
  { day: 3, type: 'strength', title: 'Strength', durationMin: 30 },
  { day: 4, type: 'quality', title: 'Tempo', detail: '4 mi at tempo', distanceMi: 7, intensity: 'tempo' },
  { day: 6, type: 'run', title: 'Easy run', distanceMi: 5 },
  { day: 7, type: 'long', title: 'Long run', distanceMi: 14, durationMin: 130 },
]

describe('importedToTrainingPlan — dates', () => {
  it('starts week 1 on the pinned Monday and stamps every week seven days apart', () => {
    const tp = importedToTrainingPlan(plan([weekOne, weekOne, weekOne]), config)
    expect(tp.weeks.map(w => w.startIso)).toEqual(['2026-10-12', '2026-10-19', '2026-10-26'])
    expect(tp.weeks.map(w => w.num)).toEqual([1, 2, 3])
    expect(tp.weeks[0].dates).toBe('Oct 12–18')
    expect(tp.weeks[2].dates).toBe('Oct 26–Nov 1')
  })

  it('labels seven days Monday to Sunday and fills days with no session as rest', () => {
    const tp = importedToTrainingPlan(plan([weekOne]), config)
    const days = tp.weeks[0].days
    expect(days.map(d => d.day)).toEqual(['Mon 10/12', 'Tue 10/13', 'Wed 10/14', 'Thu 10/15', 'Fri 10/16', 'Sat 10/17', 'Sun 10/18'])
    expect(days[0]).toMatchObject({ type: 'rest', workout: 'Rest', zone: '—', time: '—' })
    expect(days[4].type).toBe('rest')
    expect(days[6]).toMatchObject({ type: 'long', workout: 'Long run' })
  })

  it('snaps a start that is not a Monday back to its Monday', () => {
    const tp = importedToTrainingPlan(plan([weekOne]), { ...config, planStartPinnedIso: '2026-10-15' })
    expect(tp.weeks[0].startIso).toBe('2026-10-12')
  })

  it("uses this week's Monday when no start is pinned yet", () => {
    const tp = importedToTrainingPlan(plan([weekOne]), { ...config, planStartPinnedIso: undefined }, '2026-10-08')
    expect(tp.weeks[0].startIso).toBe('2026-10-05')
  })

  it('crosses the new year with the right labels and year', () => {
    const tp = importedToTrainingPlan(plan([weekOne, weekOne]), { ...config, planStartPinnedIso: '2026-12-28' })
    expect(tp.weeks[0].days.map(d => d.day)).toEqual(['Mon 12/28', 'Tue 12/29', 'Wed 12/30', 'Thu 12/31', 'Fri 1/1', 'Sat 1/2', 'Sun 1/3'])
    expect(tp.weeks[0].dates).toBe('Dec 28–Jan 3')
    expect(tp.weeks[1].startIso).toBe('2027-01-04')
    expect(dayIsoInWeek(tp.weeks[0].days[4].day, tp.weeks[0])).toBe('2027-01-01')
  })

  it('resolves every day label to a date inside its own week', () => {
    const tp = importedToTrainingPlan(plan(Array.from({ length: 20 }, () => weekOne)), { ...config, planStartPinnedIso: '2026-11-30' })
    for (const week of tp.weeks) {
      week.days.forEach((d, i) => {
        expect(dayIsoInWeek(d.day, week)).toBe(addDays(week.startIso!, i))
      })
    }
  })
})

describe('importedToTrainingPlan — day strings the app parses', () => {
  const tp = importedToTrainingPlan(plan([weekOne]), config)
  const [, easy, strength, tempo, , saturday, long] = tp.weeks[0].days
  const zoneHr = (n: number) => tp.zones[n - 1].hr.split('–').map(Number)

  it('writes distance and the effort band in the zone string', () => {
    expect(parseDistance(easy.zone)).toBe(6)
    expect(easy.zone).toBe(`6.0 mi · Z1–2 (${zoneHr(1)[0]}–${zoneHr(2)[1]})`)
    expect(parseHRRange(easy.zone)).toEqual({ low: zoneHr(1)[0], high: zoneHr(2)[1] })
    expect(tempo.zone).toBe(`7.0 mi · Z3 (${zoneHr(3)[0]}–${zoneHr(3)[1]})`)
  })

  it('writes distance alone when the plan names no effort, and a dash when it names neither', () => {
    expect(saturday.zone).toBe('5.0 mi')
    expect(parseHRRange(saturday.zone)).toBeUndefined()
    expect(strength.zone).toBe('—')
  })

  it('writes durations the duration parser reads back', () => {
    expect(easy.time).toBe('1 hr')
    expect(strength.time).toBe('30 min')
    expect(long.time).toBe('2 hr 10 min')
    expect(parseDuration(long.time)).toBe(130)
    expect(tempo.time).toBe('—')
  })

  it('keeps the plan wording as the title and detail', () => {
    expect(easy).toMatchObject({ workout: 'Easy run', detail: 'Conversational pace', route: '' })
    expect(saturday.detail).toBe('—')
  })

  it('marks the detail of every day the plan wrote as the plan’s own words', () => {
    const fromPlan = [easy, strength, tempo, saturday, long]
    expect(fromPlan.every(d => d.verbatimDetail)).toBe(true)
  })

  it('rezones its bands to the athlete’s own zones and leaves the distance alone', () => {
    const custom: HRZone[] = [
      { zone: 'Z1', hr: '100–120', pct: '', desc: '' },
      { zone: 'Z2', hr: '121–140', pct: '', desc: '' },
      { zone: 'Z3', hr: '141–160', pct: '', desc: '' },
      { zone: 'Z4', hr: '161–180', pct: '', desc: '' },
    ]
    const [rezoned] = rezoneWeeks(tp.weeks, custom)
    expect(rezoned.days[1].zone).toBe('6.0 mi · Z1–2 (100–140)')
    expect(rezoned.days[3].zone).toBe('7.0 mi · Z3 (141–160)')
  })

  it('never rewrites the heart rates the plan itself wrote', () => {
    const own = '3 × 10 min Z3 (152-160), stay under LTHR (165)'
    const withOwnHr = importedToTrainingPlan(plan([[{ day: 4, type: 'quality', title: 'Threshold', detail: own, distanceMi: 8, intensity: 'tempo' }]]), config)
    const custom: HRZone[] = [
      { zone: 'Z1', hr: '100–120', pct: '', desc: '' },
      { zone: 'Z2', hr: '121–140', pct: '', desc: '' },
      { zone: 'Z3', hr: '141–160', pct: '', desc: '' },
      { zone: 'Z4', hr: '161–180', pct: '', desc: '' },
    ]
    const thu = rezoneWeeks(withOwnHr.weeks, custom)[0].days[3]
    expect(thu.detail).toBe(own)
    expect(thu.zone).toBe('8.0 mi · Z3 (141–160)')
  })

  it('counts only running distance toward the week’s miles', () => {
    const withBike = [...weekOne, { day: 1, type: 'cross' as const, title: 'Bike', distanceMi: 20 }]
    expect(importedToTrainingPlan(plan([weekOne]), config).weeks[0].miles).toBe(32)
    expect(importedToTrainingPlan(plan([withBike]), config).weeks[0].miles).toBe(32)
  })

  it('writes no number when the plan gives its running in minutes, so nothing reads minutes as miles', () => {
    const byTime = [
      { day: 2, type: 'run' as const, title: 'Easy', durationMin: 45 },
      { day: 7, type: 'long' as const, title: 'Long', durationMin: 120 },
    ]
    const mixed = [
      { day: 2, type: 'run' as const, title: 'Easy', durationMin: 40 },
      { day: 7, type: 'long' as const, title: 'Long', distanceMi: 12 },
    ]
    const cases: [string, ReturnType<typeof weekMiles>][] = [
      ['By time', weekMiles(byTime)],
      ['Miles + time', weekMiles(mixed)],
      ['No running', weekMiles([{ day: 1, type: 'strength', title: 'Gym', durationMin: 45 }])],
      ['Rest', weekMiles([])],
      ['Rest', weekMiles([{ day: 1, type: 'rest', title: 'Rest' }])],
    ]
    for (const [label, miles] of cases) {
      expect(miles).toBe(label)
      // Every consumer reads 0 as "no mileage target", and the header shows the label.
      expect(getMilesNumber(miles)).toBe(0)
      expect(formatWeekMilesChip(miles)).toBe(label)
      expect(formatWeekMilesHeader(miles)).toBe(label)
    }
    const empty = importedToTrainingPlan(plan([[]]), config)
    expect(empty.weeks[0].days.every(d => d.type === 'rest')).toBe(true)
  })
})

describe('importedToTrainingPlan — two sessions on one day', () => {
  it('leads with the session carrying the most running, and its targets are that session’s alone', () => {
    const tp = importedToTrainingPlan(plan([[
      { day: 3, type: 'strength', title: 'Core', durationMin: 20 },
      { day: 3, type: 'run', title: 'Easy run', distanceMi: 3, durationMin: 30 },
      { day: 3, type: 'quality', title: 'Hills', detail: '8 × 60 s uphill', distanceMi: 5, intensity: 'interval' },
    ]]), config)
    const wed = tp.weeks[0].days[2]
    expect(wed.type).toBe('quality')
    expect(wed.workout).toBe('Hills')
    expect(wed.zone).toBe(`5.0 mi · Z4 (${tp.zones[3].hr})`)
    expect(wed.time).toBe('—')
    expect(wed.detail).toBe('8 × 60 s uphill · Also: Easy run (3.0 mi, 30 min) · Also: Core (20 min)')
    // The week still counts both runs in full.
    expect(tp.weeks[0].miles).toBe(8)
  })

  it('never puts a long easy run on a strides session’s heart rate', () => {
    const tp = importedToTrainingPlan(plan([[
      { day: 7, type: 'quality', title: 'Strides', detail: '6 × 20 s', intensity: 'interval' },
      { day: 7, type: 'long', title: 'Long run', distanceMi: 14, durationMin: 130, intensity: 'easy' },
    ]]), config)
    const sun = tp.weeks[0].days[6]
    expect(sun).toMatchObject({ type: 'long', workout: 'Long run', time: '2 hr 10 min' })
    expect(sun.zone).toMatch(/^14\.0 mi · Z1–2 \(/)
    expect(parseHRRange(sun.zone)?.high).toBe(Number(tp.zones[1].hr.split('–')[1]))
    expect(sun.detail).toBe('Also: Strides — 6 × 20 s')
  })

  it('gives the day only the lead session’s time', () => {
    const tp = importedToTrainingPlan(plan([[
      { day: 2, type: 'run', title: 'Easy run', durationMin: 40 },
      { day: 2, type: 'strength', title: 'Core', durationMin: 30 },
    ]]), config)
    const tue = tp.weeks[0].days[1]
    expect(tue.workout).toBe('Easy run')
    expect(parseDuration(tue.time)).toBe(40)
  })
})

describe('importedToTrainingPlan — the plan around the weeks', () => {
  it('names the race from the athlete’s answer, else the plan title', () => {
    expect(importedToTrainingPlan(plan([weekOne]), config).race.name).toBe('Spring Marathon Plan')
    const named = importedToTrainingPlan(plan([weekOne], { raceDistance: 'Marathon' }), { ...config, raceName: 'Spring Marathon', raceDate: '2027-02-14' })
    expect(named.race).toMatchObject({ name: 'Spring Marathon', date: '2027-02-14', distance: 'Marathon' })
  })

  it('carries the race distance and vert the athlete gave in onboarding', () => {
    const tp = importedToTrainingPlan(plan([weekOne]), { ...config, raceDistance: 'marathon', elevationGainFt: 1200 })
    expect(tp.race).toMatchObject({ distance: 'Marathon', distanceMiles: 26.2, elevation: '1200 ft', elevationGainFt: 1200 })
    const exact = importedToTrainingPlan(plan([weekOne], { raceDistance: 'Trail half' }), { ...config, raceDistance: 'half_marathon', raceDistanceMiles: 13.4 })
    expect(exact.race).toMatchObject({ distance: 'Half Marathon', distanceMiles: 13.4 })
  })

  it('labels a general-fitness plan as having no race', () => {
    expect(importedToTrainingPlan(plan([weekOne], { sport: 'general' }), config).race.distance).toBe('General fitness — no race')
  })

  it('builds zones from the athlete’s max HR, with no gaps, and records where the plan came from', () => {
    const tp = importedToTrainingPlan(plan([weekOne]), config)
    expect(tp.athlete.maxHR).toBe(180)
    expect(tp.zones).toHaveLength(4)
    for (let i = 0; i < tp.zones.length - 1; i++) {
      const hi = Number(tp.zones[i].hr.split('–')[1])
      const nextLo = Number(tp.zones[i + 1].hr.split('–')[0])
      expect(nextLo).toBe(hi + 1)
    }
    expect(tp.importSource).toEqual({ name: 'plan.pdf', kind: 'pdf', importedAt: '2026-10-08T12:00:00.000Z', title: 'Spring Marathon Plan' })
    expect(tp.methodId).toBeUndefined()
  })

  it('passes through the plan QA linter without throwing', () => {
    const tp = importedToTrainingPlan(plan(Array.from({ length: 12 }, () => weekOne)), config)
    expect(() => validatePlan({ weeks: tp.weeks, zones: tp.zones, race: tp.race })).not.toThrow()
  })
})

describe('formatDuration', () => {
  it.each([
    [45, '45 min'],
    [59.6, '1 hr'],
    [60, '1 hr'],
    [70, '1 hr 10 min'],
    [150, '2 hr 30 min'],
  ])('%s minutes reads as %s', (minutes, text) => {
    expect(formatDuration(minutes)).toBe(text)
  })
})
