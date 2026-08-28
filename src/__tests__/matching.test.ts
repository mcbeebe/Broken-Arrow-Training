import { describe, it, expect } from 'vitest'
import {
  matchActivitiesToPlan,
  mergeGarminDetailIntoWeeks,
  isDuplicateActual,
  mergeAppleActivitiesIntoWeeks,
  canClaimPlannedDay,
  ergPrimaryDay,
  isGymBasedDay,
  plannedDurationSec,
} from '../utils/matching'
import { mikePlan } from '../data'
import type { StravaActivity, GarminActivityDetail, PlannedDay, TrainingWeek } from '../types'

function makeActivity(overrides: Partial<StravaActivity> = {}): StravaActivity {
  return {
    id: 1,
    name: 'Morning Run',
    type: 'Run',
    sport_type: 'Run',
    distance: 4828, // ~3 miles
    moving_time: 2700,
    elapsed_time: 3000,
    total_elevation_gain: 50,
    average_heartrate: 135,
    max_heartrate: 155,
    start_date_local: '2026-04-14T07:00:00Z',
    start_date: '2026-04-14T14:00:00Z',
    ...overrides,
  }
}

describe('matchActivitiesToPlan', () => {
  it('returns unmodified weeks when no activities', () => {
    const result = matchActivitiesToPlan(mikePlan.weeks, [])
    expect(result[0].days[0].actual).toBeUndefined()
  })

  it('matches activity to correct day by date', () => {
    // Tue 4/14 = Week 1, Day 2 (Easy run)
    const activity = makeActivity({ start_date_local: '2026-04-14T07:00:00Z' })
    const result = matchActivitiesToPlan(mikePlan.weeks, [activity])
    expect(result[0].days[1].actual).toBeDefined()
    expect(result[0].days[1].actual!.stravaId).toBe(1)
  })

  it('does not match activity to wrong date', () => {
    const activity = makeActivity({ start_date_local: '2026-04-14T07:00:00Z' })
    const result = matchActivitiesToPlan(mikePlan.weeks, [activity])
    // Mon 4/13 should have no match
    expect(result[0].days[0].actual).toBeUndefined()
  })

  it('converts distance from meters to miles', () => {
    const activity = makeActivity({ distance: 4828 }) // 4828m ≈ 3 mi
    const result = matchActivitiesToPlan(mikePlan.weeks, [activity])
    const actual = result[0].days[1].actual!
    expect(actual.distance).toBeCloseTo(3, 0)
  })

  it('converts elevation from meters to feet', () => {
    const activity = makeActivity({ total_elevation_gain: 100 }) // 100m ≈ 328 ft
    const result = matchActivitiesToPlan(mikePlan.weeks, [activity])
    const actual = result[0].days[1].actual!
    expect(actual.elevationGain).toBeCloseTo(328, 0)
  })

  it('preserves HR data', () => {
    const activity = makeActivity({ average_heartrate: 142, max_heartrate: 165 })
    const result = matchActivitiesToPlan(mikePlan.weeks, [activity])
    const actual = result[0].days[1].actual!
    expect(actual.avgHR).toBe(142)
    expect(actual.maxHR).toBe(165)
  })

  it('prefers type-matched activity when multiple on same day', () => {
    const run = makeActivity({ id: 1, type: 'Run', sport_type: 'Run', start_date_local: '2026-04-14T07:00:00Z' })
    const ride = makeActivity({ id: 2, type: 'Ride', sport_type: 'Ride', start_date_local: '2026-04-14T18:00:00Z' })
    const result = matchActivitiesToPlan(mikePlan.weeks, [run, ride])
    // Day 2 (Tue 4/14) is an easy run — should match the Run, not the Ride
    expect(result[0].days[1].actual!.stravaId).toBe(1)
  })
})

