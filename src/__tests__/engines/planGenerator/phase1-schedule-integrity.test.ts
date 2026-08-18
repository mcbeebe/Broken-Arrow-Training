/**
 * Phase 1 — schedule integrity & QA-gate hardening (PRD-103 + PRD-105).
 *
 * Mandate #1: no plan ever contains three consecutive HARD days. This
 * suite unit-tests the generation-time repair, the new QA rules
 * (qa_consecutive_hard, qa_strength_interference, qa_week_shape), the
 * reconciled ramp thresholds (error >30% AND >3 mi — the absolute guard
 * that keeps low-volume rounding honest), the adherence warn tier, the
 * taper-frequency floor, category-aware warm-up floors, the secondary
 * long-run factor (102-F1, pulled forward), and the phase-allocator
 * post-condition.
 */
import { describe, it, expect } from 'vitest'
import { repairConsecutiveHard } from '../../../engines/planGenerator/generatePlan'
import { allocatePhaseWeeks } from '../../../engines/planGenerator/weekPlan'
import { validatePlan } from '../../../engines/planQA/validatePlan'
import { getMethodById, RECOMMENDABLE_METHODS } from '../../../data/methods'
import { generatePlanFromMethod } from '../../../engines/planGenerator/generatePlan'
import { TODAY, buildConfig, PERSONAS } from '../../helpers/roadPersonas'
import type { DaySchedule } from '../../../types/training-method'
import type { PlannedDay, TrainingWeek } from '../../../types'

const sched = (cats: string[]): DaySchedule[] =>
  cats.map((category, i) => ({ dayOfWeek: i + 1, category } as DaySchedule))
const catsOf = (s: DaySchedule[]) => [...s].sort((a, b) => a.dayOfWeek - b.dayOfWeek).map(d => d.category)

const day = (label: string, type: PlannedDay['type'], workout = 'X', detail = ''): PlannedDay =>
  ({ day: label, type, workout, detail, zone: '—', route: '', time: '45 min' })
const week = (num: number, days: PlannedDay[], over: Partial<TrainingWeek> = {}): TrainingWeek =>
  ({ num, dates: 'x', miles: 20, focus: 'Build', days, ...over } as TrainingWeek)
const RUN_WEEK = [
  day('Mon', 'rest', 'Rest'), day('Tue', 'run', 'E'), day('Wed', 'run', 'E'), day('Thu', 'run', 'E'),
  day('Fri', 'rest', 'Rest'), day('Sat', 'long', 'Long'), day('Sun', 'run', 'E'),
]

describe('Phase 1 — repairConsecutiveHard (Mandate #1 at generation time)', () => {
  it('swaps the quality day out of a long|tempo|long triple', () => {
    const out = catsOf(repairConsecutiveHard(
      sched(['rest', 'vo2_intervals', 'easy', 'long', 'tempo', 'long', 'recovery']),
      [false, false], null))
    // No three consecutive hard categories remain.
    const hard = out.map(c => ['vo2_intervals', 'tempo', 'long'].includes(c))
    for (let i = 2; i < hard.length; i++) {
      expect(hard[i] && hard[i - 1] && hard[i - 2], out.join(',')).toBe(false)
    }
    // The long days stayed; the tempo moved (quality demoted/moved before long).
    expect(out.filter(c => c === 'long').length).toBe(2)
  })

  it('catches a triple completed by the previous week\'s tail', () => {
    // Prev week ended [long, quality]; this week opens with quality.
    const out = catsOf(repairConsecutiveHard(
      sched(['tempo', 'easy', 'easy', 'rest', 'easy', 'long', 'rest']),
      [true, true], null))
    expect(out[0]).not.toBe('tempo') // moved or demoted off Monday
  })

  it('demotes quality (never long, never race) when no swap exists', () => {
    const out = catsOf(repairConsecutiveHard(
      sched(['long', 'tempo', 'long', 'tempo', 'long', 'tempo', 'long']),
      [false, false], null))
    const hard = out.map(c => ['tempo', 'long'].includes(c))
    for (let i = 2; i < hard.length; i++) {
      expect(hard[i] && hard[i - 1] && hard[i - 2], out.join(',')).toBe(false)
    }
    // Long days survive preferentially over tempo days.
    expect(out.filter(c => c === 'long').length).toBeGreaterThanOrEqual(out.filter(c => c === 'tempo').length)
  })

  it('race week: never moves or demotes the race-day slot', () => {
    const input = sched(['easy', 'tempo', 'race_pace', 'easy', 'easy', 'race_pace', 'rest'])
    const out = repairConsecutiveHard(input, [true, true], 6)
    expect(out.find(d => d.dayOfWeek === 6)!.category).toBe('race_pace')
  })
})

