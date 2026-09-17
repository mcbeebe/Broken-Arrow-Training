/**
 * The week shape: the athlete decides which weekday carries which role and
 * every generator honors it — road/trail, Hyrox, General Fitness — while
 * an absent shape reproduces the engines' own layout (the golden snapshot
 * and ground-truth guard pin that). Validation mirrors the plan QA's laws.
 */
import { describe, it, expect } from 'vitest'
import {
  validateWeekShape, countRoles, applyShapeToSchedule, extraSlotsForDays, configWithShape,
  hyroxLayoutFromShape, generalLayoutFromShape, shapeFromDays, describeShape, changedWeekdays,
  type WeekShape,
} from '../../../engines/planGenerator/weekShape'
import { defaultWeekShapeFor, methodRunDayBounds } from '../../../engines/planGenerator/shapeDefaults'
import { generatePlanFromMethod } from '../../../engines/planGenerator/generatePlan'
import { generateHyroxPlan } from '../../../utils/planGenerator'
import { generateGeneralFitnessPlan } from '../../../engines/generalFitness'
import { getMethodById } from '../../../data/methods'
import type { OnboardingConfig } from '../../../hooks/useOnboarding'
import type { DaySchedule } from '../../../types/training-method'

const shape = (roles: string): WeekShape => {
  const r = roles.split(' ') as WeekShape[1][]
  return { 1: r[0], 2: r[1], 3: r[2], 4: r[3], 5: r[4], 6: r[5], 7: r[6] }
}

const road = (over: Partial<OnboardingConfig> = {}): OnboardingConfig => ({
  raceType: 'road', raceName: 'Test Half', raceDate: '2026-09-13', raceDistance: 'half_marathon',
  experienceLevel: 'intermediate', trainingDaysPerWeek: 5, longRunDay: 'Sunday',
  wearable: 'none', athleteName: 'Test', age: 38, maxHR: 184, completedAt: '',
  strengthDaysPerWeek: 1, crossTrainingModes: ['cycling'], crossTrainingDaysPerWeek: 1,
  ...over,
} as OnboardingConfig)

const weekRoles = (days: { day: string; type: string }[]) => days.map(d => `${d.day.slice(0, 3)}:${d.type}`).join(' ')

describe('validateWeekShape', () => {
  it('refuses a week with no rest day, fewer than three training days, or three hard days in a row (wrapping Sunday → Monday)', () => {
    expect(validateWeekShape(shape('run run run run run run long'), { plan: 'road' }).map(i => i.code)).toContain('no_rest')
    expect(validateWeekShape(shape('rest rest rest rest rest long rest'), { plan: 'road' }).map(i => i.code)).toContain('too_few_days')
    expect(validateWeekShape(shape('rest quality quality long rest run rest'), { plan: 'road' }).map(i => i.code)).toContain('three_hard')
    expect(validateWeekShape(shape('quality run rest run rest long quality'), { plan: 'road' }).map(i => i.code)).toContain('three_hard')
  })

  it('a race plan needs a long day; the warnings name what the engines will do', () => {
    const noLong = validateWeekShape(shape('rest quality run rest run run rest'), { plan: 'road' })
    expect(noLong.find(i => i.code === 'no_long')?.severity).toBe('error')
    const issues = validateWeekShape(shape('rest quality run strength long run rest'), { plan: 'road', methodRunDays: { min: 5, max: 6, name: 'Hansons' } })
    expect(issues.map(i => i.code)).toEqual(expect.arrayContaining(['strength_before_hard', 'run_days_out_of_range']))
    expect(issues.find(i => i.code === 'run_days_out_of_range')?.message).toContain('Hansons is written for 5–6 running days; you have 4')
    expect(issues.every(i => i.severity === 'warn')).toBe(true)
  })

  it('a clean shape has no issues', () => {
    expect(validateWeekShape(shape('rest quality run strength run long rest'), { plan: 'road', methodRunDays: { min: 3, max: 6 } })).toEqual([])
  })
})