function makeGarminDetail(overrides: Partial<GarminActivityDetail> = {}): GarminActivityDetail {
  return {
    activityId: 1,
    name: 'Activity',
    type: 'running',
    startTimeLocal: '2026-04-14T07:00:00',
    durationSeconds: 1800,
    movingDurationSeconds: 1800,
    averageHR: 130,
    maxHR: 150,
    distanceMeters: 4828,
    elevationGainMeters: 30,
    elevationLossMeters: 30,
    calories: 250,
    ...overrides,
  }
}

describe('mergeGarminDetailIntoWeeks — multi-activity selection', () => {
  // Mon 4/13 is a strength day in mikePlan (Week 1 Day 1).
  const STRENGTH_DATE = '2026-04-13'

  it('drops sub-2-min stub activities (deleted-on-watch artifacts)', () => {
    const stub = makeGarminDetail({
      activityId: 999,
      type: 'hiking',
      durationSeconds: 60,
      movingDurationSeconds: 60,
    })
    const real = makeGarminDetail({
      activityId: 100,
      type: 'strength_training',
      durationSeconds: 2520,
      movingDurationSeconds: 1380,
    })
    const result = mergeGarminDetailIntoWeeks(mikePlan.weeks, {
      [STRENGTH_DATE]: [stub, real],
    })
    const day = result[0].days[0]
    expect(day.actual?.garminId).toBe(100)
    expect(day.secondaryActuals ?? []).toHaveLength(0)
  })

  it('picks the heaviest-scored matching activity, not the first', () => {
    // Three activities, all > 2 min. Strength day plan.
    const warmup = makeGarminDetail({
      activityId: 1,
      type: 'treadmill_running',
      durationSeconds: 300,
      movingDurationSeconds: 300,
      averageHR: 100,
    })
    const strength = makeGarminDetail({
      activityId: 2,
      type: 'strength_training',
      durationSeconds: 2520,
      movingDurationSeconds: 1380,
      averageHR: 130,
    })
    const result = mergeGarminDetailIntoWeeks(mikePlan.weeks, {
      [STRENGTH_DATE]: [warmup, strength],
    })
    const day = result[0].days[0]
    // Strength matches plan type AND scores higher than the running warm-up
    expect(day.actual?.garminId).toBe(2)
  })

  it('refuses to claim when no activity matches the plan modality — surfaces all as secondaries', () => {
    // Strength day, but only a run and a ride were recorded. The old code
    // "fell back to the highest-scored anyway", which is exactly how a
    // 13-min e-bike ride once auto-completed a 45-min station circuit.
    // Now: the day stays incomplete, nothing recorded disappears.
    const short = makeGarminDetail({ activityId: 1, type: 'running', durationSeconds: 600, movingDurationSeconds: 600 })
    const long = makeGarminDetail({ activityId: 2, type: 'cycling', durationSeconds: 3600, movingDurationSeconds: 3600 })
    const result = mergeGarminDetailIntoWeeks(mikePlan.weeks, {
      [STRENGTH_DATE]: [short, long],
    })
    const day = result[0].days[0]
    expect(day.actual).toBeUndefined()
    expect(day.secondaryActuals?.map(s => s.garminId).sort()).toEqual([1, 2])
  })

  it('never enriches an actual from a DIFFERENT session — the ride becomes a secondary', () => {
    // The old behavior merged the highest-scored detail's biometrics into
    // whatever held the day (a bike ride's HR onto a gym session; in the
    // field, a 1km erg TT swallowed by a warm-up treadmill run). Cross-
    // session enrichment is forbidden: the actual stays untouched and the
    // other session surfaces as a secondary.
    const claimed = structuredClone(mikePlan.weeks)
    claimed[0].days[0].actual = {
      stravaId: 0, source: 'manual', distance: 0, movingTime: 2400,
      elapsedTime: 2400, elevationGain: 0, type: 'strength', name: 'Gym session',
      startDate: `${STRENGTH_DATE}T08:00:00`,
    }
    const ride = makeGarminDetail({ activityId: 7, type: 'cycling', durationSeconds: 3600, movingDurationSeconds: 3600, averageHR: 141 })
    const result = mergeGarminDetailIntoWeeks(claimed, { [STRENGTH_DATE]: [ride] })
    const day = result[0].days[0]
    expect(day.actual?.avgHR).toBeUndefined() // untouched
    expect(day.actual?.name).toBe('Gym session')
    expect((day.secondaryActuals ?? []).map(a => a.type)).toEqual(['cycling'])
  })

  it('THE erg-TT field case: the erg takes over its erg-primary day from a warm-up run', () => {
    // Day: "BENCHMARK: 1km erg time trial". A treadmill warm-up (another
    // source) already holds the day; Garmin has the same treadmill AND the
    // 3:34 Indoor Rowing with 0 m distance (unpaired erg). The rowing has
    // earned the erg-primary claim: it becomes the actual, the treadmill
    // is demoted to one deduped secondary.
    const weeks = structuredClone(mikePlan.weeks)
    const dayIdx = 1 // Tue 4/14
    weeks[0].days[dayIdx] = {
      ...weeks[0].days[dayIdx],
      type: 'quality',
      workout: 'BENCHMARK: 1km erg time trial',
      route: 'Gym',
      time: '25 min',
      actual: {
        stravaId: 5, source: 'strava', distance: 0.9, movingTime: 540,
        elapsedTime: 560, elevationGain: 0, type: 'Run', name: 'Treadmill warm-up',
        startDate: '2026-04-14T07:00:00', avgHR: 158,
      },
    }
    const result = mergeGarminDetailIntoWeeks(weeks, {
      '2026-04-14': [
        makeGarminDetail({ activityId: 21, type: 'treadmill_running', durationSeconds: 545, movingDurationSeconds: 545, averageHR: 158 }),
        makeGarminDetail({ activityId: 22, type: 'indoor_rowing', durationSeconds: 214, movingDurationSeconds: 214, averageHR: 169, maxHR: 193, distanceMeters: 0 }),
      ],
    })
    const day = result[0].days[dayIdx]
    expect(day.actual?.type).toBe('indoor_rowing')
    expect(day.actual?.movingTime).toBe(214)
    // Exactly one secondary: the warm-up run, not a duplicate pair.
    expect((day.secondaryActuals ?? []).filter(a => /run/i.test(a.type ?? ''))).toHaveLength(1)
  })

  it('exposes non-primary activities in secondaryActuals', () => {
    const warmup = makeGarminDetail({ activityId: 1, type: 'treadmill_running', durationSeconds: 300, movingDurationSeconds: 300 })
    const strength = makeGarminDetail({ activityId: 2, type: 'strength_training', durationSeconds: 2520, movingDurationSeconds: 1380 })
    const result = mergeGarminDetailIntoWeeks(mikePlan.weeks, {
      [STRENGTH_DATE]: [warmup, strength],
    })
    const day = result[0].days[0]
    expect(day.secondaryActuals).toBeDefined()
    expect(day.secondaryActuals).toHaveLength(1)
    expect(day.secondaryActuals![0].garminId).toBe(1)
  })

  it('does not populate secondaryActuals when only one activity remains after filtering', () => {
    const stub = makeGarminDetail({ activityId: 999, type: 'hiking', durationSeconds: 30, movingDurationSeconds: 30 })
    const real = makeGarminDetail({ activityId: 100, type: 'strength_training', durationSeconds: 2520, movingDurationSeconds: 1380 })
    const result = mergeGarminDetailIntoWeeks(mikePlan.weeks, {
      [STRENGTH_DATE]: [stub, real],
    })
    const day = result[0].days[0]
    expect(day.secondaryActuals).toBeUndefined()
  })

  it('drops everything when all activities are stubs', () => {
    const stub1 = makeGarminDetail({ activityId: 1, durationSeconds: 30, movingDurationSeconds: 30 })
    const stub2 = makeGarminDetail({ activityId: 2, durationSeconds: 60, movingDurationSeconds: 60 })
    const result = mergeGarminDetailIntoWeeks(mikePlan.weeks, {
      [STRENGTH_DATE]: [stub1, stub2],
    })
    const day = result[0].days[0]
    expect(day.actual).toBeUndefined()
    expect(day.secondaryActuals).toBeUndefined()
  })
})

