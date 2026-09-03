import { describe, it, expect } from 'vitest'
import type { RaceInfo, SeasonRace, TrainingWeek, PlannedDay } from '../../../types'
import { layerSecondaryWorkReport, canLayerOntoAnchor } from '../../../engines/season/layerSecondaryWork'
import { layeringAdvisories, LAYER_THIN_SESSIONS } from '../../../engines/season/layeringAdvisories'
import { spliceSeasonWithReport } from '../../../engines/season/spliceSeason'
import { planSeason } from '../../../engines/season/planSeason'
import type { OnboardingConfig } from '../../../hooks/useOnboarding'

/**
 * D6 — the app described layered work from the athlete's REQUEST, not from
 * what the transform did. On a Hyrox anchor the transform refuses outright,
 * and the coach letter still told the athlete "1–2 sessions/week are woven
 * into your build". The days simply were not there, and nothing in the app
 * would ever say so.
 */

function day(label: string, type: PlannedDay['type'], workout = 'X'): PlannedDay {
  return { day: label, type, workout, detail: 'd', zone: 'Z2', route: '', time: '45 min' }
}

/** A logged session — enough of the shape for "this day is done". */
const loggedStrength: NonNullable<PlannedDay['actual']> = {
  stravaId: 1, distance: 0, movingTime: 2700, elapsedTime: 2700, elevationGain: 0,
  name: 'Strength', type: 'WeightTraining', startDate: '2026-09-15T17:00:00Z',
}

