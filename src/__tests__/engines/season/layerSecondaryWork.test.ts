import { describe, it, expect } from 'vitest'
import type { RaceInfo, SeasonRace, TrainingWeek, PlannedDay } from '../../../types'
import type { OnboardingConfig } from '../../../hooks/useOnboarding'
import { layerSecondaryWork } from '../../../engines/season/layerSecondaryWork'
import { planSeason } from '../../../engines/season/planSeason'
import { spliceSeasonWeeks } from '../../../engines/season/spliceSeason'

/**
 * Layered multi-race preparation (user-directed): a Hyrox 6–7 weeks after
 * the anchor race can't be prepared in the gap alone — integration:'layered'
 * weaves 1–2 station/strength sessions into the anchor build's EXISTING
 * strength/cross slots. Guards: run days untouched, nothing in the final 2
 * pre-race weeks, sequential/unset = byte-identical.
 */

function day(label: string, type: PlannedDay['type'], workout = 'X'): PlannedDay {
  return { day: label, type, workout, detail: 'd', zone: 'Z2', route: '', time: '45 min' }
}

/** Mon-anchored anchor-build weeks ending at a Sat 10/24 race. */
function anchorWeeks(): TrainingWeek[] {
  // Week starts: 9/14, 9/21, 9/28, 10/5, 10/12 (final-2 guard), 10/19 (race wk)
  const mk = (num: number, mon: number, dayNum: number, focus = 'Build'): TrainingWeek => ({
    num, dates: '', miles: 20, focus,
    days: [
      day(`Mon ${mon}/${dayNum}`, 'run'),
      day(`Tue ${mon}/${dayNum + 1}`, 'strength', 'STRENGTH'),
      day(`Wed ${mon}/${dayNum + 2}`, 'quality'),
      day(`Thu ${mon}/${dayNum + 3}`, 'cross', 'Cycling'),
      day(`Sat ${mon}/${dayNum + 5}`, 'long'),
    ],
  })
  return [
    mk(1, 9, 14), mk(2, 9, 21), mk(3, 9, 28), mk(4, 10, 5),
    mk(5, 10, 12, 'Taper'), // inside the final-2-week guard
    { num: 6, dates: '', miles: 8, focus: 'Race week', days: [day('Mon 10/19', 'run'), day('Sat 10/24', 'race', 'RACE DAY')] },
  ]
}

function hyroxRace(integration?: 'layered' | 'sequential'): SeasonRace {
  const raceInfo: RaceInfo = {
    name: 'Hyrox - Anaheim', date: '2026-12-12', startTime: '', distance: 'Hyrox',
    distanceMiles: 8, elevation: '', elevationRange: '', course: '', cutoff: '',
    landmarks: [], gear: [], nutrition: '', description: 'Hyrox open',
  }
  return { id: 'hyrox', priority: 'A', raceInfo, status: 'upcoming', integration }
}

const ANCHOR = '2026-10-24'
const TODAY = '2026-07-08'

describe('layerSecondaryWork', () => {
  it('weaves Hyrox sessions into strength/cross slots — 1/week early, 2/week later', () => {
    const out = layerSecondaryWork(anchorWeeks(), hyroxRace('layered'), ANCHOR, TODAY)
    const counts = out.map(w => w.days.filter(d => d.workout.includes('Hyrox prep')).length)
    // Weeks 1-2 (first half of the 4 eligible): 1 session; weeks 3-4: 2.
    expect(counts.slice(0, 4)).toEqual([1, 1, 2, 2])
    // Guard: nothing in the final-2-week window or race week.
    expect(counts[4]).toBe(0)
    expect(counts[5]).toBe(0)
    // P3.5 — content PROGRESSES across the run instead of repeating one
    // static template (v1 shipped the identical Monday for 8 weeks).
    const layered = out.flatMap(w => w.days.filter(d => d.workout.includes('Hyrox prep')))
    expect(new Set(layered.map(d => d.detail)).size).toBeGreaterThan(1)
    expect(new Set(layered.map(d => d.workout)).size).toBeGreaterThan(1)
  })

  it('run days, day counts, and week volumes are untouched', () => {
    const base = anchorWeeks()
    const out = layerSecondaryWork(base, hyroxRace('layered'), ANCHOR, TODAY)
    out.forEach((w, i) => {
      expect(w.days.length).toBe(base[i].days.length)
      expect(w.miles).toBe(base[i].miles)
      const runTypes = (ws: TrainingWeek) => ws.days.filter(d => ['run', 'quality', 'long', 'race'].includes(d.type)).map(d => d.workout)
      expect(runTypes(w)).toEqual(runTypes(base[i]))
    })
  })

  it('GUARD: sequential and unset are byte-identical; non-Hyrox races pass through', () => {
    const base = anchorWeeks()
    expect(layerSecondaryWork(base, hyroxRace('sequential'), ANCHOR, TODAY)).toBe(base)
    expect(layerSecondaryWork(base, hyroxRace(undefined), ANCHOR, TODAY)).toBe(base)
    const marathon = { ...hyroxRace('layered'), raceInfo: { ...hyroxRace().raceInfo, name: 'CIM Marathon', distance: 'Marathon', description: 'road race' } }
    expect(layerSecondaryWork(base, marathon, ANCHOR, TODAY)).toBe(base)
  })

  it('never rewrites history: completed days and past days stay as they were', () => {
    const base = anchorWeeks()
    base[0].days[1] = { ...base[0].days[1], actual: { name: 'Done', distance: 0, movingTime: 1800 } as PlannedDay['actual'] }
    const out = layerSecondaryWork(base, hyroxRace('layered'), ANCHOR, TODAY)
    expect(out[0].days[1].workout).toBe('STRENGTH') // completed — untouched
    // The cross slot picks up the session instead.
    expect(out[0].days[3].workout).toContain('Hyrox prep')
  })
})