// ─── Claim eligibility — the e-bike-vs-station-circuit field bug ───────
//
// Friday's plan: 'Station circuit (intro)', type cross, route Gym, 45 min.
// Recorded: a 13-minute 'Oakland eBiking' ride. The app marked the circuit
// complete. These tests pin the fix across all three source paths.

function makeDay(overrides: Partial<PlannedDay> = {}): PlannedDay {
  return {
    day: 'Fri 8/21',
    type: 'cross',
    workout: 'Station circuit (intro)',
    detail: 'Sled push 4×15m · Wall balls 3×15 · Farmer carry 3×40m · Rest 2 min between',
    zone: 'Z2',
    route: 'Gym',
    time: '45 min',
    ...overrides,
  }
}

function makeWeek(days: PlannedDay[]): TrainingWeek {
  return { num: 1, dates: 'Aug 17–23', startIso: '2026-08-17', miles: 10, focus: 'Build', days }
}

describe('cross-source duplicate suppression', () => {
  it('isDuplicateActual: same session from two sources, not different work', () => {
    const run = { type: 'Run', movingTime: 540 }
    expect(isDuplicateActual(run, { type: 'treadmill_running', movingTime: 545 })).toBe(true)
    expect(isDuplicateActual(run, { type: 'Indoor Rowing', movingTime: 540 })).toBe(false)
    expect(isDuplicateActual(run, { type: 'Run', movingTime: 2400 })).toBe(false)
  })

  it('THE field case: the main workout is never re-listed as a secondary', () => {
    // Strava claims the day; the identical Garmin recording of the SAME
    // session must enrich it, not appear under "other activities".
    const activity = makeActivity({ start_date_local: '2026-04-14T07:00:00Z', moving_time: 1800 })
    const afterStrava = matchActivitiesToPlan(mikePlan.weeks, [activity])
    const merged = mergeGarminDetailIntoWeeks(afterStrava, {
      '2026-04-14': [makeGarminDetail({ activityId: 9, type: 'treadmill_running', movingDurationSeconds: 1810 })],
    })
    const day = merged[0].days[1]
    expect(day.actual).toBeDefined()
    expect(day.secondaryActuals ?? []).toHaveLength(0)
  })

  it('a genuinely different second activity stays a secondary', () => {
    const activity = makeActivity({ start_date_local: '2026-04-14T07:00:00Z', moving_time: 1800 })
    const afterStrava = matchActivitiesToPlan(mikePlan.weeks, [activity])
    const merged = mergeGarminDetailIntoWeeks(afterStrava, {
      '2026-04-14': [
        makeGarminDetail({ activityId: 9, type: 'treadmill_running', movingDurationSeconds: 1810 }),
        makeGarminDetail({ activityId: 10, type: 'indoor_rowing', movingDurationSeconds: 300, distanceMeters: 1000 }),
      ],
    })
    const day = merged[0].days[1]
    expect((day.secondaryActuals ?? []).map(a => a.type)).toEqual(['indoor_rowing'])
  })
})