describe('Phase 1 — qa_consecutive_hard / qa_strength_interference / qa_week_shape', () => {
  it('three consecutive quality days error; two are clean', () => {
    const triple = week(1, [
      day('Mon', 'quality', 'Q1'), day('Tue', 'quality', 'Q2'), day('Wed', 'quality', 'Q3'),
      day('Thu', 'rest', 'Rest'), day('Fri', 'run', 'E'), day('Sat', 'long', 'Long'), day('Sun', 'rest', 'Rest'),
    ])
    expect(validatePlan({ weeks: [triple] }).errors.some(e => e.id === 'qa_consecutive_hard')).toBe(true)
    const pair = week(1, [
      day('Mon', 'quality', 'Q1'), day('Tue', 'quality', 'Q2'), day('Wed', 'run', 'E'),
      day('Thu', 'rest', 'Rest'), day('Fri', 'run', 'E'), day('Sat', 'long', 'Long'), day('Sun', 'rest', 'Rest'),
    ])
    expect(validatePlan({ weeks: [pair] }).errors.some(e => e.id === 'qa_consecutive_hard')).toBe(false)
  })

  it('long | quality | long across a WEEK boundary errors (seam case)', () => {
    const w1 = week(1, [...RUN_WEEK.slice(0, 5), day('Sat', 'long', 'Long'), day('Sun', 'quality', 'Q')])
    const w2 = week(2, [day('Mon', 'long', 'B2B'), ...RUN_WEEK.slice(1)])
    expect(validatePlan({ weeks: [w1, w2] }).errors.some(e => e.id === 'qa_consecutive_hard')).toBe(true)
  })

  it('a heavy-strength day counts as hard; a technique day does not', () => {
    const heavy = day('Wed', 'strength', 'Strength', 'Emphasis: heavy strength (4–6 reps) — leave 2 in reserve')
    const light = day('Wed', 'strength', 'Strength', 'Emphasis: technique first — controlled reps')
    const mk = (s: PlannedDay) => week(1, [
      day('Mon', 'rest', 'Rest'), day('Tue', 'quality', 'Q'), s, day('Thu', 'quality', 'Q2'),
      day('Fri', 'rest', 'Rest'), day('Sat', 'long', 'Long'), day('Sun', 'rest', 'Rest'),
    ])
    expect(validatePlan({ weeks: [mk(heavy)] }).errors.some(e => e.id === 'qa_consecutive_hard')).toBe(true)
    expect(validatePlan({ weeks: [mk(light)] }).errors.some(e => e.id === 'qa_consecutive_hard')).toBe(false)
  })

  it('heavy strength the day before a hard run warns', () => {
    const w = week(1, [
      day('Mon', 'rest', 'Rest'), day('Tue', 'run', 'E'),
      day('Wed', 'strength', 'Strength', 'Emphasis: explosive power (jumps)'),
      day('Thu', 'quality', 'Q'), day('Fri', 'rest', 'Rest'), day('Sat', 'long', 'Long'), day('Sun', 'rest', 'Rest'),
    ])
    expect(validatePlan({ weeks: [w] }).findings.some(f => f.id === 'qa_strength_interference')).toBe(true)
  })

  it('a calendar date appearing in two weeks errors', () => {
    const w1 = week(1, RUN_WEEK, { startIso: '2026-08-17' })
    const w2 = week(2, RUN_WEEK, { startIso: '2026-08-23' }) // Sunday — overlaps w1's last day
    expect(validatePlan({ weeks: [w1, w2] }).errors.some(e => e.id === 'qa_week_shape')).toBe(true)
    const w2ok = week(2, RUN_WEEK, { startIso: '2026-08-24' })
    expect(validatePlan({ weeks: [w1, w2ok] }).errors.some(e => e.id === 'qa_week_shape')).toBe(false)
  })
})

