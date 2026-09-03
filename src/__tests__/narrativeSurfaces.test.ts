/**
 * N2 — the narrative surfaces. Two deterministic engines feed them:
 * `todayNarrative` (home screen: what today is for, how it fits the week,
 * where the week sits in the arc) and `seasonStructure` (the Plan tab's
 * Season sub-view: the plan as a shape, block by block).
 *
 * The third thing under test is a copy bug these surfaces would have
 * amplified: the narrative asserted climbing and descending for every
 * race, which on an indoor Hyrox floor produced "strength work protects
 * against the pounding of Flat (indoor) descending".
 */
import { describe, it, expect } from 'vitest'
import { generateTodayNarrative, hasRealVert } from '../utils/todayNarrative'
import { buildSeasonStructure, blockForWeek } from '../utils/seasonStructure'
import { generateRaceNarrative } from '../utils/raceNarrative'
import { generatePlanFromMethod } from '../engines/planGenerator/generatePlan'
import { generateHyroxPlan } from '../utils/planGenerator'
import { getMethodById } from '../data/methods'
import { TODAY, PERSONAS, buildConfig } from './helpers/roadPersonas'
import type { OnboardingConfig } from '../hooks/useOnboarding'
import type { RaceInfo, TrainingWeek } from '../types'

const carmen = PERSONAS.find(p => p.label.startsWith('Carmen'))!
const roadPlan = generatePlanFromMethod(getMethodById('pfitzinger')!, buildConfig(carmen, 16), TODAY)

const hyroxPlan = generateHyroxPlan({
  raceType: 'hyrox',
  raceName: 'Hyrox Anaheim',
  raceDate: '2026-12-05',
  experienceLevel: 'intermediate',
  trainingDaysPerWeek: 5,
  longRunDay: 'Saturday',
  wearable: 'garmin',
  athleteName: 'Mike',
  age: 45,
  maxHR: 200,
  equipmentAccess: ['gym'],
  completedAt: '',
} as OnboardingConfig, '2026-09-01') // explicit `today` — no wall clock

const findDay = (weeks: TrainingWeek[], wi: number, type: string) =>
  weeks[wi].days.find(d => d.type === type) ?? null

describe('todayNarrative — what today is for', () => {
  const week = roadPlan.weeks[3]

  it('names the session role and never returns empty prose', () => {
    for (const type of ['run', 'quality', 'long', 'rest']) {
      const day = roadPlan.weeks.flatMap(w => w.days).find(d => d.type === type)
      if (!day) continue
      const n = generateTodayNarrative({
        day, week, weekNum: 4, totalWeeks: roadPlan.weeks.length, race: roadPlan.race, todayIso: TODAY,
      })!
      expect(n, type).toBeTruthy()
      for (const [k, v] of Object.entries(n)) {
        expect(v.length, `${type}.${k}`).toBeGreaterThan(20)
      }
    }
  })

  it('a rest day is framed as training, not as nothing', () => {
    const rest = roadPlan.weeks.flatMap(w => w.days).find(d => d.type === 'rest')!
    const n = generateTodayNarrative({
      day: rest, week, weekNum: 4, totalWeeks: roadPlan.weeks.length, race: roadPlan.race, todayIso: TODAY,
    })!
    expect(n.headline).toMatch(/rest/i)
    expect(n.today).toMatch(/absorb|adaptation/i)
  })

  it('the quality day is named as the week’s key session, the easy day is not', () => {
    const q = roadPlan.weeks.flatMap(w => w.days).find(d => d.type === 'quality')!
    const e = roadPlan.weeks.flatMap(w => w.days).find(d => d.type === 'run')!
    const qn = generateTodayNarrative({ day: q, week, weekNum: 4, totalWeeks: 16, race: roadPlan.race, todayIso: TODAY })!
    const en = generateTodayNarrative({ day: e, week, weekNum: 4, totalWeeks: 16, race: roadPlan.race, todayIso: TODAY })!
    expect(qn.headline).toMatch(/key session/i)
    expect(en.headline).not.toMatch(/key session/i)
    expect(en.today).toMatch(/easy/i)
  })

  it('the arc paragraph moves through base → build → taper as the plan progresses', () => {
    const day = findDay(roadPlan.weeks, 2, 'run')!
    const at = (weekNum: number) => generateTodayNarrative({
      day, week: roadPlan.weeks[weekNum - 1], weekNum, totalWeeks: 16, race: roadPlan.race, todayIso: TODAY,
    })!.arc
    expect(at(2)).toMatch(/base/i)
    expect(at(8)).toMatch(/build/i)
    expect(at(16)).toMatch(/taper/i)
  })

  it('returns null when there is no plan day to talk about', () => {
    expect(generateTodayNarrative({
      day: null, week, weekNum: 1, totalWeeks: 16, race: roadPlan.race, todayIso: TODAY,
    })).toBeNull()
  })
})