describe('canClaimPlannedDay', () => {
  const circuit = makeDay()

  it('classifies the generator’s gym days as gym-based', () => {
    expect(isGymBasedDay(makeDay())).toBe(true)
    expect(isGymBasedDay(makeDay({ route: 'Track', workout: 'Station circuit (4 stations)' }))).toBe(true)
    expect(isGymBasedDay(makeDay({ route: 'Lake loop', workout: 'Bike or swim' }))).toBe(false)
  })

  it('a coach-edited RUN day with a stale Gym route is a run day, not a gym day', () => {
    // replayEdits updates type/workout/detail but leaves the old route
    // behind — the sync-preserves-edits pipeline depends on this.
    const edited = makeDay({ type: 'run', workout: 'Easy run', time: '50 min' }) // route still 'Gym'
    expect(isGymBasedDay(edited)).toBe(false)
    expect(canClaimPlannedDay(edited, 'running', 3000)).toBe(true)
  })

  it('parses planned session length', () => {
    expect(plannedDurationSec(makeDay({ time: '45 min' }))).toBe(2700)
    expect(plannedDurationSec(makeDay({ time: '1 hr 15 min' }))).toBe(4500)
    expect(plannedDurationSec(makeDay({ time: '1 hr' }))).toBe(3600)
    expect(plannedDurationSec(makeDay({ time: '—' }))).toBe(0)
  })

  it('THE benchmark case: a standalone ~5-min 1km TT claims its BENCHMARK day', () => {
    // The TT IS the day. Before this exemption a 300s recording lost to
    // the 40% duration-share gate (45-min prescription -> 1080s floor)
    // and vanished into secondaryActuals, invisible to every engine.
    const bench = makeDay({
      type: 'quality', route: 'Track',
      workout: 'BENCHMARK: 1km time trial + erg baseline', time: '45-50 min',
    })
    expect(canClaimPlannedDay(bench, 'Run', 300)).toBe(true)
    // Modality still gates: a ride cannot claim it, and junk taps stay out.
    expect(canClaimPlannedDay(bench, 'Ride', 300)).toBe(false)
    expect(canClaimPlannedDay(bench, 'Run', 45)).toBe(false)
  })

  it('THE field case: a 13-min e-bike ride cannot claim a 45-min gym circuit', () => {
    expect(canClaimPlannedDay(circuit, 'EBikeRide', 13 * 60)).toBe(false)
  })

  it('no amount of riding completes a gym day — even a long real ride', () => {
    expect(canClaimPlannedDay(circuit, 'Ride', 3600)).toBe(false)
  })

  it('gym-flavored work claims the circuit; runs and rides do not', () => {
    expect(canClaimPlannedDay(circuit, 'WeightTraining', 2400)).toBe(true)
    expect(canClaimPlannedDay(circuit, 'Workout', 2400)).toBe(true)
    expect(canClaimPlannedDay(circuit, 'Run', 2400)).toBe(false)
  })

  it('duration gate: right modality but under 40% of the prescription is a warm-up, not the workout', () => {
    expect(canClaimPlannedDay(circuit, 'WeightTraining', 10 * 60)).toBe(false)  // 10 of 45 min
    expect(canClaimPlannedDay(circuit, 'WeightTraining', 20 * 60)).toBe(true)   // 20 of 45 min
  })

  it('run-class days take runs only', () => {
    const runDay = makeDay({ type: 'run', workout: 'Easy run', route: 'Neighborhood', time: '40 min' })
    expect(canClaimPlannedDay(runDay, 'Run', 2400)).toBe(true)
    expect(canClaimPlannedDay(runDay, 'Ride', 2400)).toBe(false)
    expect(canClaimPlannedDay(runDay, 'EBikeRide', 2400)).toBe(false)
  })

  it('non-gym cross days stay broad — the ONE place an e-bike can complete something', () => {
    const crossDay = makeDay({ workout: 'Bike or swim', route: 'Your choice', time: '40 min' })
    expect(canClaimPlannedDay(crossDay, 'Ride', 2400)).toBe(true)
    expect(canClaimPlannedDay(crossDay, 'EBikeRide', 2400)).toBe(true)
    expect(canClaimPlannedDay(crossDay, 'Swim', 2400)).toBe(true)
  })

  it('rest days keep attach-anything behavior — there is no prescription to falsely complete', () => {
    const restDay = makeDay({ type: 'rest', workout: 'Rest', route: '—', time: '—' })
    expect(canClaimPlannedDay(restDay, 'EBikeRide', 600)).toBe(true)
  })
})

