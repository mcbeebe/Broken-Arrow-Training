/**
 * Plan-generator end-to-end tests — feed real method JSONs + representative
 * onboarding configs through `generatePlanFromMethod` and assert on the
 * shape, week/phase distribution, mileage progression, taper, and the
 * structured PlannedWorkout payloads attached to every running day.
 */
import { describe, it, expect } from 'vitest'
import { generatePlanFromMethod } from '../../../engines/planGenerator/generatePlan'
import {
  snapToSupportedWeeks,
  chooseTotalWeeks,
  allocatePhaseWeeks,
  buildWeeklyMileage,
  estimateCurrentWeeklyMileage,
} from '../../../engines/planGenerator/weekPlan'
import { resolvePaces, resolveAnchor, athleteCurrentVdot, blendGoalPaces, normalizeEasyPaceSecPerMile, formatZoneString, ESTIMATED_LTHR_PCT_OF_MAX } from '../../../engines/planGenerator/paceTargets'
import {
  pickWeeklyPattern,
  pickWorkoutForDay,
  buildPlannedWorkout,
} from '../../../engines/planGenerator/workouts'

import type { TrainingMethod } from '../../../types/training-method'
import type { OnboardingConfig } from '../../../hooks/useOnboarding'

import danielsMethod from '../../../data/methods/daniels.json'
import pfitzingerMethod from '../../../data/methods/pfitzinger.json'
import koopMethod from '../../../data/methods/koop.json'
import rocheMethod from '../../../data/methods/roche_swap.json'
import higdonMethod from '../../../data/methods/higdon.json'
import gallowayMethod from '../../../data/methods/galloway.json'

const daniels = danielsMethod as unknown as TrainingMethod
const pfitzinger = pfitzingerMethod as unknown as TrainingMethod
const koop = koopMethod as unknown as TrainingMethod
const roche = rocheMethod as unknown as TrainingMethod
const higdon = higdonMethod as unknown as TrainingMethod
const galloway = gallowayMethod as unknown as TrainingMethod

const TODAY = '2026-05-10'

function makeConfig(overrides: Partial<OnboardingConfig> = {}): OnboardingConfig {
  return {
    raceType: 'trail',
    raceName: 'Test Race',
    raceDate: '2026-09-13',  // ~18 weeks out
    raceDistance: 'marathon',
    experienceLevel: 'intermediate',
    trainingDaysPerWeek: 5,
    longRunDay: 'Sunday',
    wearable: 'none',
    athleteName: 'Test',
    age: 38,
    maxHR: 184,
    completedAt: '',
    ...overrides,
  }
}

describe('snapToSupportedWeeks', () => {
  it('snaps to nearest supported plan length', () => {
    // Daniels supports [8, 12, 16, 18, 20, 24]
    expect(snapToSupportedWeeks(daniels, 17)).toBe(18)
    expect(snapToSupportedWeeks(daniels, 10)).toBe(12)  // ties prefer larger → 12 (delta 2 vs 8 delta 2)
    expect(snapToSupportedWeeks(daniels, 50)).toBe(24)
    expect(snapToSupportedWeeks(daniels, 1)).toBe(8)
  })
})

describe('chooseTotalWeeks', () => {
  it('uses defaultPlanWeeks when no raceDate given', () => {
    expect(chooseTotalWeeks(daniels, undefined, TODAY)).toBe(daniels.generationRules.defaultPlanWeeks)
  })
  it('computes weeks until race and snaps', () => {
    // raceDate 18 weeks out → should snap to 18 (exact)
    expect(chooseTotalWeeks(daniels, '2026-09-13', TODAY)).toBe(18)
  })
  it('rushes when race is close', () => {
    // 4 weeks out → snap to 8 (nearest supported)
    expect(chooseTotalWeeks(daniels, '2026-06-07', TODAY)).toBe(8)
  })
})

describe('allocatePhaseWeeks', () => {
  it('sums to total weeks', () => {
    const blocks = allocatePhaseWeeks(daniels, 18)
    const sum = blocks.reduce((s, b) => s + (b.endWeekIndex - b.startWeekIndex + 1), 0)
    expect(sum).toBe(18)
  })
  it('orders phases by their .order', () => {
    const blocks = allocatePhaseWeeks(pfitzinger, 18)
    const ids = blocks.map(b => b.phaseId)
    const expectedOrder = [...pfitzinger.phases].sort((a, b) => a.order - b.order).map(p => p.id)
    expect(ids).toEqual(expectedOrder)
  })
  it('starts at index 0 and is contiguous', () => {
    const blocks = allocatePhaseWeeks(daniels, 12)
    expect(blocks[0].startWeekIndex).toBe(0)
    for (let i = 1; i < blocks.length; i++) {
      expect(blocks[i].startWeekIndex).toBe(blocks[i - 1].endWeekIndex + 1)
    }
  })
})

describe('estimateCurrentWeeklyMileage', () => {
  it('returns reasonable defaults per experience level', () => {
    expect(estimateCurrentWeeklyMileage(makeConfig({ experienceLevel: 'first_timer' }))).toBe(6)
    expect(estimateCurrentWeeklyMileage(makeConfig({ experienceLevel: 'intermediate' }))).toBe(20)
    expect(estimateCurrentWeeklyMileage(makeConfig({ experienceLevel: 'elite' }))).toBe(48)
  })

  it('honors the user-reported current mileage when present', () => {
    // Regression: the engine previously ignored config.currentWeeklyMileage
    // and always used the experience-level estimate, so the ramp didn't
    // reflect what the athlete was actually running.
    expect(estimateCurrentWeeklyMileage(makeConfig({
      experienceLevel: 'intermediate',
      currentWeeklyMileage: 12,
    }))).toBe(12)
  })

  it('falls back to the experience default when reported mileage is 0 or missing', () => {
    expect(estimateCurrentWeeklyMileage(makeConfig({
      experienceLevel: 'intermediate',
      currentWeeklyMileage: 0,
    }))).toBe(20)
    expect(estimateCurrentWeeklyMileage(makeConfig({
      experienceLevel: 'intermediate',
      currentWeeklyMileage: undefined,
    }))).toBe(20)
  })
})