describe('spliceSeasonWeeks applies layering (opt-in only)', () => {
  const config = {
    raceType: 'trail', raceName: 'Half', raceDate: ANCHOR,
    raceDistance: 'half_marathon', experienceLevel: 'intermediate',
    trainingDaysPerWeek: 4, wearable: 'none', athleteName: 'T', age: 40,
    maxHR: 180, selectedMethodId: 'daniels', completedAt: '',
  } as OnboardingConfig

  function anchorSeasonRace(): SeasonRace {
    return {
      id: 'half', priority: 'A', status: 'upcoming',
      raceInfo: {
        name: 'Half', date: ANCHOR, startTime: '', distance: 'Half Marathon',
        distanceMiles: 13.1, elevation: '', elevationRange: '', course: '', cutoff: '',
        landmarks: [], gear: [], nutrition: '',
      },
    }
  }

  it('layered second race transforms anchor strength/cross slots through the splice', () => {
    const result = planSeason([anchorSeasonRace(), hyroxRace('layered')], TODAY)
    const spliced = spliceSeasonWeeks(anchorWeeks(), result, config, TODAY)
    const layeredCount = spliced.flatMap(w => w.days).filter(d => d.workout.includes('Hyrox prep')).length
    expect(layeredCount).toBeGreaterThan(0)
  })

  it('GUARD: an unset-integration second race leaves anchor weeks day-identical', () => {
    const base = anchorWeeks()
    const result = planSeason([anchorSeasonRace(), hyroxRace(undefined)], TODAY)
    const spliced = spliceSeasonWeeks(base, result, config, TODAY)
    for (let i = 0; i < base.length; i++) {
      expect(spliced[i].days.map(d => d.workout)).toEqual(base[i].days.map(d => d.workout))
    }
  })
})

describe('P3.1 — layered sessions render from the race division and athlete sex', () => {
  const stationDays = (weeks: TrainingWeek[]) =>
    weeks.flatMap(w => w.days.filter(d => d.workout === 'Hyrox prep — station volumes'))
  const strengthDays = (weeks: TrainingWeek[]) =>
    weeks.flatMap(w => w.days.filter(d => d.workout === 'Hyrox prep — strength-endurance + grip'))

  it("a female athlete's layered station sessions carry the women's Open loads", () => {
    const out = layerSecondaryWork(anchorWeeks(), hyroxRace('layered'), ANCHOR, TODAY, { sex: 'female' })
    const text = stationDays(out).map(d => d.detail).join('\n')
    expect(text).toContain('102 kg')
    expect(text).not.toContain('152 kg')
    // The strength-endurance session's farmer carry names the real load too.
    expect(strengthDays(out).map(d => d.detail).join('\n')).toContain('2×16 kg')
  })

  it("the race's own division wins over the athlete's (a Pro second race)", () => {
    const race = hyroxRace('layered')
    race.raceInfo.hyroxDivision = 'pro'
    const out = layerSecondaryWork(anchorWeeks(), race, ANCHOR, TODAY, { hyroxDivision: 'open', sex: 'male' })
    const text = stationDays(out).map(d => d.detail).join('\n')
    expect(text).toContain('202 kg')
    expect(text).not.toContain('152 kg')
  })

  it("falls back to the athlete's division when the race carries none", () => {
    const out = layerSecondaryWork(anchorWeeks(), hyroxRace('layered'), ANCHOR, TODAY, { hyroxDivision: 'pro' })
    expect(stationDays(out).map(d => d.detail).join('\n')).toContain('202 kg')
  })

  it('defaults to men\'s Open with no athlete context (legacy callers)', () => {
    const out = layerSecondaryWork(anchorWeeks(), hyroxRace('layered'), ANCHOR, TODAY)
    expect(stationDays(out).map(d => d.detail).join('\n')).toContain('152 kg')
  })
})