describe('matchActivitiesToPlan — earned claims (Strava path)', () => {
  const CIRCUIT_DATE = '2026-08-21'

  function stravaOn(date: string, overrides: Partial<StravaActivity> = {}): StravaActivity {
    return makeActivity({
      start_date_local: `${date}T17:00:00Z`,
      start_date: `${date}T17:00:00Z`,
      ...overrides,
    })
  }

  it('THE field case end-to-end: e-bike ride leaves the circuit incomplete but visible as a secondary', () => {
    const weeks = [makeWeek([makeDay()])]
    const ebike = stravaOn(CIRCUIT_DATE, {
      id: 42, name: 'Oakland eBiking', type: 'EBikeRide', sport_type: 'EBikeRide',
      moving_time: 13 * 60, elapsed_time: 14 * 60, distance: 5311,
    })
    const result = matchActivitiesToPlan(weeks, [ebike])
    const day = result[0].days[0]
    expect(day.actual).toBeUndefined()
    expect(day.secondaryActuals).toHaveLength(1)
    expect(day.secondaryActuals![0].name).toBe('Oakland eBiking')
  })

  it('a single non-matching activity no longer claims by default (the length===1 shortcut is gone)', () => {
    const runDay = makeDay({ type: 'run', workout: 'Easy run', route: 'Neighborhood', time: '40 min' })
    const weeks = [makeWeek([runDay])]
    const ride = stravaOn(CIRCUIT_DATE, { id: 9, type: 'Ride', sport_type: 'Ride', moving_time: 3600 })
    const result = matchActivitiesToPlan(weeks, [ride])
    expect(result[0].days[0].actual).toBeUndefined()
    expect(result[0].days[0].secondaryActuals).toHaveLength(1)
  })

  it('a real strength session still claims the circuit, with the e-bike as secondary', () => {
    const weeks = [makeWeek([makeDay()])]
    const ebike = stravaOn(CIRCUIT_DATE, { id: 1, name: 'Oakland eBiking', type: 'EBikeRide', sport_type: 'EBikeRide', moving_time: 13 * 60 })
    const gym = stravaOn(CIRCUIT_DATE, { id: 2, name: 'Station circuit', type: 'WeightTraining', sport_type: 'WeightTraining', moving_time: 40 * 60, distance: 0 })
    const result = matchActivitiesToPlan(weeks, [ebike, gym])
    const day = result[0].days[0]
    expect(day.actual?.stravaId).toBe(2)
    expect(day.secondaryActuals).toHaveLength(1)
    expect(day.secondaryActuals![0].stravaId).toBe(1)
  })

  it('legit claims still work: run→run day, ride→non-gym cross day', () => {
    const runDay = makeDay({ day: 'Thu 8/20', type: 'run', workout: 'Easy run', route: 'Neighborhood', time: '40 min' })
    const crossDay = makeDay({ day: 'Fri 8/21', workout: 'Bike or swim', route: 'Your choice', time: '40 min' })
    const weeks = [makeWeek([runDay, crossDay])]
    const run = stravaOn('2026-08-20', { id: 1, type: 'Run', sport_type: 'Run', moving_time: 2400 })
    const ride = stravaOn('2026-08-21', { id: 2, type: 'Ride', sport_type: 'Ride', moving_time: 2400 })
    const result = matchActivitiesToPlan(weeks, [run, ride])
    expect(result[0].days[0].actual?.stravaId).toBe(1)
    expect(result[0].days[1].actual?.stravaId).toBe(2)
  })

  it('rest days still attach whatever was recorded', () => {
    const restDay = makeDay({ type: 'rest', workout: 'Rest', route: '—', time: '—' })
    const weeks = [makeWeek([restDay])]
    const walk = stravaOn(CIRCUIT_DATE, { id: 5, type: 'Walk', sport_type: 'Walk', moving_time: 1200 })
    const result = matchActivitiesToPlan(weeks, [walk])
    expect(result[0].days[0].actual?.stravaId).toBe(5)
  })
})