describe('shape helpers', () => {
  it('counts roles, derives the config counts and long-run day, and describes changes', () => {
    const s = shape('rest quality run strength cross long rest')
    expect(countRoles(s)).toMatchObject({ long: 1, quality: 1, run: 1, strength: 1, cross: 1, rest: 2, running: 3, training: 5 })
    const cfg = configWithShape(road({ trainingDaysPerWeek: 3, longRunDay: 'Tuesday' }), s)
    expect(cfg).toMatchObject({ trainingDaysPerWeek: 5, strengthDaysPerWeek: 1, crossTrainingDaysPerWeek: 1, longRunDay: 'Saturday', weekShape: s })
    expect(describeShape(s)).toBe('Mon rest · Tue quality · Wed easy run · Thu strength · Fri cross-train · Sat long run · Sun rest')
    expect(changedWeekdays(s, { ...s, 2: 'run', 7: 'quality' })).toEqual([2, 7])
  })

  it('applyShapeToSchedule moves the pattern onto the shape and keeps each entry\'s content', () => {
    const pattern: DaySchedule[] = [
      { dayOfWeek: 1, category: 'rest' }, { dayOfWeek: 2, category: 'vo2_intervals', preferredWorkoutIds: ['x'] },
      { dayOfWeek: 3, category: 'easy' }, { dayOfWeek: 4, category: 'easy' }, { dayOfWeek: 5, category: 'easy' },
      { dayOfWeek: 6, category: 'easy' }, { dayOfWeek: 7, category: 'long' },
    ]
    const out = applyShapeToSchedule(pattern, shape('run rest strength quality rest long run'))
    expect(out.map(d => `${d.dayOfWeek}:${d.category}`)).toEqual(['1:easy', '2:rest', '3:rest', '4:vo2_intervals', '5:rest', '6:long', '7:easy'])
    expect(out[3].preferredWorkoutIds).toEqual(['x'])
    // A quality slot the pattern cannot fill becomes an easy run; two long slots take both longs.
    const twoQ = applyShapeToSchedule(pattern, shape('rest quality run quality rest long run'))
    expect(twoQ.map(d => d.category)).toEqual(['rest', 'vo2_intervals', 'easy', 'easy', 'rest', 'long', 'easy'])
  })

  it('extraSlotsForDays names only rest days on the shape\'s strength/cross weekdays', () => {
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d, i) => ({ day: `${d} 5/${i + 4}`, type: i === 1 || i === 5 ? 'run' : 'rest', workout: '', detail: '', zone: '', route: '', time: '' }))
    expect(extraSlotsForDays(days as never, shape('strength strength cross rest cross rest rest'))).toEqual({ strength: [0], cross: [2, 4] })
  })

  it('maps a shape onto the Hyrox and General Fitness vocabularies in weekday order', () => {
    expect(hyroxLayoutFromShape(shape('run strength quality rest cross long rest'))).toEqual({ trainingDayNumbers: [1, 2, 3, 5, 6], roles: ['run', 'strength', 'run_conditioning', 'stations', 'long'] })
    expect(hyroxLayoutFromShape(shape('run strength rest rest run long rest')).roles).toEqual(['run', 'strength_stations', 'easy', 'long'])
    expect(generalLayoutFromShape(shape('strength run rest quality rest long rest'))).toEqual({ slots: [1, 2, 4, 6], roles: ['strength', 'zone2', 'vo2max', 'long'] })
    expect(generalLayoutFromShape(shape('rest rest rest rest rest rest strength'))).toEqual({ slots: [0], roles: ['strength'] })
  })
})