describe('volume ramp uses self-reported mileage', () => {
  it('peak mileage scales from the user-reported baseline, not the experience estimate', () => {
    // Same experience level but different reported mileage should produce
    // very different peak miles — confirming the engine honors the
    // self-report and isn't silently substituting the experience default.
    const lowMileage = generatePlanFromMethod(daniels, makeConfig({
      raceDistance: 'half_marathon',
      experienceLevel: 'intermediate',
      currentWeeklyMileage: 10,
    }), TODAY)
    const highMileage = generatePlanFromMethod(daniels, makeConfig({
      raceDistance: 'half_marathon',
      experienceLevel: 'intermediate',
      currentWeeklyMileage: 30,
    }), TODAY)
    const lowPeak = Math.max(...lowMileage.weeks.map(w => Number(w.miles)))
    const highPeak = Math.max(...highMileage.weeks.map(w => Number(w.miles)))
    // Peak should roughly triple along with the baseline (peakMileageRule
    // is a multiplier on current mileage).
    expect(highPeak).toBeGreaterThan(lowPeak * 2)
  })
})

describe('buildWeeklyMileage', () => {
  it('applies the taper to the final N weeks', () => {
    const blocks = allocatePhaseWeeks(daniels, 18)
    const weeks = buildWeeklyMileage(daniels, 18, blocks, 20)
    const taperLen = daniels.taper.durationWeeks
    const taperFlags = weeks.slice(-taperLen).map(w => w.isTaper)
    expect(taperFlags).toEqual(Array(taperLen).fill(true))
    // Taper miles strictly decreasing
    const taperMiles = weeks.slice(-taperLen).map(w => w.totalMi)
    for (let i = 1; i < taperMiles.length; i++) {
      expect(taperMiles[i]).toBeLessThan(taperMiles[i - 1])
    }
  })
  it('peak miles ~= current × peakMileageRule.value', () => {
    const blocks = allocatePhaseWeeks(daniels, 18)
    const weeks = buildWeeklyMileage(daniels, 18, blocks, 20)
    const peak = Math.max(...weeks.map(w => w.totalMi))
    const expected = 20 * daniels.mileageProgression.peakMileageRule.value
    expect(peak).toBeGreaterThanOrEqual(expected * 0.9)
    expect(peak).toBeLessThanOrEqual(expected * 1.05)
  })
  it('long-run miles are capped at longRunPctCap of weekly total', () => {
    const blocks = allocatePhaseWeeks(daniels, 18)
    const weeks = buildWeeklyMileage(daniels, 18, blocks, 20)
    for (const w of weeks) {
      expect(w.longRunMi).toBeLessThanOrEqual(w.totalMi * daniels.mileageProgression.longRunPctCap + 0.01)
    }
  })
})

describe('easy-pace anchor sanitization (regression: impossible "0:11 /mi")', () => {
  it('normalizes a minutes-as-seconds easy pace (12 → 12:00 /mi)', () => {
    // unit
    expect(normalizeEasyPaceSecPerMile(12)).toBe(720)   // minutes → seconds
    expect(normalizeEasyPaceSecPerMile(11)).toBe(660)
    expect(normalizeEasyPaceSecPerMile(11 * 60)).toBe(660) // already seconds → unchanged
    // implausible either-way values are rejected so we fall back to HR/RPE
    expect(normalizeEasyPaceSecPerMile(90)).toBeNull()
    expect(normalizeEasyPaceSecPerMile(0)).toBeNull()
    expect(normalizeEasyPaceSecPerMile(undefined)).toBeNull()
  })

  it('a corrupted easy-pace anchor never renders an impossible sub-minute pace', () => {
    // Bad legacy/hand-entered data: "12:00 /mi" stored as 12 in the sec/mile
    // field. Previously this rendered "0:11-0:13 /mi" (≈ 327 mph).
    const paces = resolvePaces(galloway, makeConfig({
      raceDistance: 'half_marathon',
      fitnessAnchor: { type: 'easy_pace', valueSeconds: 12 },
    }))
    const easy = paces.byZone.easy!
    expect(easy.paceSecPerMileLow!).toBeGreaterThanOrEqual(240) // ≥ 4:00 /mi
    expect(easy.paceSecPerMileLow!).toBeLessThanOrEqual(1500)
    expect(formatZoneString(easy)).not.toMatch(/\b0:\d\d\s*\/?mi/) // no "0:11 /mi"
  })

  it('drops an implausible easy-pace anchor instead of emitting nonsense', () => {
    const paces = resolvePaces(galloway, makeConfig({
      raceDistance: 'half_marathon',
      fitnessAnchor: { type: 'easy_pace', valueSeconds: 90 },
    }))
    expect(paces.byZone.easy!.paceSecPerMileLow).toBeUndefined()
  })
})