describe('mergeAppleActivitiesIntoWeeks — earned claims (Apple path)', () => {
  const CIRCUIT_DATE = '2026-08-21'

  it('an Apple e-bike workout cannot fill the circuit day — surfaces as a secondary instead', () => {
    const weeks = [makeWeek([makeDay()])]
    const result = mergeAppleActivitiesIntoWeeks(weeks, [{
      date: CIRCUIT_DATE, type: 'cycling', name: 'Oakland eBiking',
      durationMinutes: 13, elevationGainFt: 40, distanceMi: 3.3,
    }])
    const day = result[0].days[0]
    expect(day.actual).toBeUndefined()
    expect(day.secondaryActuals).toHaveLength(1)
  })

  it('an Apple strength workout still fills the circuit day', () => {
    const weeks = [makeWeek([makeDay()])]
    const result = mergeAppleActivitiesIntoWeeks(weeks, [{
      date: CIRCUIT_DATE, type: 'functional_strength_training', name: 'Functional Strength',
      durationMinutes: 40, elevationGainFt: 0,
    }])
    expect(result[0].days[0].actual?.name).toBe('Functional Strength')
  })
})

// ─── Erg-primary days — the warm-up-claimed-the-TT field bug ───────────

describe('erg-primary days — the erg IS the workout', () => {
  // Mon 4/13 slot, rewritten as the erg time-trial benchmark.
  const DATE = '2026-04-13'
  function ergDayPlan(): TrainingWeek[] {
    const weeks = structuredClone(mikePlan.weeks)
    weeks[0].days[0] = {
      ...weeks[0].days[0],
      type: 'quality',
      workout: 'BENCHMARK: 1km erg time trial',
      detail: '10 min easy warm-up run · 1km ALL-OUT on the rower',
      route: 'Gym',
      time: '25 min',
    }
    return weeks
  }
  const ergDay = (): PlannedDay => ergDayPlan()[0].days[0]

  it('the 3-minute erg TT beats the 10-minute warm-up run (the field bug)', () => {
    const warmup = makeGarminDetail({ activityId: 1, type: 'treadmill_running', durationSeconds: 620, movingDurationSeconds: 540, averageHR: 140 })
    const tt = makeGarminDetail({ activityId: 2, type: 'indoor_rowing', durationSeconds: 200, movingDurationSeconds: 190, averageHR: 169 })
    const result = mergeGarminDetailIntoWeeks(ergDayPlan(), { [DATE]: [warmup, tt] })
    const day = result[0].days[0]
    expect(day.actual?.garminId).toBe(2)
    expect(day.secondaryActuals?.map(x => x.garminId)).toEqual([1])
  })

  it('erg recordings bypass the duration-share gate, with a 60s junk floor', () => {
    expect(canClaimPlannedDay(ergDay(), 'indoor_rowing', 200)).toBe(true)
    expect(canClaimPlannedDay(ergDay(), 'indoor_rowing', 45)).toBe(false)
  })

  it('without an erg recording, the run fallback still claims (day not stranded)', () => {
    const warmup = makeGarminDetail({ activityId: 1, type: 'treadmill_running', durationSeconds: 620, movingDurationSeconds: 620 })
    const result = mergeGarminDetailIntoWeeks(ergDayPlan(), { [DATE]: [warmup] })
    expect(result[0].days[0].actual?.garminId).toBe(1)
  })

  it('the combined "run TT + erg baseline" day stays run-primary', () => {
    const combined: PlannedDay = {
      day: 'Mon 8/24', type: 'quality',
      workout: 'BENCHMARK: 1km time trial + erg baseline',
      detail: '15 min easy WU · 1km ALL-OUT time trial · then erg baseline',
      zone: 'Z4', route: 'Flat route', time: '45 min',
    }
    expect(ergPrimaryDay(combined)).toBe(false)
    // A short row cannot hijack the run TT day…
    expect(canClaimPlannedDay(combined, 'indoor_rowing', 200)).toBe(false)
    // …while the run claims as before.
    expect(canClaimPlannedDay(combined, 'treadmill_running', 2000)).toBe(true)
  })
})
