/**
 * R14 (PR-7) — trail-first framing: trail long runs lead with time-on-feet; road
 * long runs don't.
 */
import { describe, it, expect } from 'vitest'
import { generatePlanFromMethod } from '../../engines/planGenerator/generatePlan'
import { daysMatching } from '../helpers/planAssert'
import type { TrainingMethod } from '../../types/training-method'
import danielsMethod from '../../data/methods/daniels.json'
import koopMethod from '../../data/methods/koop.json'

const daniels = danielsMethod as unknown as TrainingMethod
const koop = koopMethod as unknown as TrainingMethod
const TODAY = '2026-06-14'

describe('R14 — time-on-feet framing', () => {
  it('frames trail long runs by time on feet', () => {
    const plan = generatePlanFromMethod(koop, {
      raceType: 'trail', raceName: 'X', raceDate: '2026-12-26', raceDistance: '50_mile',
      raceDescription: 'rugged trail 50', experienceLevel: 'advanced', trainingDaysPerWeek: 6,
      currentWeeklyMileage: 40, wearable: 'none', athleteName: 'T', age: 35, completedAt: '',
    }, TODAY)
    // Distinctive R14 tag — not the stock "time on feet matters more than pace" philosophy line.
    expect(daysMatching(plan, /run by time on feet, not pace/i).length).toBeGreaterThan(0)
  })
  it('GUARD: road long runs are not reframed', () => {
    const plan = generatePlanFromMethod(daniels, {
      raceType: 'road', raceName: 'X', raceDate: '2026-10-18', raceDistance: 'marathon',
      experienceLevel: 'intermediate', trainingDaysPerWeek: 5, currentWeeklyMileage: 30,
      wearable: 'none', athleteName: 'T', age: 35, completedAt: '',
    }, TODAY)
    expect(daysMatching(plan, /run by time on feet, not pace/i)).toEqual([])
  })
})
