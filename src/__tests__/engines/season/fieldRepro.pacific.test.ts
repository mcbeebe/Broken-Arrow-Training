import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { RaceInfo, SeasonRace, TrainingWeek } from '../../../types'
import type { OnboardingConfig } from '../../../hooks/useOnboarding'
import { getMethodById } from '../../../data/methods'
import { generatePlanFromMethod } from '../../../engines/planGenerator/generatePlan'
import { planSeason } from '../../../engines/season/planSeason'
import { spliceSeasonWeeks } from '../../../engines/season/spliceSeason'
import { parseDayToDate, isoFromLocalDate } from '../../../utils/planDates'

// vitest runs on Node, but the app tsconfig carries no Node types —
// reach process.env through globalThis for the TZ switch.
const env = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env


/**
 * THE FIELD REPRO — the exact scenario from the bug report, under the
 * athlete's real timezone (Pacific): anchor "Oakland Hills Half Marathon"
 * Sat 2026-10-24 + "Hyrox - Anaheim" Sat 2026-12-12, viewed 2026-07-08.
 *
 * Every assertion below was FALSE in the field:
 *  - race day showed "Post-race rest" (recovery started ON race day);
 *  - the same dates appeared in two weeks (last-write-wins corruption);
 *  - spliced weeks ran Fri→Thu, one was 3 days long;
 *  - a RECOVERY week sat right before the second race, with no race day
 *    for the Hyrox anywhere.
 */

const ANCHOR_ISO = '2026-10-24'
const HYROX_ISO = '2026-12-12'
const TODAY = '2026-07-08'

function race(over: Partial<RaceInfo>): RaceInfo {
  return {
    name: 'Race', date: ANCHOR_ISO, startTime: '', distance: 'Half Marathon',
    distanceMiles: 13.1, elevation: '', elevationRange: '', course: '', cutoff: '',
    landmarks: [], gear: [], nutrition: '', ...over,
  }
}

function sr(id: string, priority: SeasonRace['priority'], info: Partial<RaceInfo>): SeasonRace {
  return { id, priority, raceInfo: race(info), status: 'upcoming' }
}

const config = {
  raceType: 'trail', raceName: 'Oakland Hills Half Marathon', raceDate: ANCHOR_ISO,
  raceDistance: 'half_marathon', experienceLevel: 'intermediate',
  trainingDaysPerWeek: 4, wearable: 'none', athleteName: 'Mike', age: 45,
  maxHR: 178, selectedMethodId: 'higdon', completedAt: '',
} as OnboardingConfig

const races = [
  sr('half', 'A', { name: 'Oakland Hills Half Marathon', date: ANCHOR_ISO }),
  sr('hyrox', 'A', {
    name: 'Hyrox - Anaheim', date: HYROX_ISO, distance: 'Hyrox',
    distanceMiles: 8, description: 'Hyrox open',
  }),
]

let savedTz: string | undefined
let weeks: TrainingWeek[]

beforeAll(() => {
  savedTz = env.TZ
  env.TZ = 'America/Los_Angeles'
  // Canary — if the runner ignores TZ this suite proves nothing.
  expect(new Date(ANCHOR_ISO).getDate()).toBe(23)

  const method = getMethodById('higdon')!
  const anchor = generatePlanFromMethod(method, config, TODAY)
  const result = planSeason(races, TODAY)
  weeks = spliceSeasonWeeks(anchor.weeks, result, config, TODAY)
})

afterAll(() => {
  if (savedTz === undefined) delete env.TZ
  else env.TZ = savedTz
})

function isoOf(dayLabel: string): string | null {
  return parseDayToDate(dayLabel, undefined, ANCHOR_ISO)
}

