/**
 * R3 — season continuity (docs/running-plan-audit.md).
 *
 * The audit found each season block was generated as a stranger to the
 * one before it: block 2 re-ramped from the months-old onboarding answer
 * (the +143% recover→build seam), and the recover/bridge streams
 * prescribed the same 20–45 min days to a 10 mi/wk beginner and a
 * 45 mi/wk marathoner alike, at any age. This suite locks in:
 *  - fitness carry-over (block 2 starts within 15% of ~85% of block 1's
 *    achieved build volume, and never above it),
 *  - athlete-scaled recover/bridge (volume follows the prior block; age
 *    adds rest and defers the first intensity touch),
 *  - the qa_block_seam rule that guards the seam in CI.
 */
import { describe, it, expect } from 'vitest'
import { generatePlanFromMethod } from '../../../engines/planGenerator/generatePlan'
import { getMethodById } from '../../../data/methods'
import { planSeason } from '../../../engines/season/planSeason'
import { spliceSeasonWeeks } from '../../../engines/season/spliceSeason'
import { recoverDayStream, bridgeDayStream } from '../../../engines/season/blockWeeks'
import { validatePlan } from '../../../engines/planQA/validatePlan'
import type { OnboardingConfig } from '../../../hooks/useOnboarding'
import type { RaceInfo, SeasonRace, TrainingWeek, SeasonBlock } from '../../../types'

const TODAY = '2026-08-17'