describe('mileage ramp off a low base (regression: starts below current / peaks too low)', () => {
  const lowBaseHalf = () => makeConfig({
    raceType: 'trail',
    raceDistance: 'half_marathon',
    experienceLevel: 'beginner',
    currentWeeklyMileage: 10,
    raceDate: '2026-09-13', // 18 weeks from TODAY
  })

  it('opens at the athlete\'s current weekly mileage, never below it', () => {
    const plan = generatePlanFromMethod(galloway, lowBaseHalf(), TODAY)
    // Previously week 1 opened at 7.2 mi (below the 10 mi/wk the athlete
    // already runs), detraining them for the first month.
    expect(Number(plan.weeks[0].miles)).toBeGreaterThanOrEqual(10)
  })

  it('peaks at a half-appropriate volume (≥ 25 mi), not a 10K-sized 18 mi', () => {
    const plan = generatePlanFromMethod(galloway, lowBaseHalf(), TODAY)
    const peak = Math.max(...plan.weeks.map(w => Number(w.miles)))
    expect(peak).toBeGreaterThanOrEqual(25)
  })

  it('still scales peak with the baseline for higher-base athletes', () => {
    // The floor must not flatten everyone to 25 — a 30 mi/wk athlete still
    // peaks well above the low-base athlete.
    const low = generatePlanFromMethod(galloway, lowBaseHalf(), TODAY)
    const high = generatePlanFromMethod(galloway, { ...lowBaseHalf(), currentWeeklyMileage: 30 }, TODAY)
    const peakOf = (p: typeof low) => Math.max(...p.weeks.map(w => Number(w.miles)))
    expect(peakOf(high)).toBeGreaterThan(peakOf(low))
  })
})

describe('pickWeeklyPattern — phase fallback (no blank weeks)', () => {
  const methods: [string, TrainingMethod][] = [
    ['daniels', daniels], ['pfitzinger', pfitzinger], ['koop', koop],
    ['roche', roche], ['higdon', higdon], ['galloway', galloway],
  ]
  it('resolves a non-null pattern for every phase of every method', () => {
    for (const [, method] of methods) {
      for (const phase of method.phases) {
        const p = pickWeeklyPattern(method, phase.id, 5, false)
        expect(p).not.toBeNull()
        expect(p!.schedule.length).toBeGreaterThan(0)
      }
    }
  })

  it('falls back to the nearest phase when the requested phase has no patterns', () => {
    // An unknown phase id has no patterns; we still borrow the nearest phase's.
    const p = pickWeeklyPattern(daniels, '__nonexistent_phase__', 5, false)
    expect(p).not.toBeNull()
    expect(p!.schedule.length).toBeGreaterThan(0)
  })
})

describe('regression: the reported marathon config', () => {
  // Reproduces the exact onboarding that surfaced the bugs: Daniels · marathon
  // · 20 mpw · advanced · Sunday long run · ~24 weeks out.
  const reported = () => makeConfig({
    raceType: 'trail',
    raceDistance: 'marathon',
    experienceLevel: 'advanced',
    currentWeeklyMileage: 20,
    longRunDay: 'Sunday',
    raceDate: '2026-11-22',  // a Sunday, ~28w from TODAY → snaps to 24
    fitnessAnchor: { type: 'race_marathon', valueSeconds: 3 * 3600 + 30 * 60 },
  })

  it('never produces a blank (zero-day) non-final week', () => {
    const plan = generatePlanFromMethod(daniels, reported(), TODAY)
    for (const w of plan.weeks.slice(0, -1)) {
      expect(w.days.length).toBeGreaterThan(0)
    }
  })

  it('places the long run on the chosen weekday (Sunday) and labels weeks Mon–Sun', () => {
    const plan = generatePlanFromMethod(daniels, reported(), TODAY)
    // Use a mid-build week (not taper/race week) where a long run exists.
    const buildWeek = plan.weeks.find(w => w.focus !== 'Taper' && w.days.some(d => d.type === 'long'))!
    const longDay = buildWeek.days.find(d => d.type === 'long')!
    expect(longDay.day.startsWith('Sun')).toBe(true)
    expect(buildWeek.dates.startsWith('Mon')).toBe(true)
  })

  it('builds real marathon volume off a 20 mpw base (peak ≥ 40, long run ≥ 18)', () => {
    const plan = generatePlanFromMethod(daniels, reported(), TODAY)
    const peakMiles = Math.max(...plan.weeks.map(w => Number(w.miles)))
    expect(peakMiles).toBeGreaterThanOrEqual(40)
    // Longest long run across the plan.
    const longestLong = Math.max(
      ...plan.weeks.flatMap(w => w.days.filter(d => d.type === 'long'))
        .map(d => {
          const m = d.detail.match(/Long run ~([\d.]+) mi/)
          return m ? parseFloat(m[1]) : 0
        }),
    )
    expect(longestLong).toBeGreaterThanOrEqual(18)
    // Never exceeds the marathon long-run distance ceiling.
    expect(longestLong).toBeLessThanOrEqual(22)
  })

  it('stamps exactly one drill day (first easy run) per non-final week', () => {
    const plan = generatePlanFromMethod(daniels, reported(), TODAY)
    for (const w of plan.weeks.slice(0, -1)) {
      const drillDays = w.days.filter(d => d.isDrillDay)
      // At most one; present whenever the week has any easy run.
      expect(drillDays.length).toBeLessThanOrEqual(1)
      if (w.days.some(d => d.type === 'run')) {
        expect(drillDays.length).toBe(1)
        expect(drillDays[0].type).toBe('run')
      }
    }
  })
})