describe('field repro: half 10/24 + Hyrox 12/12, Pacific timezone', () => {
  it('exactly one race card on 10/24 and one on 12/12, correctly named', () => {
    // Note: Higdon schedules mid-build race-PACE workouts that also carry
    // type 'race' — the assertions here are about the two race DATES.
    const raceDays = weeks.flatMap(w => w.days).filter(d => d.type === 'race')
    const onAnchor = raceDays.filter(d => isoOf(d.day) === ANCHOR_ISO)
    const onHyrox = raceDays.filter(d => isoOf(d.day) === HYROX_ISO)
    expect(onAnchor, 'anchor race day card missing').toHaveLength(1)
    // Content, not just type: the anchor card once read "Easy · Substituted
    // higdon_easy_run" because the picker resolved the race_pace slot away.
    expect(onAnchor[0].workout).toContain('RACE DAY')
    expect(onHyrox, 'Hyrox race day card missing (THE field bug)').toHaveLength(1)
    expect(onHyrox[0].workout).toContain('Hyrox - Anaheim')
    // In the spliced (post-anchor) region the ONLY race-typed day is the
    // Hyrox itself — no stray race cards.
    const afterAnchor = raceDays.filter(d => {
      const iso = isoOf(d.day)
      return iso !== null && iso > ANCHOR_ISO
    })
    expect(afterAnchor).toHaveLength(1)
  })

  it('no calendar date appears in two weeks (the last-write-wins killer)', () => {
    const seen = new Map<string, number>()
    for (const w of weeks) {
      for (const d of w.days) {
        const iso = isoOf(d.day)
        if (!iso) continue
        expect(seen.has(iso), `date ${iso} is in week ${w.num} AND week ${seen.get(iso)}`).toBe(false)
        seen.set(iso, w.num)
      }
    }
  })

  it('recovery starts the day AFTER the race — 10/24 is the race, 10/25 is rest', () => {
    const dayFor = (iso: string) =>
      weeks.flatMap(w => w.days).find(d => isoOf(d.day) === iso)
    expect(dayFor(ANCHOR_ISO)?.type).toBe('race')
    const dayAfter = dayFor('2026-10-25')
    expect(dayAfter?.type).toBe('rest')
    expect(dayAfter?.workout).toContain('Post-race rest')
  })

  it('every week starts on a Monday — the post-race Sunday folds into the race week', () => {
    const nonMondayStarts: string[] = []
    for (const w of weeks) {
      const first = w.days.length > 0 ? isoOf(w.days[0].day) : null
      if (!first) continue
      const dow = new Date(`${first}T12:00:00`).getDay()
      if (dow !== 1) nonMondayStarts.push(first)
    }
    // The old behavior left the Sunday after the Saturday race as its own
    // "Week 13 · Oct 25–25 · ~0 mi" orphan (a field complaint); it now
    // merges into the race week's Mon–Sun span.
    expect(nonMondayStarts).toEqual([])
  })

  it('no coverage gap: every date from recovery start through Hyrox race day appears exactly once', () => {
    const isos = new Set(
      weeks.flatMap(w => w.days).map(d => isoOf(d.day)).filter((x): x is string => !!x),
    )
    const missing: string[] = []
    const cur = new Date('2026-10-25T12:00:00')
    const end = new Date(`${HYROX_ISO}T12:00:00`)
    while (cur <= end) {
      const iso = isoFromLocalDate(cur)
      if (!isos.has(iso)) missing.push(iso)
      cur.setDate(cur.getDate() + 1)
    }
    expect(missing, `dates with no plan coverage: ${missing.join(', ')}`).toEqual([])
  })

  it('no RECOVERY week in the final 2 weeks before either race (the inversion)', () => {
    for (const w of weeks) {
      if (!/RECOVERY WEEK/.test(w.focus)) continue
      const first = isoOf(w.days[0].day)
      if (!first) continue
      for (const raceIso of [ANCHOR_ISO, HYROX_ISO]) {
        const gapDays = Math.round((Date.parse(`${raceIso}T12:00:00`) - Date.parse(`${first}T12:00:00`)) / 86_400_000)
        expect(gapDays < 0 || gapDays > 14, `RECOVERY week ${w.num} starts ${first}, ${gapDays}d before race ${raceIso}`).toBe(true)
      }
    }
  })

  it('all spliced week volumes are numeric (the "~~7 mi" bug)', () => {
    expect(weeks.every(w => typeof w.miles === 'number')).toBe(true)
  })

  it('week numbers strictly increase and dates never rewind', () => {
    for (let i = 1; i < weeks.length; i++) {
      expect(weeks[i].num).toBe(weeks[i - 1].num + 1)
    }
    let last = ''
    for (const w of weeks) {
      const first = w.days.length > 0 ? isoOf(w.days[0].day) : null
      if (!first) continue
      expect(first >= last, `week ${w.num} (${first}) rewinds before ${last}`).toBe(true)
      last = first
    }
  })
})