describe('the generators honor a week shape', () => {
  const TODAY = '2026-05-10'

  it('road: every ordinary week follows the shape — quality Tue, strength Thu, cross Fri, long Sat, rest Mon/Sun', () => {
    const s = shape('rest quality run strength cross long rest')
    const method = getMethodById('daniels')!
    const plan = generatePlanFromMethod(method, road({ weekShape: s }), TODAY)
    const ordinary = plan.weeks.filter(w => w.days.length === 7 && !w.days.some(d => d.type === 'race'))
    expect(ordinary.length).toBeGreaterThan(8)
    for (const w of ordinary) {
      const got = shapeFromDays(w.days)!
      expect(got[1], `wk${w.num} Mon`).toBe('rest')
      expect(got[7], `wk${w.num} Sun`).toBe('rest')
      expect(got[6], `wk${w.num} Sat`).toBe('long')
      expect(got[4], `wk${w.num} Thu`).toBe('strength')
      expect(got[5], `wk${w.num} Fri`).toBe('cross')
      expect(['quality', 'run']).toContain(got[2])  // base weeks have no quality yet; easy stands in
      expect(got[3], `wk${w.num} Wed`).toBe('run')
    }
    // Build weeks do put the quality session on Tuesday.
    expect(ordinary.some(w => shapeFromDays(w.days)![2] === 'quality')).toBe(true)
    expect(plan.advisories?.filter(a => a.severity === 'critical') ?? []).toEqual([])
  })

  it('road: the shape overrides the config\'s counts — a 3-day config with a 5-day shape gets 5 training days', () => {
    const s = shape('rest quality run strength run long rest')
    const plan = generatePlanFromMethod(getMethodById('daniels')!, road({ trainingDaysPerWeek: 3, strengthDaysPerWeek: 0, crossTrainingModes: [], crossTrainingDaysPerWeek: 0, weekShape: s }), TODAY)
    const w = plan.weeks[2]
    expect(w.days.filter(d => d.type !== 'rest')).toHaveLength(5)
    expect(w.days.find(d => d.day.startsWith('Thu'))?.type).toBe('strength')
  })

  it('hyrox: training days and roles follow the shape (Sunday long, Wednesday stations)', () => {
    const cfg = {
      raceType: 'hyrox', raceName: 'Hyrox', raceDate: '2026-12-12', experienceLevel: 'intermediate', trainingDaysPerWeek: 4,
      wearable: 'none', athleteName: 'M', age: 45, maxHR: 178, completedAt: '',
      weekShape: shape('run strength cross rest quality rest long'),
    } as OnboardingConfig
    const plan = generateHyroxPlan(cfg, '2026-08-03')
    const w = plan.weeks[2]
    expect(weekRoles(w.days)).toBe('Mon:run Tue:strength Wed:cross Thu:rest Fri:run Sat:rest Sun:long')
    expect(w.days.filter(d => d.type !== 'rest')).toHaveLength(5)
  })

  it('general fitness: slots and pillars follow the shape', () => {
    const cfg = {
      raceType: 'general', raceName: 'My Fitness Plan', raceDate: '', generalGoal: 'build_endurance', cardioModality: 'running',
      experienceLevel: 'intermediate', trainingDaysPerWeek: 4, longRunDay: 'Saturday', wearable: 'none', athleteName: 'Test', age: 38, maxHR: 184, completedAt: '',
      weekShape: shape('strength run rest quality rest rest long'),
    } as OnboardingConfig
    const plan = generateGeneralFitnessPlan(cfg, '2026-05-11')
    const w = plan.weeks[1]
    const got = shapeFromDays(w.days)!
    expect(got[1]).toBe('strength')
    expect(got[2]).toBe('run')
    expect(got[4]).toBe('quality')
    expect(got[7]).toBe('long')
    expect([got[3], got[5], got[6]]).toEqual(['rest', 'rest', 'rest'])
  })

  it('the default shape is what the engine generates on its own, and round-trips through the generator unchanged', () => {
    const cfg = road()
    const def = defaultWeekShapeFor(cfg, TODAY)!
    expect(def[7]).toBe('long')  // longRunDay: Sunday
    expect(countRoles(def).training).toBeGreaterThanOrEqual(5)
    const again = defaultWeekShapeFor({ ...cfg, weekShape: def }, TODAY)
    expect(again).toEqual(def)
    expect(methodRunDayBounds(getMethodById('daniels')!)).toMatchObject({ min: 4, max: 6, name: expect.any(String) })
  })
})