describe('resolveAnchor / resolvePaces', () => {
  it('estimates LTHR for LTHR-anchored methods', () => {
    // Koop is the LTHR-anchored example in the library (Pfitzinger uses
    // recent_race_time / LT pace, not a direct HR anchor).
    const cfg = makeConfig({ maxHR: 184 })
    const a = resolveAnchor(koop, cfg)
    expect(a.type).toBe('lthr_bpm')
    expect(a.value).toBe(Math.round(184 * ESTIMATED_LTHR_PCT_OF_MAX))
  })
  it('estimates AeT for AeT-anchored methods', () => {
    const a = resolveAnchor(roche, makeConfig({ maxHR: 184 }))
    expect(a.type).toBe('aet_bpm')
    expect(a.value).toBe(Math.round(184 * 0.78))
  })
  it('leaves anchor value null for race-time / VDOT methods', () => {
    const a = resolveAnchor(daniels, makeConfig({ maxHR: 184 }))
    expect(a.value).toBeNull()
  })
  it('produces a PaceTarget per declared zone', () => {
    const paces = resolvePaces(pfitzinger, makeConfig())
    for (const z of pfitzinger.paceZones) {
      expect(paces.byZone[z.canonical]).toBeDefined()
    }
  })
  it('PaceTarget bpm bounds use estimated LTHR for HR-range methods', () => {
    const cfg = makeConfig({ maxHR: 184 })
    const paces = resolvePaces(pfitzinger, cfg)
    const lthr = Math.round(184 * ESTIMATED_LTHR_PCT_OF_MAX)
    const easyZone = pfitzinger.paceZones.find(z => z.canonical === 'easy')
    if (easyZone && easyZone.hrRange?.minPctLthr && easyZone.hrRange?.maxPctLthr) {
      const t = paces.byZone.easy!
      expect(t.hrBpmLow).toBe(Math.round(easyZone.hrRange.minPctLthr * lthr))
      expect(t.hrBpmHigh).toBe(Math.round(easyZone.hrRange.maxPctLthr * lthr))
    }
  })
})

describe('goal-pace personalization', () => {
  const anchored = makeConfig({
    raceDistance: 'marathon',
    currentWeeklyMileage: 30,
    fitnessAnchor: { type: 'race_5k', valueSeconds: 22 * 60 },
  })

  it('athleteCurrentVdot returns a vdot for a race anchor, null without one', () => {
    expect(athleteCurrentVdot(anchored)!).toBeGreaterThan(0)
    expect(athleteCurrentVdot(makeConfig({ fitnessAnchor: undefined }))).toBeNull()
  })

  it('blendGoalPaces keeps easy current, sharpens threshold current→goal, pins M-pace to goal', () => {
    const current = resolvePaces(daniels, anchored)
    const goalVdot = athleteCurrentVdot(anchored)! + 4
    const goal = resolvePaces(daniels, anchored, { vdotOverride: goalVdot })
    const early = blendGoalPaces(current, goal, 0)
    const late = blendGoalPaces(current, goal, 1)

    // Easy pace is current-fitness at every point in the build.
    expect(early.byZone.easy!.paceSecPerMileHigh).toBe(current.byZone.easy!.paceSecPerMileHigh)
    expect(late.byZone.easy!.paceSecPerMileHigh).toBe(current.byZone.easy!.paceSecPerMileHigh)

    // Threshold sharpens across the block (smaller sec/mi = faster).
    const lt = (rp: typeof current) => rp.byZone.lactate_threshold?.paceSecPerMileHigh
    if (lt(current) != null && lt(goal) != null) {
      expect(lt(early)).toBe(lt(current))
      expect(lt(late)).toBe(lt(goal))
      expect(lt(late)!).toBeLessThanOrEqual(lt(early)!)
    }

    // Marathon pace is goal effort by definition — goal pace even at week 0.
    const mp = (rp: typeof current) => rp.byZone.marathon_pace?.paceSecPerMileHigh
    if (mp(goal) != null) expect(mp(early)).toBe(mp(goal))
  })

  it('end-to-end: a goal finish time alters quality paces vs no goal', () => {
    const base = makeConfig({
      raceDistance: 'marathon',
      currentWeeklyMileage: 30,
      fitnessAnchor: { type: 'race_5k', valueSeconds: 22 * 60 },
      raceDate: '2026-11-22',
    })
    const noGoal = generatePlanFromMethod(daniels, base, TODAY)
    const withGoal = generatePlanFromMethod(daniels, { ...base, goalRaceTimeSeconds: 3 * 3600 + 10 * 60 }, TODAY)
    // Quality paces sharpen, so the serialized plans differ.
    expect(JSON.stringify(withGoal.weeks)).not.toBe(JSON.stringify(noGoal.weeks))
  })

  it('ignores a goal that is not a stretch beyond current fitness', () => {
    const base = makeConfig({
      raceDistance: 'marathon',
      currentWeeklyMileage: 30,
      fitnessAnchor: { type: 'race_5k', valueSeconds: 20 * 60 },
      raceDate: '2026-11-22',
    })
    const noGoal = generatePlanFromMethod(daniels, base, TODAY)
    // A very slow goal marathon (5h) is easier than current fitness → no change.
    const slowGoal = generatePlanFromMethod(daniels, { ...base, goalRaceTimeSeconds: 5 * 3600 }, TODAY)
    expect(JSON.stringify(slowGoal.weeks)).toBe(JSON.stringify(noGoal.weeks))
  })
})

describe('pickWeeklyPattern', () => {
  it('finds a pattern matching the phase, with closest daysPerWeek', () => {
    const phaseId = daniels.phases[0].id
    const p = pickWeeklyPattern(daniels, phaseId, 5, false)
    expect(p).not.toBeNull()
    expect(p!.phaseId).toBe(phaseId)
    expect(Math.abs(p!.daysPerWeek - 5)).toBeLessThanOrEqual(1)
  })
  it('prefers recovery weekType on cutback weeks when available', () => {
    const transition = 'transition_quality'
    const standard = pickWeeklyPattern(daniels, transition, 5, false)
    const recovery = pickWeeklyPattern(daniels, transition, 5, true)
    expect(standard?.weekType).toBe('standard')
    expect(recovery?.weekType).toBe('recovery')
  })
})