function weeks(): TrainingWeek[] {
  const mk = (num: number, mon: number, d: number, focus = 'Build'): TrainingWeek => ({
    num, dates: '', miles: 20, focus,
    days: [
      day(`Mon ${mon}/${d}`, 'run'),
      day(`Tue ${mon}/${d + 1}`, 'strength', 'STRENGTH'),
      day(`Wed ${mon}/${d + 2}`, 'quality'),
      day(`Thu ${mon}/${d + 3}`, 'cross', 'Cycling'),
      day(`Sat ${mon}/${d + 5}`, 'long'),
    ],
  })
  return [mk(1, 9, 14), mk(2, 9, 21), mk(3, 9, 28), mk(4, 10, 5)]
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
const report = (w: TrainingWeek[], athlete?: Parameters<typeof layerSecondaryWorkReport>[4]) =>
  layerSecondaryWorkReport(w, hyroxRace('layered'), ANCHOR, TODAY, athlete).report

describe('canLayerOntoAnchor', () => {
  it('permits running anchors, refuses the strength-led ones, tolerates unknown', () => {
    expect(canLayerOntoAnchor('road')).toBe(true)
    expect(canLayerOntoAnchor('trail')).toBe(true)
    expect(canLayerOntoAnchor('hyrox')).toBe(false)
    expect(canLayerOntoAnchor('general')).toBe(false)
    // Legacy callers with no anchor context stay permitted — the engine's
    // own behaviour, and the UI predicate must not disagree with it.
    expect(canLayerOntoAnchor(undefined)).toBe(true)
    expect(canLayerOntoAnchor(null)).toBe(true)
  })
})

describe('the transform reports what it actually did', () => {
  it('counts the sessions, the weeks and the eased ones', () => {
    const r = report(weeks())
    expect(r.refusal).toBeNull()
    expect(r.sessions).toBe(6) // 1 + 1 + 2 + 2
    expect(r.weeks).toBe(4)
    // Every slot in this fixture is beside the quality session, so all six
    // were eased — the report is what makes that visible.
    expect(r.eased).toBe(6)
    expect(r.firstIso).toBe('2026-09-15')
    expect(r.lastIso).toBe('2026-10-08')
  })

  it('names the refusal instead of quietly returning the input', () => {
    expect(layerSecondaryWorkReport(weeks(), hyroxRace('sequential'), ANCHOR, TODAY).report.refusal)
      .toBe('not-requested')
    expect(report(weeks(), { anchorRaceType: 'hyrox' }).refusal).toBe('anchor-format')
    expect(report(weeks(), { anchorRaceType: 'general' }).refusal).toBe('anchor-format')
    // Every week is protected → nothing eligible.
    const allTaper = weeks().map(w => ({ ...w, focus: 'Taper' }))
    expect(report(allTaper).refusal).toBe('no-eligible-weeks')
  })

  it('reports zero when every slot is already spoken for', () => {
    // Completed days are never overwritten, so a fully logged build has
    // nothing to lend — and that has to read as zero, not as success.
    const logged = weeks().map(w => ({
      ...w,
      days: w.days.map(d => (d.type === 'strength' || d.type === 'cross'
        ? { ...d, actual: loggedStrength }
        : d)),
    }))
    const r = report(logged)
    expect(r.sessions).toBe(0)
    expect(r.refusal).toBe('no-eligible-weeks')
  })
})

describe('layeringAdvisories', () => {
  it('says nothing when the athlete never asked', () => {
    const r = layerSecondaryWorkReport(weeks(), hyroxRace('sequential'), ANCHOR, TODAY).report
    expect(layeringAdvisories([r], 'Boston Marathon', 'road')).toEqual([])
  })

  it('a Hyrox anchor gets told the layering was refused, and why', () => {
    const adv = layeringAdvisories([report(weeks(), { anchorRaceType: 'hyrox' })], 'Hyrox - Chicago', 'hyrox')
    expect(adv).toHaveLength(1)
    expect(adv[0].severity).toBe('caution')
    expect(adv[0].title).toMatch(/was not layered in/)
    expect(adv[0].detail).toMatch(/your main race is a Hyrox too/)
    expect(adv[0].detail).toMatch(/Your plan is unchanged/)
    expect(adv[0].suggestion).toMatch(/starting after Hyrox - Chicago/)
  })

  it('a general-fitness anchor gets its own reason, not the Hyrox one', () => {
    const adv = layeringAdvisories([report(weeks(), { anchorRaceType: 'general' })], 'Stay healthy', 'general')
    expect(adv[0].detail).toMatch(/strength-led/)
    expect(adv[0].detail).not.toMatch(/Hyrox too/)
  })

  it('an empty runway is reported as zero sessions, in plain words', () => {
    const allTaper = weeks().map(w => ({ ...w, focus: 'Taper' }))
    const adv = layeringAdvisories([report(allTaper)], 'Boston Marathon', 'road')
    expect(adv[0].severity).toBe('caution')
    expect(adv[0].detail).toMatch(/Zero sessions were added/)
    expect(adv[0].detail).toMatch(/Nothing in your plan claims otherwise/)
  })

  it('names the ACTUAL session count when it worked', () => {
    const adv = layeringAdvisories([report(weeks())], 'Boston Marathon', 'road')
    expect(adv).toHaveLength(1)
    expect(adv[0].title).toBe('6 layered sessions for Hyrox - Anaheim')
    expect(adv[0].detail).toMatch(/6 station\/strength sessions across 4 weeks/)
    expect(adv[0].detail).toMatch(/6 of them are eased/)
    // "1–2 sessions a week" described the algorithm, not the athlete's plan.
    expect(adv[0].detail).not.toMatch(/1–2/)
  })

  it('a thin dose is delivered AND flagged — there is no refusal floor', () => {
    // Two eligible weeks → the escalation puts 1 in the first and 2 in the
    // second: 3 sessions. Below the thin bar, but the athlete still gets
    // them — three useful sessions beat a silent nothing.
    const short = weeks().slice(0, 2)
    const r = report(short)
    expect(r.sessions).toBe(3)
    expect(r.sessions).toBeLessThan(LAYER_THIN_SESSIONS)
    expect(r.refusal).toBeNull()
    const adv = layeringAdvisories([r], 'Boston Marathon', 'road')
    expect(adv[0].severity).toBe('caution')
    expect(adv[0].title).toBe('3 layered sessions for Hyrox - Anaheim')
    expect(adv[0].suggestion).toMatch(/a top-up, not a build/)
  })

  it('singularises so a one-session dose does not read as machine output', () => {
    const one = { raceName: 'Hyrox - Anaheim', refusal: null, sessions: 1, weeks: 1, eased: 1, firstIso: '2026-09-15', lastIso: '2026-09-15' }
    const adv = layeringAdvisories([one], 'Boston Marathon', 'road')
    expect(adv[0].title).toBe('1 layered session for Hyrox - Anaheim')
    expect(adv[0].detail).toMatch(/1 station\/strength session across 1 week/)
    expect(adv[0].detail).toMatch(/1 of them is eased/)
  })

  it('gives every race its own advisory id so two layered races both surface', () => {
    const a = { ...report(weeks()), raceName: 'Hyrox - Anaheim' }
    const b = { ...report(weeks()), raceName: 'Hyrox - LA' }
    const adv = layeringAdvisories([a, b], 'Boston Marathon', 'road')
    expect(adv).toHaveLength(2)
    expect(new Set(adv.map(x => x.id)).size).toBe(2)
  })
})

/** The path App.tsx actually walks: splice → reports → advisories. */
describe('end to end through the splice', () => {
  const baseConfig = {
    raceType: 'trail', raceName: 'Half', raceDate: ANCHOR,
    raceDistance: 'half_marathon', experienceLevel: 'intermediate',
    trainingDaysPerWeek: 4, wearable: 'none', athleteName: 'T', age: 40,
    maxHR: 180, selectedMethodId: 'daniels', completedAt: '',
  } as OnboardingConfig

  const anchorSeasonRace = (): SeasonRace => ({
    id: 'half', priority: 'A', status: 'upcoming',
    raceInfo: {
      name: 'Half', date: ANCHOR, startTime: '', distance: 'Half Marathon',
      distanceMiles: 13.1, elevation: '', elevationRange: '', course: '', cutoff: '',
      landmarks: [], gear: [], nutrition: '',
    },
  })

  it('a trail anchor gets a dose advisory naming the count the plan really carries', () => {
    const result = planSeason([anchorSeasonRace(), hyroxRace('layered')], TODAY)
    const { weeks: spliced, layerReports } = spliceSeasonWithReport(weeks(), result, baseConfig, TODAY)
    const actual = spliced.flatMap(w => w.days).filter(d => d.workout.includes('Hyrox prep')).length
    expect(actual).toBeGreaterThan(0)
    const adv = layeringAdvisories(layerReports, 'Half', baseConfig.raceType)
    expect(adv).toHaveLength(1)
    // The number in the advisory is the number of days in the plan — that
    // equality is the entire point of D6.
    expect(adv[0].title).toBe(`${actual} layered sessions for Hyrox - Anaheim`)
  })

  it('a Hyrox anchor gets the refusal advisory, and zero layered days', () => {
    const result = planSeason([anchorSeasonRace(), hyroxRace('layered')], TODAY)
    const { weeks: spliced, layerReports } = spliceSeasonWithReport(
      weeks(), result, { ...baseConfig, raceType: 'hyrox' } as OnboardingConfig, TODAY)
    expect(spliced.flatMap(w => w.days).filter(d => d.workout.includes('Hyrox prep'))).toHaveLength(0)
    const adv = layeringAdvisories(layerReports, 'Half', 'hyrox')
    expect(adv).toHaveLength(1)
    expect(adv[0].title).toMatch(/was not layered in/)
  })

  it('GUARD: a single-race season reports nothing at all', () => {
    const result = planSeason([anchorSeasonRace()], TODAY)
    const { layerReports } = spliceSeasonWithReport(weeks(), result, baseConfig, TODAY)
    expect(layerReports).toEqual([])
    expect(layeringAdvisories(layerReports, 'Half', 'trail')).toEqual([])
  })
})
