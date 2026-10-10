import { describe, it, expect } from 'vitest'
import { formatWeekMilesChip, formatWeekMilesHeader, getMilesNumber } from '../../utils/format'
import { generateGeneralFitnessPlan } from '../../engines/generalFitness'
import type { GeneralGoal, OnboardingConfig } from '../../hooks/useOnboarding'

/**
 * Field bug: General Fitness weeks give their volume as a time ("~95 min
 * cardio"), and every reader that pulls digits out of a week's `miles` showed
 * it as miles: the Plan week header read "~95 mi", the week "x of 95 mi
 * done", and the Progress chart, totals and Sunday recap counted 95 miles.
 * A time target is no mileage target, as an uploaded plan's "By time" week
 * already was; miles read as before.
 */

describe('a week\'s miles', () => {
  it.each([
    [32, '~32 mi', '32 mi', 32],
    [12.5, '~12.5 mi', '12.5 mi', 12.5],
    ['~7', '~7 mi', '7 mi', 7],
    ['20 mi', '~20 mi', '20 mi', 20],
    ['18 miles', '~18 mi', '18 mi', 18],
    ['~~7 mi', '~7 mi', '7 mi', 7],
    ['14+race', '~14 mi', '14 mi', 14],
    ['32mi', '~32 mi', '32 mi', 32],
    ['12.5', '~12.5 mi', '12.5 mi', 12.5],
    // Miles and minutes: the number given in miles, never the digits run
    // together (620), whichever comes first.
    ['6 mi + 20 min', '~6 mi', '6 mi', 6],
    ['20 min + 6 mi', '~6 mi', '6 mi', 6],
    ['8mi + 30 min', '~8 mi', '8 mi', 8],
    // Two numbers and no unit (a range the coach might write): the first.
    ['10-12', '~10 mi', '10 mi', 10],
  ])('miles stay miles: %j', (miles, header, chip, n) => {
    expect(formatWeekMilesHeader(miles)).toBe(header)
    expect(formatWeekMilesChip(miles)).toBe(chip)
    expect(getMilesNumber(miles)).toBe(n)
  })

  it.each(['~95 min cardio', '45 min', '~30 minutes', '60 mins cardio', '40 Min', '~60min cardio', '45min'])(
    'a time is shown as written and plans no miles: %j', miles => {
      expect(formatWeekMilesHeader(miles)).toBe(miles)
      expect(formatWeekMilesChip(miles)).toBe(miles)
      expect(getMilesNumber(miles)).toBe(0)
    },
  )

  it.each(['By time', 'Miles + time', 'Rest', 'No running'])('a label is shown as written and plans no miles: %j', miles => {
    expect(formatWeekMilesHeader(miles)).toBe(miles)
    expect(formatWeekMilesChip(miles)).toBe(miles)
    expect(getMilesNumber(miles)).toBe(0)
  })
})

describe('a General Fitness plan, through those readers', () => {
  const GOALS: GeneralGoal[] = ['stay_healthy', 'lose_fat', 'build_muscle', 'build_endurance']
  const config = (generalGoal: GeneralGoal, trainingDaysPerWeek: number) => ({
    raceType: 'general', raceName: 'My Fitness Plan', raceDate: '', generalGoal,
    experienceLevel: 'intermediate', trainingDaysPerWeek, longRunDay: 'Saturday', wearable: 'none',
    athleteName: 'Test', age: 38, maxHR: 184, completedAt: '',
  } as OnboardingConfig)

  it('every week reads as minutes of cardio, and never as miles', () => {
    let weeks = 0
    for (const goal of GOALS) {
      for (const days of [3, 4, 5, 6]) {
        for (const w of generateGeneralFitnessPlan(config(goal, days), '2026-06-08').weeks) {
          weeks++
          expect(w.miles, `${goal} ${days}d week ${w.num}`).toMatch(/^~\d+ min cardio$/)
          expect(formatWeekMilesHeader(w.miles)).toBe(w.miles)
          expect(formatWeekMilesChip(w.miles)).toBe(w.miles)
          expect(getMilesNumber(w.miles)).toBe(0)
        }
      }
    }
    expect(weeks).toBeGreaterThan(100)
  })
})