describe('pickWorkoutForDay', () => {
  it('returns null for non-running categories', () => {
    const ret = pickWorkoutForDay(daniels, { dayOfWeek: 1, category: 'rest' }, 'intermediate', 30)
    expect(ret).toBeNull()
  })
  it('picks the first viable preferred workout', () => {
    const ret = pickWorkoutForDay(
      daniels,
      { dayOfWeek: 2, category: 'easy', preferredWorkoutIds: ['daniels_easy_run'] },
      'intermediate',
      30,
    )
    expect(ret).not.toBeNull()
    expect(ret!.workout.id).toBe('daniels_easy_run')
    expect(ret!.substituted).toBe(false)
  })
  it('substitutes when minimumExperience blocks the preferred', () => {
    // daniels_marathon_simulation requires 'advanced'; a recreational user gets substituted
    const ret = pickWorkoutForDay(
      daniels,
      { dayOfWeek: 7, category: 'long', preferredWorkoutIds: ['daniels_marathon_simulation'] },
      'recreational',
      35,
    )
    expect(ret).not.toBeNull()
    expect(ret!.substituted).toBe(true)
    expect(ret!.workout.id).not.toBe('daniels_marathon_simulation')
  })
})

describe('buildPlannedWorkout', () => {
  it('flattens warmup + mainSet + cooldown in order, attaches pace targets', () => {
    const paces = resolvePaces(pfitzinger, makeConfig())
    const workout = pfitzinger.workouts.find(w => w.structure.warmup && w.structure.cooldown)!
    const pw = buildPlannedWorkout(pfitzinger, workout, paces)
    expect(pw.segments[0].role).toBe('warmup')
    expect(pw.segments[pw.segments.length - 1].role).toBe('cooldown')
    const mains = pw.segments.filter(s => s.role === 'main')
    expect(mains.length).toBeGreaterThan(0)
    for (const s of pw.segments) {
      if (s.paceZone) {
        expect(s.paceTarget?.zone).toBe(s.paceZone)
      }
    }
  })
})