describe('seasonStructure — the plan as a shape', () => {
  const s = buildSeasonStructure(roadPlan, { todayIso: TODAY })

  it('covers every week exactly once, in order, with no gaps', () => {
    const covered: number[] = []
    for (const b of s.blocks) {
      for (let w = b.weekFrom; w <= b.weekTo; w++) covered.push(w)
    }
    expect(covered).toEqual(roadPlan.weeks.map((_, i) => i + 1))
  })

  it('every block carries a job in plain English and a week range', () => {
    expect(s.blocks.length).toBeGreaterThan(1)
    for (const b of s.blocks) {
      expect(b.job.length, b.label).toBeGreaterThan(60)
      expect(b.weekTo).toBeGreaterThanOrEqual(b.weekFrom)
    }
  })

  it('ends with taper then race week — the plan always lands somewhere', () => {
    const ids = s.blocks.map(b => b.id)
    expect(ids[ids.length - 1]).toBe('race')
    expect(ids).toContain('taper')
  })

  it('agrees with the Race view about which block a week belongs to', () => {
    // Both surfaces must classify identically or they contradict each
    // other on the same screen-swipe.
    for (let w = 1; w <= roadPlan.weeks.length; w++) {
      const block = s.blocks.find(b => w >= b.weekFrom && w <= b.weekTo)!
      expect(block.id, `week ${w}`).toBe(blockForWeek(w, roadPlan.weeks.length))
    }
  })

  it('reports peak volume and total miles from the weeks themselves', () => {
    const mi = roadPlan.weeks.map(w => Number(w.miles) || 0)
    expect(s.peakWeekMiles).toBe(Math.round(Math.max(...mi)))
    expect(s.totalMiles).toBe(Math.round(mi.reduce((a, b) => a + b, 0)))
  })

  it('marks exactly one block as current when today falls inside the plan', () => {
    const live = buildSeasonStructure(roadPlan, { todayIso: roadPlan.weeks[5].startIso! })
    expect(live.blocks.filter(b => b.isCurrent)).toHaveLength(1)
    expect(live.position?.weekNum).toBe(6)
  })

  it('has no current block when today sits outside the plan window', () => {
    const past = buildSeasonStructure(roadPlan, { todayIso: '2020-01-01' })
    expect(past.position).toBeNull()
    expect(past.blocks.some(b => b.isCurrent)).toBe(false)
  })

  it('works on a Hyrox plan too (different engine, same shape)', () => {
    const h = buildSeasonStructure(hyroxPlan, { todayIso: TODAY })
    expect(h.blocks.length).toBeGreaterThan(1)
    expect(h.blocks.map(b => b.id)).toContain('base')
  })
})

describe('flat courses stop being told about descending', () => {
  const flat: RaceInfo = { ...hyroxPlan.race, format: 'hyrox', elevation: 'Flat (indoor)', elevationRange: '' }
  const mountain: RaceInfo = {
    ...roadPlan.race, format: 'trail', elevation: '5,200 ft', elevationGainFt: 5200,
  }

  it('hasRealVert distinguishes a mountain from an indoor floor', () => {
    expect(hasRealVert(mountain)).toBe(true)
    expect(hasRealVert(flat)).toBe(false)
    expect(hasRealVert({ ...flat, elevation: '300 ft' })).toBe(false)
    expect(hasRealVert(null)).toBe(false)
  })

  it('the base-phase narrative never mentions descending or vertical on a flat race', () => {
    const n = generateRaceNarrative({
      race: flat, weekNum: 2, totalWeeks: 15, weeks: hyroxPlan.weeks, todayIso: TODAY,
    })
    const all = n.paragraphs.join(' ')
    expect(all).not.toMatch(/descending|increasing vertical|of climbing/i)
  })

  it('a mountain race still gets the climbing copy', () => {
    const n = generateRaceNarrative({
      race: mountain, weekNum: 2, totalWeeks: 16, weeks: roadPlan.weeks, todayIso: TODAY,
    })
    expect(n.paragraphs.join(' ')).toMatch(/descending|vertical|climbing/i)
  })

  it('the today-narrative long-run copy only invokes descending when there is vert', () => {
    const long = roadPlan.weeks.flatMap(w => w.days).find(d => d.type === 'long')!
    const onFlat = generateTodayNarrative({
      day: long, week: roadPlan.weeks[3], weekNum: 4, totalWeeks: 16, race: flat, todayIso: TODAY,
    })!
    const onMountain = generateTodayNarrative({
      day: long, week: roadPlan.weeks[3], weekNum: 4, totalWeeks: 16, race: mountain, todayIso: TODAY,
    })!
    expect(onFlat.today).not.toMatch(/descending|quads/i)
    expect(onMountain.today).toMatch(/descending/i)
  })
})
