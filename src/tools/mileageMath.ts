import { generatePlanFromMethod } from '../engines/planGenerator/generatePlan'
import { getMethodById } from '../data/methods'
import { addDays, mondayOnOrBefore, todayDateString } from '../utils/planDates'
import type { OnboardingConfig } from '../hooks/useOnboarding'

/**
 * The weekly mileage planner's math (initiative 003 PR 4c). It is the app's
 * own plan generator, run for one stated athlete, not a copy of its ramp:
 * the weekly targets and long runs are exactly what Attune would plan for
 * that athlete. Kept out of toolMath.ts so the other tool pages don't load
 * the generator. Pure: no network, no storage.
 */

/** The one method the planner uses: rated for every road distance it offers. */
export const MILEAGE_METHOD_ID = 'daniels'

/** Road distances the planner offers, as the app's RaceDistance ids. */
export const MILEAGE_DISTANCES = [
  { id: '5k', label: '5K', miles: 3.1 },
  { id: '10k', label: '10K', miles: 6.2 },
  { id: 'half_marathon', label: 'Half marathon', miles: 13.1 },
  { id: 'marathon', label: 'Marathon', miles: 26.2 },
] as const

export type MileageDistance = (typeof MILEAGE_DISTANCES)[number]['id']

/** The inputs the page accepts; outside them it asks again instead of planning. */
export const MILEAGE_LIMITS = { minMi: 5, maxMi: 200, minWeeks: 4, maxWeeks: 24 } as const

export interface MileageWeek {
  week: number
  miles: number
  /** This week's long run, from the app's long-run card; 0 if the week has none. */
  longRunMi: number
  /** Lower than the week before: a recovery week or the taper. Drawn lighter. */
  easier: boolean
}

export interface MileagePlan {
  weeks: MileageWeek[]
  startMi: number
  peakMi: number
  /** 1-based week of the first week at peak. */
  peakWeek: number
  longestRunMi: number
}

/**
 * The athlete the planner plans for: an intermediate runner, 35, on 5 days a
 * week, healthy, no recent race time, racing on the Saturday that ends week
 * N (week 1 is this week). The page states these assumptions.
 */
export function mileageAthlete(distance: MileageDistance, currentWeeklyMi: number, raceDate: string): OnboardingConfig {
  const d = MILEAGE_DISTANCES.find(x => x.id === distance)!
  return {
    raceType: 'road',
    raceName: 'Your race',
    raceDate,
    raceDistance: distance,
    raceDistanceMiles: d.miles,
    selectedMethodId: MILEAGE_METHOD_ID,
    experienceLevel: 'intermediate',
    trainingDaysPerWeek: 5,
    longRunDay: 'Saturday',
    wearable: 'none',
    athleteName: '',
    age: 35,
    currentWeeklyMileage: currentWeeklyMi,
    completedAt: '',
  } as OnboardingConfig
}

/** The Saturday that ends week `n`, where week 1 is the week containing `today`. */
export function raceSaturday(today: string, n: number): string {
  return addDays(mondayOnOrBefore(today), (n - 1) * 7 + 5)
}

const LONG_RUN = /Long run ~([\d.]+) mi/

/** A week's planned miles: the generator's target, or its displayed figure on a week without one. */
function weekMiles(w: { targetMi?: number; miles: number | string }): number {
  return w.targetMi ?? (Number(w.miles) || 0)
}

/**
 * Attune's plan for a road race, week by week: what the app's generator
 * plans for the athlete in `mileageAthlete`. The generator snaps the plan to
 * the method's supported lengths, so a plan can be a week shorter than the
 * runway. Null for input the page doesn't plan (see MILEAGE_LIMITS).
 */
export function mileagePlan(
  distance: MileageDistance,
  currentWeeklyMi: number,
  weeksToRace: number,
  today: string = todayDateString(),
): MileagePlan | null {
  const method = getMethodById(MILEAGE_METHOD_ID)
  const { minMi, maxMi, minWeeks, maxWeeks } = MILEAGE_LIMITS
  if (!method || !isFinite(currentWeeklyMi) || currentWeeklyMi < minMi || currentWeeklyMi > maxMi) return null
  if (!Number.isInteger(weeksToRace) || weeksToRace < minWeeks || weeksToRace > maxWeeks) return null
  const plan = generatePlanFromMethod(method, mileageAthlete(distance, currentWeeklyMi, raceSaturday(today, weeksToRace)), today)
  const weeks: MileageWeek[] = plan.weeks.map((w, i, all) => {
    const miles = weekMiles(w)
    const prev = i > 0 ? weekMiles(all[i - 1]) : miles
    const long = w.days.find(d => d.type === 'long')?.detail.match(LONG_RUN)
    return { week: i + 1, miles, longRunMi: long ? Number(long[1]) : 0, easier: i > 0 && miles < prev }
  })
  if (!weeks.length) return null
  const peakMi = Math.max(...weeks.map(w => w.miles))
  return {
    weeks,
    startMi: weeks[0].miles,
    peakMi,
    peakWeek: weeks.findIndex(w => w.miles === peakMi) + 1,
    longestRunMi: Math.max(...weeks.map(w => w.longRunMi)),
  }
}