describe('generatePlanFromMethod — end-to-end', () => {
  it('produces a TrainingPlan with the expected week count for an 18-week marathon plan', () => {
    const plan = generatePlanFromMethod(daniels, makeConfig({
      raceDate: '2026-09-13',  // 18w from TODAY
      experienceLevel: 'intermediate',
    }), TODAY)
    expect(plan.weeks).toHaveLength(18)
  })

  it('attaches a structured plannedWorkout to every running day', () => {
    const plan = generatePlanFromMethod(daniels, makeConfig(), TODAY)
    let runningDays = 0
    let withWorkout = 0
    for (const w of plan.weeks) {
      for (const d of w.days) {
        if (d.type === 'rest' || d.type === 'cross' || d.type === 'strength') continue
        runningDays++
        if (d.plannedWorkout) withWorkout++
        // Sanity on the attached PlannedWorkout
        if (d.plannedWorkout) {
          expect(d.plannedWorkout.methodId).toBe('daniels')
          expect(d.plannedWorkout.segments.length).toBeGreaterThan(0)
        }
      }
    }
    expect(runningDays).toBeGreaterThan(0)
    expect(withWorkout).toBe(runningDays)
  })

  it('uses the race-week schedule on the final week', () => {
    const plan = generatePlanFromMethod(daniels, makeConfig(), TODAY)
    const last = plan.weeks[plan.weeks.length - 1]
    expect(last.days.length).toBe(daniels.taper.raceWeekSchedule.length)
    // Race day (last entry in raceWeekSchedule has category 'race_pace' for daniels)
    const raceDay = last.days[last.days.length - 1]
    expect(raceDay.type === 'race' || raceDay.type === 'run' || raceDay.type === 'rest').toBe(true)
  })

  it('produces a strictly-decreasing taper across the final taper weeks', () => {
    const plan = generatePlanFromMethod(daniels, makeConfig(), TODAY)
    const taperLen = daniels.taper.durationWeeks
    const taperMiles = plan.weeks.slice(-taperLen).map(w => Number(w.miles))
    for (let i = 1; i < taperMiles.length; i++) {
      expect(taperMiles[i]).toBeLessThan(taperMiles[i - 1])
    }
  })

  it('koop generates a working 50K plan for an advanced user', () => {
    const plan = generatePlanFromMethod(koop, makeConfig({
      raceDistance: '50k',
      experienceLevel: 'advanced',
      raceDate: '',  // use default plan length
    }), TODAY)
    expect(plan.weeks.length).toBe(koop.generationRules.defaultPlanWeeks)
    expect(plan.race.distance).toBe('50K')
    expect(plan.race.distanceMiles).toBeCloseTo(31.1, 1)
  })

  it('higdon (rpe-only) leaves anchor null but still attaches RPE targets', () => {
    const plan = generatePlanFromMethod(higdon, makeConfig({
      raceDistance: 'half_marathon',
      experienceLevel: 'beginner',
    }), TODAY)
    let anyRpe = false
    for (const w of plan.weeks) {
      for (const d of w.days) {
        const t = d.plannedWorkout?.segments.find(s => s.paceTarget?.preferredMode === 'rpe' || s.paceTarget?.preferredMode === 'hr')?.paceTarget
        if (t && (t.rpeLow != null || t.hrBpmLow != null)) anyRpe = true
      }
    }
    expect(anyRpe).toBe(true)
  })

  it('athlete profile reflects onboarding inputs', () => {
    const plan = generatePlanFromMethod(daniels, makeConfig({ athleteName: 'Jenn', age: 41, maxHR: 180 }), TODAY)
    expect(plan.athlete.name).toBe('Jenn')
    expect(plan.athlete.maxHR).toBe(180)
    expect(plan.athlete.weeklyStructure).toMatch(/days\/week/)
  })

  it('zone percent labels match the displayed bpm range', () => {
    // Regression: previously the Settings → HR Zones panel hard-coded
    // each zone's % label (e.g. "65–75%") while showing bpm values
    // derived from the method's % of LTHR — so Z2 on a maxHR=200 plan
    // read "65–75%" but showed 149–164 bpm (≈ 75–82%). The label now
    // derives from the actual bpm range so the two stay consistent.
    const plan = generatePlanFromMethod(pfitzinger, makeConfig({ maxHR: 200 }), TODAY)
    const z2 = plan.zones.find(z => z.zone.includes('Z2'))!
    const [low, high] = z2.hr.split(/[–-]/).map(s => parseInt(s.trim(), 10))
    const expectedLowPct = Math.round((low / 200) * 100)
    const expectedHighPct = Math.round((high / 200) * 100)
    expect(z2.pct).toBe(`${expectedLowPct}–${expectedHighPct}%`)
  })

  it('zones are derived from the method\'s pace zones × resolved LTHR', () => {
    // With maxHR=200, estimated LTHR = round(200 × ESTIMATED_LTHR_PCT_OF_MAX).
    // Use Pfitzinger so we hit a method with declared hrRanges — confirms
    // Settings zones match per-day text.
    const plan = generatePlanFromMethod(pfitzinger, makeConfig({ maxHR: 200 }), TODAY)
    const lthr = Math.round(200 * ESTIMATED_LTHR_PCT_OF_MAX)
    const easyZone = pfitzinger.paceZones.find(z => z.canonical === 'easy')!
    const expectedLow = Math.round(easyZone.hrRange!.minPctLthr! * lthr)
    const expectedHigh = Math.round(easyZone.hrRange!.maxPctLthr! * lthr)
    const z2 = plan.zones.find(z => z.zone.includes('Z2'))!
    expect(z2.hr).toBe(`${expectedLow}–${expectedHigh}`)
  })

  it('injects strength sessions onto rest days when budget allows', () => {
    // trainingDaysPerWeek=7 leaves room for koop's 5 running days + 2 strength.
    const plan = generatePlanFromMethod(koop, makeConfig({
      raceDistance: '50k',
      experienceLevel: 'advanced',
      trainingDaysPerWeek: 7,
      strengthDaysPerWeek: 2,
    }), TODAY)
    // A non-taper, non-cutback week should have the requested strength days.
    const buildWeek = plan.weeks.find(w => w.focus !== 'Taper' && w.focus !== 'Cutback')!
    const strengthCount = buildWeek.days.filter(d => d.type === 'strength').length
    expect(strengthCount).toBeGreaterThanOrEqual(1)
    expect(strengthCount).toBeLessThanOrEqual(2)
    // Strength days must have a parseable routine (contains the standard separator).
    const strengthDay = buildWeek.days.find(d => d.type === 'strength')!
    expect(strengthDay.detail).toContain(' · ')
    expect(strengthDay.workout.toLowerCase()).toContain('strength')
  })

  it('injects a cross-training day for the user\'s preferred modality', () => {
    const plan = generatePlanFromMethod(koop, makeConfig({
      raceDistance: '50k',
      experienceLevel: 'advanced',
      trainingDaysPerWeek: 6,
      crossTrainingModes: ['hiking'],
    }), TODAY)
    const buildWeek = plan.weeks.find(w => w.focus !== 'Taper' && w.focus !== 'Cutback')!
    const cross = buildWeek.days.find(d => d.type === 'cross')
    expect(cross).toBeDefined()
    expect(cross!.workout.toLowerCase()).toContain('hiking')
    expect(cross!.detail.length).toBeGreaterThan(0)
  })

  it('leaves the schedule alone when onboarding requests neither strength nor cross', () => {
    const planExtras = generatePlanFromMethod(koop, makeConfig({
      raceDistance: '50k',
      experienceLevel: 'advanced',
      strengthDaysPerWeek: 0,
    }), TODAY)
    const planBase = generatePlanFromMethod(koop, makeConfig({
      raceDistance: '50k',
      experienceLevel: 'advanced',
    }), TODAY)
    // Same day-types week-by-week when no extras were requested.
    expect(planExtras.weeks.map(w => w.days.map(d => d.type)))
      .toEqual(planBase.weeks.map(w => w.days.map(d => d.type)))
  })

  it('honors explicit strength + cross even when the method min pushes total above the day cap', () => {
    // User asks for 5 total + 1 strength + cross. Method's min running pattern
    // is 5 (koop), so running can't drop below 5. We honor the explicit
    // strength + cross request rather than silently dropping it — the active
    // total may exceed the day cap, but never exceeds 7 (calendar limit).
    const plan = generatePlanFromMethod(koop, makeConfig({
      raceDistance: '50k',
      experienceLevel: 'advanced',
      trainingDaysPerWeek: 5,
      strengthDaysPerWeek: 1,
      crossTrainingModes: ['cycling'],
    }), TODAY)
    const buildWeek = plan.weeks.find(w => w.focus !== 'Taper' && w.focus !== 'Cutback')!
    const types = buildWeek.days.map(d => d.type)
    // Strength + cross requested should appear in a typical build week.
    expect(types).toContain('strength')
    expect(types).toContain('cross')
    // Calendar-hard cap: never more than 7 active days in a 7-day week.
    const active = buildWeek.days.filter(d => d.type !== 'rest').length
    expect(active).toBeLessThanOrEqual(7)
  })

  it('respects the day cap when running min leaves room for some but not all extras', () => {
    // 5-day budget with 2 strength + 1 cross requested. Method min is 5,
    // leaving room for 2 extras max in a 7-day week. One requested extra
    // must be dropped — we keep the cross day (placed first) plus one
    // strength day rather than dropping strength entirely.
    const plan = generatePlanFromMethod(koop, makeConfig({
      raceDistance: '50k',
      experienceLevel: 'advanced',
      trainingDaysPerWeek: 5,
      strengthDaysPerWeek: 2,
      crossTrainingModes: ['cycling'],
    }), TODAY)
    const buildWeek = plan.weeks.find(w => w.focus !== 'Taper' && w.focus !== 'Cutback')!
    const active = buildWeek.days.filter(d => d.type !== 'rest').length
    expect(active).toBeLessThanOrEqual(7)
    const strengthDays = buildWeek.days.filter(d => d.type === 'strength').length
    const crossDays = buildWeek.days.filter(d => d.type === 'cross').length
    expect(strengthDays + crossDays).toBeGreaterThanOrEqual(1)
  })

  it('honors a single strength day for a half-marathon Pfitzinger plan', () => {
    // Regression: previously, picking 5 days + 1 strength on Pfitzinger
    // (5-day min running pattern) produced a plan with 0 strength sessions.
    const plan = generatePlanFromMethod(pfitzinger, makeConfig({
      raceDistance: 'half_marathon',
      experienceLevel: 'intermediate',
      trainingDaysPerWeek: 5,
      strengthDaysPerWeek: 1,
      crossTrainingModes: undefined,
    }), TODAY)
    const buildWeek = plan.weeks.find(w => w.focus !== 'Taper' && w.focus !== 'Cutback')!
    const strengthDays = buildWeek.days.filter(d => d.type === 'strength').length
    expect(strengthDays).toBeGreaterThanOrEqual(1)
  })

  it('honors injuryStatus=returning by capping days and softening intensity', () => {
    // Galloway has 3-day and 4-day patterns, so the 4-day injury cap is
    // actually achievable. Onboarding asks for 7 days; a returning athlete
    // should be capped at 4 total.
    const plan = generatePlanFromMethod(galloway, makeConfig({
      raceDistance: 'half_marathon',
      experienceLevel: 'beginner',
      trainingDaysPerWeek: 7,
      strengthDaysPerWeek: 0,
      injuryStatus: 'returning',
    }), TODAY)
    const week1 = plan.weeks[0]
    const active = week1.days.filter(d => d.type !== 'rest').length
    expect(active).toBeLessThanOrEqual(4)
    // First 2 weeks should not include quality (tempo / vo2) workouts.
    for (const wk of plan.weeks.slice(0, 2)) {
      const hasQuality = wk.days.some(d => d.type === 'quality')
      expect(hasQuality).toBe(false)
    }
  })

  it('softens mileage ramp for returning athletes', () => {
    const healthy = generatePlanFromMethod(daniels, makeConfig({
      raceDistance: 'marathon',
      experienceLevel: 'intermediate',
      injuryStatus: 'none',
    }), TODAY)
    const returning = generatePlanFromMethod(daniels, makeConfig({
      raceDistance: 'marathon',
      experienceLevel: 'intermediate',
      injuryStatus: 'returning',
    }), TODAY)
    // Starting mileage should be lower for returning athletes; growth slower
    // means week 2 should also be lower.
    expect(Number(returning.weeks[0].miles)).toBeLessThan(Number(healthy.weeks[0].miles))
    expect(Number(returning.weeks[1].miles)).toBeLessThan(Number(healthy.weeks[1].miles))
  })

  it('schedules N cross-training days per week when crossTrainingDaysPerWeek is set', () => {
    // 7-day budget with 2x cross-training requested. Previously the engine
    // ignored crossTrainingDaysPerWeek and scheduled exactly one cross
    // session per week regardless of preference.
    const plan = generatePlanFromMethod(koop, makeConfig({
      raceDistance: '50k',
      experienceLevel: 'advanced',
      trainingDaysPerWeek: 7,
      strengthDaysPerWeek: 0,
      crossTrainingDaysPerWeek: 2,
      crossTrainingModes: ['hiking', 'cycling'],
    }), TODAY)
    const buildWeek = plan.weeks.find(w => w.focus !== 'Taper' && w.focus !== 'Cutback')!
    const crossDays = buildWeek.days.filter(d => d.type === 'cross').length
    expect(crossDays).toBe(2)
  })

  it('rotates cross-training modalities across multiple sessions per week', () => {
    const plan = generatePlanFromMethod(koop, makeConfig({
      raceDistance: '50k',
      experienceLevel: 'advanced',
      trainingDaysPerWeek: 7,
      strengthDaysPerWeek: 0,
      crossTrainingDaysPerWeek: 2,
      crossTrainingModes: ['cycling', 'hiking'],
    }), TODAY)
    const buildWeek = plan.weeks.find(w => w.focus !== 'Taper' && w.focus !== 'Cutback')!
    const crossWorkouts = buildWeek.days.filter(d => d.type === 'cross').map(d => d.workout.toLowerCase())
    expect(crossWorkouts.length).toBe(2)
    // The two cross sessions should be different modalities, not duplicates.
    expect(new Set(crossWorkouts).size).toBe(2)
  })

  it('skips strength gym equipment when athlete has no gym access', () => {
    const plan = generatePlanFromMethod(koop, makeConfig({
      raceDistance: '50k',
      experienceLevel: 'advanced',
      trainingDaysPerWeek: 7,
      strengthDaysPerWeek: 1,
      crossTrainingModes: undefined,
      equipmentAccess: ['trails'],  // no gym
    }), TODAY)
    const buildWeek = plan.weeks.find(w => w.focus !== 'Taper' && w.focus !== 'Cutback')!
    const strengthDay = buildWeek.days.find(d => d.type === 'strength')!
    // Bodyweight routines lead with "Bodyweight Squat" rather than the
    // weighted "Goblet Squat" the gym routine prescribes.
    expect(strengthDay.detail).toMatch(/Bodyweight Squat/)
    expect(strengthDay.detail).not.toMatch(/Goblet Squat/)
  })

  it('uses weighted strength routine when gym is in equipment access', () => {
    const plan = generatePlanFromMethod(koop, makeConfig({
      raceDistance: '50k',
      experienceLevel: 'advanced',
      trainingDaysPerWeek: 7,
      strengthDaysPerWeek: 1,
      crossTrainingModes: undefined,
      equipmentAccess: ['gym'],
    }), TODAY)
    const buildWeek = plan.weeks.find(w => w.focus !== 'Taper' && w.focus !== 'Cutback')!
    const strengthDay = buildWeek.days.find(d => d.type === 'strength')!
    expect(strengthDay.detail).toMatch(/Goblet Squat/)
  })

  it('easy-run time tightens with weekly mileage rather than the method-wide range', () => {
    // For an early-block week (low mileage) vs a peak-block week (high
    // mileage) on the same plan, the per-easy-run duration should differ.
    // Previously every easy day showed the method's full
    // approxDurationMinutes range, regardless of the week's volume.
    const plan = generatePlanFromMethod(daniels, makeConfig({
      raceDistance: 'marathon',
      experienceLevel: 'intermediate',
      currentWeeklyMileage: 25,
      fitnessAnchor: { type: 'race_5k', valueSeconds: 21 * 60 + 30 },
    }), TODAY)
    // Pull an easy/recovery day from week 1 and a comparable one near peak.
    const firstEasy = plan.weeks[0].days.find(d => d.plannedWorkout?.category === 'easy' || d.plannedWorkout?.category === 'recovery')
    const peakWeek = plan.weeks[Math.floor(plan.weeks.length * 0.6)]
    const peakEasy = peakWeek.days.find(d => d.plannedWorkout?.category === 'easy' || d.plannedWorkout?.category === 'recovery')
    expect(firstEasy).toBeDefined()
    expect(peakEasy).toBeDefined()
    const parseRange = (t: string): [number, number] => {
      const m = t.match(/(\d+)-(\d+)\s*min/)
      return m ? [parseInt(m[1]), parseInt(m[2])] : [0, 0]
    }
    const [, firstHigh] = parseRange(firstEasy!.time)
    const [, peakHigh] = parseRange(peakEasy!.time)
    // Volume rises over the plan, so the peak easy run should be at least
    // as long (and usually longer) than the week-1 easy run.
    expect(peakHigh).toBeGreaterThanOrEqual(firstHigh)
    // Sanity: ranges are bounded, not the method-wide 30-90 default.
    expect(peakHigh - parseRange(peakEasy!.time)[0]).toBeLessThan(60)
  })

  it('annotates quality workouts with a venue hint from equipment access', () => {
    const plan = generatePlanFromMethod(daniels, makeConfig({
      raceDistance: 'marathon',
      experienceLevel: 'intermediate',
      equipmentAccess: ['track', 'hills'],
      fitnessAnchor: { type: 'race_5k', valueSeconds: 19 * 60 },
      currentWeeklyMileage: 35,
    }), TODAY)
    const allDays = plan.weeks.flatMap(w => w.days)
    const interval = allDays.find(d =>
      d.plannedWorkout?.category === 'vo2_intervals'
      || d.plannedWorkout?.category === 'speed_repetitions',
    )
    expect(interval).toBeDefined()
    expect(interval!.route).toMatch(/Track preferred/)
  })

  it('skips venue hints when equipment access is not provided', () => {
    const plan = generatePlanFromMethod(daniels, makeConfig({
      raceDistance: 'marathon',
      experienceLevel: 'intermediate',
      equipmentAccess: undefined,
      fitnessAnchor: { type: 'race_5k', valueSeconds: 19 * 60 },
      currentWeeklyMileage: 35,
    }), TODAY)
    const allDays = plan.weeks.flatMap(w => w.days)
    const interval = allDays.find(d =>
      d.plannedWorkout?.category === 'vo2_intervals'
      || d.plannedWorkout?.category === 'speed_repetitions',
    )
    expect(interval).toBeDefined()
    expect(interval!.route).toBe('')
  })

  it('drops strength to maintenance during taper weeks', () => {
    const plan = generatePlanFromMethod(koop, makeConfig({
      raceDistance: '50k',
      experienceLevel: 'advanced',
      trainingDaysPerWeek: 7,
      strengthDaysPerWeek: 3,
    }), TODAY)
    // Pick a taper week (excluding the race week, which uses raceWeekSchedule).
    const taperWeeks = plan.weeks.filter(w => w.focus === 'Taper').slice(0, -1)
    for (const w of taperWeeks) {
      const count = w.days.filter(d => d.type === 'strength').length
      expect(count).toBeLessThanOrEqual(1)
    }
  })
})