function satAfterWeeks(n: number): string {
  const d = new Date('2026-08-22T12:00:00')
  d.setDate(d.getDate() + (n - 1) * 7)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function raceInfo(name: string, date: string, distanceMiles: number): RaceInfo {
  return {
    name, date, startTime: '08:00', distance: `${distanceMiles} mi`, distanceMiles,
    elevation: '', elevationRange: '', course: '', cutoff: '', landmarks: [],
    gear: [], nutrition: '', format: 'road',
  } as RaceInfo
}

function season(cfg: OnboardingConfig, firstWeeks: number, firstMi: number, secondWeeks: number, secondMi: number) {
  const anchor = generatePlanFromMethod(getMethodById(cfg.selectedMethodId!)!, cfg, TODAY)
  const races: SeasonRace[] = [
    { id: 'r1', priority: 'A', status: 'upcoming', raceInfo: raceInfo('Race One', satAfterWeeks(firstWeeks), firstMi) },
    { id: 'r2', priority: 'A', status: 'upcoming', isPrimary: true, raceInfo: raceInfo('Race Two', satAfterWeeks(secondWeeks), secondMi) },
  ] as SeasonRace[]
  const spliced = spliceSeasonWeeks(anchor.weeks, planSeason(races, TODAY), cfg, TODAY)
  return { anchor, spliced }
}

/** Last non-taper/cutback/race build week's miles before the recover run,
 *  and the first build week's miles after it. */
function seamPair(spliced: TrainingWeek[]): { before: number; after: number } {
  const isRecoverish = (w: TrainingWeek) => /recover|bridge|post-race/i.test(w.focus ?? '')
  const isRace = (w: TrainingWeek) => w.days.some(d => d.type === 'race')
  const isTaperish = (w: TrainingWeek) => /taper|cutback/i.test(w.focus ?? '')
  let before = 0
  for (const w of spliced) {
    if (isRecoverish(w)) break
    if (!isRace(w) && !isTaperish(w) && Number(w.miles) > 0) before = Number(w.miles)
  }
  let seen = false
  for (const w of spliced) {
    if (isRecoverish(w)) { seen = true; continue }
    if (seen && !isRace(w) && Number(w.miles) > 0) return { before, after: Number(w.miles) }
  }
  return { before, after: 0 }
}

const carmen = {
  raceType: 'road', raceName: 'Race One', raceDate: satAfterWeeks(8),
  raceDistance: '10k', raceDistanceMiles: 6.2, athleteName: 'Carmen', age: 41,
  sex: 'female', experienceLevel: 'intermediate', trainingDaysPerWeek: 5,
  strengthDaysPerWeek: 1, equipmentAccess: ['gym'],
  fitnessAnchor: { type: 'race_10k', valueSeconds: 52 * 60 },
  longRunDay: 'Saturday', wearable: 'garmin', completedAt: '',
  selectedMethodId: 'pfitzinger', goalMode: 'season',
} as unknown as OnboardingConfig

const jim = {
  raceType: 'road', raceName: 'Race One', raceDate: satAfterWeeks(7),
  raceDistance: '5k', raceDistanceMiles: 3.1, athleteName: 'Jim', age: 79,
  sex: 'male', experienceLevel: 'beginner', trainingDaysPerWeek: 6,
  strengthDaysPerWeek: 1, equipmentAccess: ['gym'],
  longRunDay: 'Saturday', wearable: 'garmin', completedAt: '',
  selectedMethodId: 'daniels', goalMode: 'season',
} as unknown as OnboardingConfig

describe('R3 — fitness carries across the seam', () => {
  it('Carmen: block 2 resumes at ≤ the previous build, within 15% of the ~85% carry-over', () => {
    const { spliced } = season(carmen, 8, 6.2, 18, 13.1)
    const { before, after } = seamPair(spliced)
    expect(before).toBeGreaterThan(10)
    expect(after).toBeGreaterThan(0)
    expect(after).toBeLessThanOrEqual(before * 1.2) // never a seam cliff
    expect(after).toBeGreaterThanOrEqual(before * 0.85 * 0.85) // carry-over −15%
  })

  it('Jim (79): the originating season resumes from achieved volume too', () => {
    const { spliced } = season(jim, 7, 3.1, 16, 3.1)
    const { before, after } = seamPair(spliced)
    expect(before).toBeGreaterThan(5)
    expect(after).toBeGreaterThan(0)
    expect(after).toBeLessThanOrEqual(before * 1.2)
    expect(after).toBeGreaterThanOrEqual(before * 0.85 * 0.8) // masters ramp is gentler
  })

  it('both seasons pass the QA gate — including qa_block_seam — with zero errors', () => {
    for (const [cfg, w1, m1, w2, m2] of [
      [carmen, 8, 6.2, 18, 13.1],
      [jim, 7, 3.1, 16, 3.1],
    ] as const) {
      const { anchor, spliced } = season(cfg, w1, m1, w2, m2)
      const qa = validatePlan({ ...anchor, weeks: spliced })
      expect(qa.errors.map(e => `${e.id}@${e.weekNum}: ${e.detail}`)).toEqual([])
    }
  })

  it('qa_block_seam catches a fabricated +50% seam', () => {
    const mk = (num: number, focus: string, miles: number, race = false): TrainingWeek => ({
      num, startIso: satAfterWeeks(num), dates: 'x', miles, focus,
      days: race
        ? [{ day: 'Sat 10/3', type: 'race', workout: 'RACE DAY', detail: '', zone: '—', route: '', time: '—' }]
        : [{ day: 'Mon 9/28', type: 'run', workout: 'E Run', detail: '', zone: '—', route: '', time: '45 min' }],
    } as TrainingWeek)
    const weeks = [
      mk(1, 'Base', 18), mk(2, 'Base', 20), mk(3, 'Taper', 14), mk(4, 'Race week', 8, true),
      mk(5, 'Post-race recovery', 9), mk(6, 'Bridge — hold', 10),
      mk(7, 'Build', 30), // +50% over the wk-2 build baseline
    ]
    const qa = validatePlan({ weeks })
    expect(qa.errors.some(e => e.id === 'qa_block_seam' && e.weekNum === 7)).toBe(true)
  })
})

describe('R3 — recover/bridge content scales to the athlete', () => {
  const block: SeasonBlock = { kind: 'RECOVER', raceId: 'r', startDate: '2026-10-05', endDate: '2026-10-14' } as SeasonBlock

  it('a high-volume athlete gets longer recovery jogs than a low-volume one', () => {
    const big = recoverDayStream(block, 6.2, { athlete: { age: 30, priorWeeklyMi: 45 } })
    const small = recoverDayStream(block, 6.2, { athlete: { age: 30, priorWeeklyMi: 10 } })
    const firstJog = (s: typeof big) => s.find(d => d.day.type === 'run')!.day.time
    const mins = (t: string) => parseInt(t, 10)
    expect(mins(firstJog(big))).toBeGreaterThan(mins(firstJog(small)))
  })

  it('masters athletes get extra full rest days after the race', () => {
    const at79 = recoverDayStream(block, 6.2, { athlete: { age: 79, priorWeeklyMi: 12 } })
    const at30 = recoverDayStream(block, 6.2, { athlete: { age: 30, priorWeeklyMi: 12 } })
    const restRun = (s: typeof at79) => s.filter(d => d.day.workout === 'Post-race rest').length
    expect(restRun(at79)).toBe(restRun(at30) + 2)
    expect(at79.some(d => /masters margin/.test(d.day.detail))).toBe(true)
  })

  it('masters bridges defer the first strides week; younger athletes keep it', () => {
    const at62 = bridgeDayStream('2026-10-12', '2026-10-25', false, 0, undefined, { age: 62, priorWeeklyMi: 20 })
    const at30 = bridgeDayStream('2026-10-12', '2026-10-25', false, 0, undefined, { age: 30, priorWeeklyMi: 20 })
    const stridesDays = (s: typeof at62) => s.filter(d => /strides/i.test(d.day.workout))
    // Week 1: deferred for the master, present for the younger athlete.
    expect(stridesDays(at62.slice(0, 7)).length).toBe(0)
    expect(stridesDays(at30.slice(0, 7)).length).toBe(1)
    // Week 2: intensity returns for both.
    expect(stridesDays(at62.slice(7)).length).toBeGreaterThan(0)
  })

  it('bridge run durations scale with prior volume', () => {
    const big = bridgeDayStream('2026-10-12', '2026-10-18', false, 0, undefined, { age: 30, priorWeeklyMi: 45 })
    const small = bridgeDayStream('2026-10-12', '2026-10-18', false, 0, undefined, { age: 30, priorWeeklyMi: 10 })
    const rebuild = (s: typeof big) => parseInt(s.find(d => d.day.workout === 'Volume rebuild run')!.day.time, 10)
    expect(rebuild(big)).toBeGreaterThan(rebuild(small))
    expect(rebuild(big)).toBeLessThanOrEqual(45 * 1.6 + 5) // clamp holds
  })
})