describe('Phase 1 — ramp & adherence thresholds (105-F2/F3)', () => {
  const mkWeek = (num: number, miles: number, targetMi?: number) =>
    week(num, RUN_WEEK, { miles, ...(targetMi != null ? { targetMi } : {}) })

  it.each([
    [23.8, false, false], // +19% clean
    [24.2, false, true],  // +21% warn
    [25.8, false, true],  // +29% warn
    [26.2, true, true],   // +31% error
  ])('baseline 20 → %s mi', (mi, isError, isWarn) => {
    const qa = validatePlan({ weeks: [mkWeek(1, 20), mkWeek(2, mi)] })
    expect(qa.errors.some(e => e.id === 'qa_weekly_ramp')).toBe(isError)
    expect(qa.findings.some(f => f.id === 'qa_weekly_ramp' && f.severity === 'warn')).toBe(isWarn && !isError)
  })

  it('the absolute guard: +31% on a tiny base (8.7 → 11.4, only 2.7 mi) never errors', () => {
    // The Koop low-volume case that forced the old 35% threshold: with the
    // >3 mi absolute guard it may warn, but it can no longer block release.
    const qa = validatePlan({ weeks: [mkWeek(1, 8.7), mkWeek(2, 11.4)] })
    expect(qa.errors.some(e => e.id === 'qa_weekly_ramp')).toBe(false)
  })

  it('adherence: 10% clean, 15% warns, 30% errors', () => {
    const at = (mi: number) => validatePlan({ weeks: [mkWeek(1, mi, 20)] }).findings.filter(f => f.id === 'qa_target_adherence')
    expect(at(22)).toEqual([])
    expect(at(23).map(f => f.severity)).toEqual(['warn'])
    expect(at(26).map(f => f.severity)).toEqual(['error'])
  })

  it('taper monotonicity tolerates rounding (+0.4) but not real growth (+0.6)', () => {
    const taper = (mi: number) => validatePlan({
      weeks: [mkWeek(1, 20), week(2, RUN_WEEK, { miles: mi, focus: 'Taper' })],
    }).errors.some(e => e.id === 'qa_taper_monotonic')
    expect(taper(20.4)).toBe(false)
    expect(taper(20.6)).toBe(true)
  })
})

describe('Phase 1 — allocator post-condition (105-F6)', () => {
  it('blocks cover exactly totalWeeks, contiguously, for every method × runway 4–32', () => {
    for (const method of RECOMMENDABLE_METHODS) {
      for (let weeks = 4; weeks <= 32; weeks++) {
        const blocks = allocatePhaseWeeks(method, weeks)
        expect(blocks[0].startWeekIndex, `${method.id}@${weeks}`).toBe(0)
        for (let i = 1; i < blocks.length; i++) {
          expect(blocks[i].startWeekIndex, `${method.id}@${weeks}`).toBe(blocks[i - 1].endWeekIndex + 1)
        }
        expect(blocks[blocks.length - 1].endWeekIndex, `${method.id}@${weeks}`).toBe(weeks - 1)
      }
    }
  })
})

describe('Phase 1 — secondary long runs & season methodId', () => {
  it('a two-long pfitzinger week sizes the midweek long below the primary (102-F1)', () => {
    const carmen = PERSONAS[2]
    const plan = generatePlanFromMethod(getMethodById('pfitzinger')!, buildConfig(carmen, 16), TODAY)
    const twoLongWeeks = plan.weeks.filter(w => w.days.filter(d => d.type === 'long').length === 2)
    expect(twoLongWeeks.length).toBeGreaterThan(0)
    for (const w of twoLongWeeks) {
      const longs = w.days.filter(d => d.type === 'long')
      const mins = longs.map(d => parseInt(d.time, 10)).filter(Number.isFinite)
      if (mins.length === 2) {
        // Midweek (first) long is meaningfully shorter than the weekend primary.
        expect(mins[0], `week ${w.num}: ${longs.map(l => l.time).join(' vs ')}`).toBeLessThan(mins[1] * 0.9)
      }
    }
  })

  it('generated plans carry their methodId', () => {
    const plan = generatePlanFromMethod(getMethodById('daniels')!, buildConfig(PERSONAS[0], 8), TODAY)
    expect(plan.methodId).toBe('daniels')
  })
})
