/**
 * Phase allocation + weekly mileage progression.
 *
 * Decides plan length (snapped to method.supportedPlanWeeks), assigns each
 * week to a phase, and computes weekly mileage with cutback weeks and a
 * final taper applied per the method's `taper` block.
 */
import type { TrainingMethod, Phase, ExperienceLevel as MethodExperienceLevel } from '../../types/training-method'
import type { OnboardingConfig, ExperienceLevel as OnboardingExperienceLevel, RaceDistance } from '../../hooks/useOnboarding'
import type { PhaseBlock, WeekMileage } from './types'

/** Default current weekly mileage by Onboarding experience level, in miles.
 *  These are conservative — the engine applies maxWeeklyIncreasePct, so
 *  underestimating means a slightly longer build rather than an injury risk. */
const CURRENT_MILEAGE_BY_EXPERIENCE: Record<OnboardingExperienceLevel, number> = {
  first_timer: 6,
  beginner: 10,
  intermediate: 20,
  advanced: 32,
  elite: 48,
}

/** User's current weekly running miles — honors the value captured in
 *  onboarding when present, otherwise falls back to an experience-level
 *  estimate. Self-reported mileage drives ramp safety (the engine builds
 *  from `start = peak × startPct`, so getting the baseline wrong is the
 *  difference between a sane ramp and an injury). */
export function estimateCurrentWeeklyMileage(config: OnboardingConfig): number {
  if (config.currentWeeklyMileage != null && config.currentWeeklyMileage > 0) {
    return config.currentWeeklyMileage
  }
  return CURRENT_MILEAGE_BY_EXPERIENCE[config.experienceLevel]
}

/**
 * Snap a desired plan length to the nearest entry in
 * `method.generationRules.supportedPlanWeeks`. Ties prefer the larger
 * value (more training time is generally less risky than rushed).
 */
export function snapToSupportedWeeks(method: TrainingMethod, desiredWeeks: number): number {
  const supported = [...method.generationRules.supportedPlanWeeks].sort((a, b) => a - b)
  let best = supported[supported.length - 1]
  let bestDelta = Math.abs(best - desiredWeeks)
  for (const w of supported) {
    const d = Math.abs(w - desiredWeeks)
    if (d < bestDelta || (d === bestDelta && w > best)) {
      best = w
      bestDelta = d
    }
  }
  return best
}

/** Pick a plan length given a race date (or fall back to method default). */
export function chooseTotalWeeks(
  method: TrainingMethod,
  raceDateIso: string | undefined,
  todayIso: string = new Date().toISOString().slice(0, 10),
): number {
  if (!raceDateIso) return method.generationRules.defaultPlanWeeks
  const ms = new Date(raceDateIso + 'T12:00:00').getTime() - new Date(todayIso + 'T12:00:00').getTime()
  const days = Math.max(0, Math.round(ms / (24 * 3600 * 1000)))
  const desired = Math.max(1, Math.round(days / 7))
  return snapToSupportedWeeks(method, desired)
}

/**
 * Allocate the given number of weeks across the method's phases. Honors
 * pctOfPlan.default as a starting point, then enforces each phase's
 * weekBounds [minWeeks, maxWeeks]. If the total can't fit the floors,
 * we compress using compressionPriority (drop weeks from the LAST entry
 * in the priority array, working backward). If the total exceeds ceilings,
 * we expand using expansionPriority (add weeks to the FIRST entry).
 */
export function allocatePhaseWeeks(method: TrainingMethod, totalWeeks: number): PhaseBlock[] {
  const phases = [...method.phases].sort((a, b) => a.order - b.order)
  // Start from pctOfPlan.default
  const raw = phases.map(p => p.pctOfPlan.default * totalWeeks)
  let weeks = raw.map(r => Math.max(1, Math.round(r)))

  // Adjust to sum exactly totalWeeks. Distribute the remainder across phases —
  // later phases first — adding when short and trimming (never below 1) when
  // over. Stop as soon as a full pass makes no change, which happens when the
  // plan is shorter than the phase count (every phase already at its 1-week
  // floor): without this guard the old wrap-around looped forever for a very
  // short, runway-compressed plan.
  let delta = totalWeeks - weeks.reduce((s, w) => s + w, 0)
  while (delta !== 0) {
    let changed = false
    for (let k = phases.length - 1; k >= 0 && delta !== 0; k--) {
      if (delta > 0) {
        weeks[k] += 1
        delta -= 1
        changed = true
      } else if (weeks[k] > 1) {
        weeks[k] -= 1
        delta += 1
        changed = true
      }
    }
    if (!changed) break
  }

  // Compress to weekBounds.minWeeks floor if total too small
  const order = method.generationRules.compressionPriority
  weeks = enforceBounds(weeks, phases, order, 'compress')
  weeks = enforceBounds(weeks, phases, method.generationRules.expansionPriority, 'expand')

  // After enforcing bounds, re-sync sum to totalWeeks
  let sum = weeks.reduce((s, w) => s + w, 0)
  let cursor = 0
  while (sum > totalWeeks && cursor < weeks.length * 4) {
    const idx = order[cursor % order.length]
    const pIdx = phases.findIndex(p => p.id === idx)
    if (pIdx >= 0 && weeks[pIdx] > phases[pIdx].weekBounds.minWeeks) {
      weeks[pIdx] -= 1
      sum -= 1
    }
    cursor += 1
  }
  cursor = 0
  while (sum < totalWeeks && cursor < weeks.length * 4) {
    const idx = method.generationRules.expansionPriority[cursor % method.generationRules.expansionPriority.length]
    const pIdx = phases.findIndex(p => p.id === idx)
    if (pIdx >= 0 && weeks[pIdx] < phases[pIdx].weekBounds.maxWeeks) {
      weeks[pIdx] += 1
      sum += 1
    }
    cursor += 1
  }

  // Phase 1 (105-F6) — post-condition: the blocks MUST cover exactly
  // totalWeeks. The bounded resync loops above can exit unconverged when
  // weekBounds conflict; before this, uncovered weeks silently inherited
  // the last phase's label (phaseIdAtWeek fallback). Force-redistribute on
  // the largest phase — full coverage beats a bound preference.
  sum = weeks.reduce((s, w) => s + w, 0)
  while (sum !== totalWeeks) {
    const largest = weeks.indexOf(Math.max(...weeks))
    if (sum > totalWeeks) {
      if (weeks[largest] <= 1) break // degenerate: fewer weeks than phases
      weeks[largest] -= 1
      sum -= 1
    } else {
      weeks[largest] += 1
      sum += 1
    }
  }

  // Build blocks
  const blocks: PhaseBlock[] = []
  let cursorIdx = 0
  for (let i = 0; i < phases.length; i++) {
    const w = weeks[i]
    if (w <= 0) continue
    blocks.push({
      phaseId: phases[i].id,
      startWeekIndex: cursorIdx,
      endWeekIndex: cursorIdx + w - 1,
    })
    cursorIdx += w
  }
  return blocks
}

function enforceBounds(
  weeks: number[],
  phases: Phase[],
  priority: string[],
  direction: 'compress' | 'expand',
): number[] {
  const result = [...weeks]
  for (const phaseId of priority) {
    const pIdx = phases.findIndex(p => p.id === phaseId)
    if (pIdx < 0) continue
    const phase = phases[pIdx]
    if (direction === 'compress') {
      result[pIdx] = Math.max(result[pIdx], phase.weekBounds.minWeeks)
    } else {
      result[pIdx] = Math.min(result[pIdx], phase.weekBounds.maxWeeks)
    }
  }
  return result
}

/** Index of a week into the phase block list. */
export function phaseIdAtWeek(blocks: PhaseBlock[], weekIndex: number): string {
  for (const b of blocks) {
    if (weekIndex >= b.startWeekIndex && weekIndex <= b.endWeekIndex) return b.phaseId
  }
  return blocks[blocks.length - 1]?.phaseId ?? ''
}

/**
 * Optional adjustments to the mileage ramp — used by the orchestrator to
 * honor `injuryStatus` (Conservative policy: gentler start, smaller weekly
 * increments) without rewriting the method's JSON.
 */
export interface MileageProgressionAdjust {
  /** Multiplier applied to the method's `startMileagePctOfPeak` (e.g. 0.8). */
  startPctMultiplier?: number
  /** Hard cap on weekly increase percent (e.g. 0.05). Takes the min with the method default. */
  maxWeeklyIncreasePctCap?: number
  /** R1 — cap on the recovery-week cadence (e.g. 3 for masters athletes).
   *  Takes the min with the method's `cutbackEveryNWeeks`, so recovery
   *  weeks come MORE often, never less. */
  cutbackEveryNWeeksCap?: number
}

/**
 * Distance-aware volume tuning. Methods declare a single `peakMileageRule`
 * and `longRunPctCap`, but the right peak volume and long-run length depend
 * heavily on the goal distance — a marathon block needs far more aerobic
 * volume and a much longer long run than a 5K block off the same base.
 *
 * These are applied only when the orchestrator passes a `raceDistance`
 * (direct unit-test callers don't, so method defaults are preserved):
 *
 *  - `DISTANCE_PEAK_MULT` is a FLOOR on the peak multiplier-of-current. The
 *    method value still wins when higher. The weekly ramp cap and the plan's
 *    runway naturally limit how much of an aggressive peak is actually
 *    reached, so this stays ramp-safe.
 *  - The long run is the min of three caps: a distance-appropriate share of
 *    weekly volume (`LONG_PCT`, raised for endurance so low-mileage marathoners
 *    still get real time-on-feet), an absolute distance ceiling
 *    (`LONG_MAX_MI`), and a time ceiling (`LONG_TIME_CAP_MIN`, translated to
 *    miles via the athlete's easy pace). This matches the widely-taught
 *    "20–30% of weekly, capped at ~2.5–3 h / 20–22 mi" guidance.
 */
const DISTANCE_PEAK_MULT: Record<RaceDistance, number> = {
  '5k': 1.3,
  '10k': 1.5,
  half_marathon: 1.8,
  marathon: 2.3,
  '50k': 2.5,
  '50_mile': 2.8,
  '100k': 3.0,
  '100_mile': 3.2,
  mountain_ultra: 2.8,
}

/**
 * Absolute FLOOR on peak weekly mileage (mi), by goal distance. The
 * multiplier-of-current model alone leaves a low-base athlete with a peak
 * that's far too low for the goal — a 10 mi/wk runner training for a half
 * peaks at 10 × 1.8 = 18 mi/wk, barely a 10K block, with a long run that
 * never reaches race distance. A distance floor pins the peak to a
 * race-appropriate minimum (~2× race distance for the half, matching the
 * widely-taught "peak ≈ twice the race distance" heuristic and published
 * 10 mi/wk-base half plans that top out near 25–30 mi/wk).
 *
 * This is only a floor — a higher-base athlete's multiplier-driven peak still
 * wins — and the per-week ramp cap in `buildWeeklyMileage` keeps the climb
 * toward it injury-safe. Distances without an entry keep the pure-multiplier
 * behavior (their multipliers already yield sane peaks off any real base).
 */
const DISTANCE_PEAK_FLOOR_MI: Partial<Record<RaceDistance, number>> = {
  half_marathon: 25,
  // Phase 2 (101-F1) — the marathon gets the same protection as the half
  // (product decision: enforced). "You can't fake your way to 13.1"
  // applies a fortiori to 26.2.
  marathon: 35,
}

/**
 * Phase 2 (101-F1) — REFERENCE race-readiness floors for the ultra
 * distances. Advisory-only (product decision): generation does not push
 * an ultra athlete's volume toward these, but arriving under them raises
 * the undertrained-arrival advisories (peak_unreachable /
 * volume_inadequate). Values await expert benchmarking (T4).
 */
export const REFERENCE_PEAK_FLOOR_MI: Partial<Record<RaceDistance, number>> = {
  half_marathon: 25,
  marathon: 35,
  '50k': 40,
  '50_mile': 45,
  '100k': 50,
  '100_mile': 50,
  mountain_ultra: 45,
}

/**
 * Absolute CEILING on peak weekly mileage (mi), by goal distance — the inverse
 * of the floor. The multiplier-of-current model has no upper bound, so a very
 * high self-reported base scales into an impossible peak (a 90 mi/wk marathoner
 * → 90 × 2.3 = 207 mi/wk). These caps are generous — set at the realistic elite
 * ceiling for each distance, so they only clip the absurd, never a legitimately
 * high-mileage athlete. No-distance callers (direct unit tests) are uncapped.
 */
const DISTANCE_PEAK_CAP_MI: Record<RaceDistance, number> = {
  '5k': 80,
  '10k': 90,
  half_marathon: 100,
  marathon: 140,
  '50k': 150,
  '50_mile': 160,
  '100k': 170,
  '100_mile': 170,
  mountain_ultra: 160,
}

/**
 * R2 — max GAIN over current weekly mileage a single block may build. The
 * pure multiplier model scales absurdly with the base it multiplies: a
 * 60 mi/wk marathoner × 2.3 = 138 mi/wk "peak" — a target no day content
 * can express, so every week failed target-adherence while the ramp
 * chased a number the athlete should never run. One block adds at most
 * this many weekly miles on top of what the athlete already handles
 * (~10%/wk compounding lands well inside these over a real build); the
 * distance FLOORS still win for low-base athletes, so race-readiness
 * minimums are untouched.
 */
const DISTANCE_PEAK_GAIN_MI: Record<RaceDistance, number> = {
  '5k': 15,
  '10k': 18,
  half_marathon: 20,
  marathon: 25,
  '50k': 28,
  '50_mile': 30,
  '100k': 32,
  '100_mile': 34,
  mountain_ultra: 30,
}

const LONG_PCT: Record<RaceDistance, number> = {
  '5k': 0.30,
  '10k': 0.30,
  half_marathon: 0.35,
  marathon: 0.40,
  '50k': 0.40,
  '50_mile': 0.40,
  '100k': 0.40,
  '100_mile': 0.40,
  mountain_ultra: 0.40,
}

const LONG_MAX_MI: Record<RaceDistance, number> = {
  '5k': 10,
  '10k': 12,
  half_marathon: 15,
  marathon: 22,
  '50k': 26,
  '50_mile': 30,
  '100k': 32,
  '100_mile': 34,
  mountain_ultra: 30,
}

const LONG_TIME_CAP_MIN: Record<RaceDistance, number> = {
  '5k': 90,
  '10k': 110,
  half_marathon: 150,
  marathon: 180,
  '50k': 210,
  '50_mile': 240,
  '100k': 270,
  '100_mile': 300,
  mountain_ultra: 240,
}

/**
 * R0 — distance-aware taper length, in weeks INCLUDING race week. Methods
 * author `taper.durationWeeks` for their flagship distance (usually the
 * marathon: Daniels' "classic 3-week marathon taper"), and the phase
 * allocator can pad further on compressed runways — which is how a 7-week
 * 5K plan shipped with 3 of its 7 weeks tapering. A 5K/10K taper is
 * 8–13 days in every published system; longer only sheds fitness.
 * Distances without an entry keep the method's authored value.
 */
export const TAPER_WEEKS_CAP: Partial<Record<RaceDistance, number>> = {
  '5k': 2,
  '10k': 2,
  half_marathon: 3,
}

/**
 * Shrink an over-long taper phase block to `maxTaperWeeks`, returning the
 * freed weeks to the previous (build) phase. Keeps every other block
 * untouched; a plan whose taper is already within the cap comes back
 * unchanged. Used with TAPER_WEEKS_CAP so short-race plans spend their
 * scarce runway building, not tapering.
 */
export function capTaperBlocks(
  blocks: PhaseBlock[],
  method: TrainingMethod,
  maxTaperWeeks: number,
): PhaseBlock[] {
  const taperPhase = method.phases.find(p => /taper/i.test(p.id) || /taper/i.test(p.name ?? ''))
  if (!taperPhase) return blocks
  const idx = blocks.findIndex(b => b.phaseId === taperPhase.id)
  if (idx <= 0) return blocks // no taper block, or nothing before it to absorb the weeks
  const taper = blocks[idx]
  const len = taper.endWeekIndex - taper.startWeekIndex + 1
  const excess = len - Math.max(1, maxTaperWeeks)
  if (excess <= 0) return blocks
  return blocks.map((b, i) => {
    if (i === idx - 1) return { ...b, endWeekIndex: b.endWeekIndex + excess }
    if (i === idx) return { ...b, startWeekIndex: b.startWeekIndex + excess }
    return b
  })
}

/** Distance-aware inputs the orchestrator threads into the volume builder. */
export interface VolumeDistanceOpts {
  /** Goal race distance — drives peak multiplier floor + long-run caps. */
  raceDistance?: RaceDistance
  /** Hard ceiling on taper length in weeks (race week included) — see
   *  TAPER_WEEKS_CAP. Wins over both the method's authored duration and
   *  the phase allocation. */
  maxTaperWeeks?: number
  /** R1 — multiplier on weekly volume (peak AND start), from the athlete's
   *  running-day availability (DAYS_VOLUME_FACTOR: 3 days ≈ 0.75× of the
   *  5-day baseline). Volume scales with frequency instead of cramming
   *  the same miles into fewer, longer runs. */
  volumeFactor?: number
  /** R1 — multiplier on the long-run TIME cap (e.g. 0.85 for seniors),
   *  bounding the single most fatiguing session before weekly volume. */
  longRunTimeCapMult?: number
  /** Athlete's easy pace (sec/mile), used to convert the long-run time cap
   *  into a distance. Falls back to a 10:00/mi default when unknown. */
  easyPaceSecPerMile?: number
  /** Predicted race finish time (minutes, vert-adjusted). When present, the
   *  peak long run is floored at a fraction of it so the biggest training
   *  day scales with how long race day will actually take (P2 — the v1 plan
   *  peaked at 88 min for a 2:15-3:00 race). */
  predictedFinishMin?: number
  /** Effort-adjusted pace multiplier for climby terrain (≥1). Converts the
   *  duration floor into honest miles: on steep ground the same minutes
   *  cover fewer miles. */
  gradeAdjFactor?: number
  /** R2 — the generating method's authored long-run share cap
   *  (methodInvariants registry). Bounds the long run's slice of weekly
   *  volume at generation time so the QA gate isn't the first place the
   *  method's own rule is heard. */
  methodLongRunPctCap?: number
  /** R2 — the method's absolute long-run ceiling in miles, where authored
   *  (Hansons: "capped at 16 miles — never exceed"). */
  methodLongRunAbsCapMi?: number
  /** R2 — planned RUNNING days per week, for the content-ceiling peak cap:
   *  a weekly target must be expressible by the day content (long-run time
   *  cap + ~80 min on each other run day), or the ramp chases a number the
   *  plan never prescribes and every week fails target-adherence. */
  runningDays?: number
  /** R4 — the method's own authored easy-day ceiling (max minutes of its
   *  easy-run window). Sharpens the content-ceiling peak cap to the
   *  method's real windows: targets past what the day cards can clamp to
   *  produced identical maxed-out weeks under climbing targets. */
  easyDayMaxMin?: number
}

/** Fallback ceiling on a non-long run day (minutes) when the method's own
 *  easy window isn't supplied — methods cap easy days near 75–90 min. */
const CONTENT_CAP_MIN_PER_DAY = 80

/** Non-long days aren't ALL full easy days (quality days run shorter), so
 *  the content ceiling discounts the per-day window slightly. */
const CONTENT_CAP_DAY_DISCOUNT = 0.9

/** Fraction of the predicted finish duration the peak long run should reach
 *  (time on feet). 65% is the common trail-coaching band for races in the
 *  2-4 h range; the method/date caps still bound it above. */
const LONG_RUN_PCT_OF_FINISH = 0.65

/** Never let the duration floor push the long run past half the week. */
const LONG_RUN_MAX_PCT_OF_WEEK = 0.5

const DEFAULT_EASY_PACE_SEC_PER_MILE = 600 // 10:00/mi

/**
 * Long-run miles for a build week. With no goal distance we fall back to the
 * method's flat `longRunPctCap × total` (legacy behavior, ≤ 1-decimal floor).
 * With a goal distance we take the min of three evidence-based caps so the
 * long run scales with weekly volume but never overruns the distance- /
 * time-appropriate ceiling.
 */
function longRunMilesFor(
  totalMi: number,
  methodPctCap: number,
  opts: VolumeDistanceOpts,
): number {
  const floor1 = (mi: number) => Math.floor(mi * 10) / 10
  if (!opts.raceDistance) return floor1(totalMi * methodPctCap)

  const pct = LONG_PCT[opts.raceDistance]
  const easyPaceMinPerMile = (opts.easyPaceSecPerMile ?? DEFAULT_EASY_PACE_SEC_PER_MILE) / 60
  const timeCapMi = (LONG_TIME_CAP_MIN[opts.raceDistance] * (opts.longRunTimeCapMult ?? 1)) / easyPaceMinPerMile
  // R2 — the method's own authored ceilings join the distance ceilings:
  // an absolute cap where declared (Hansons 16 mi) and the method's
  // long-run share of the week (Daniels ≤30%).
  const maxMi = Math.min(LONG_MAX_MI[opts.raceDistance], opts.methodLongRunAbsCapMi ?? Infinity)
  const invPct = opts.methodLongRunPctCap ?? 1
  let target = Math.min(totalMi * pct, maxMi, timeCapMi, totalMi * invPct)
  // P2 — duration adequacy: the peak long run should reach a fraction of the
  // predicted race DURATION (time on feet governs trail readiness, not
  // miles). Convert that duration into miles via the effort-adjusted pace,
  // then keep every existing ceiling: the method time cap, the absolute
  // distance cap, and half the week's volume.
  if (opts.predictedFinishMin && opts.predictedFinishMin > 0) {
    const effortPaceMinPerMile = easyPaceMinPerMile * (opts.gradeAdjFactor ?? 1)
    const durationFloorMi =
      (LONG_RUN_PCT_OF_FINISH * opts.predictedFinishMin) / effortPaceMinPerMile
    const floorCapped = Math.min(durationFloorMi, timeCapMi, maxMi, totalMi * LONG_RUN_MAX_PCT_OF_WEEK)
    target = Math.max(target, floorCapped)
  }
  // Never go below what the flat method cap would have produced (the
  // distance-aware path should only lengthen the long run), but never exceed
  // the absolute distance ceiling either. R0 exception: for SHORT races the
  // distance share wins downward too — an ultra method's 55%-of-week long
  // run has no business in a 5K/10K plan (it starved every other day and
  // blew the weekly budget on low-volume athletes).
  const isShortRace = opts.raceDistance === '5k' || opts.raceDistance === '10k'
  // The invariant share cap bounds the method-pct floor too — "never go
  // below the flat method cap" must not resurrect a share the method's
  // own invariants forbid.
  const effMethodPct = Math.min(isShortRace ? Math.min(methodPctCap, pct) : methodPctCap, invPct)
  return floor1(Math.min(Math.max(target, totalMi * effMethodPct), maxMi))
}

/**
 * Compute weekly mileage targets — linear build from
 * `current × startMileagePctOfPeak` up to `current × peakMileageRule.value`,
 * with cutback weeks at `cutbackEveryNWeeks` and a final taper per
 * `method.taper.weeklyVolumePcts`. Mileage is capped each week so
 * week-over-week growth never exceeds `maxWeeklyIncreasePct`.
 */
export function buildWeeklyMileage(
  method: TrainingMethod,
  totalWeeks: number,
  blocks: PhaseBlock[],
  currentWeeklyMileage: number,
  adjust: MileageProgressionAdjust = {},
  opts: VolumeDistanceOpts = {},
): WeekMileage[] {
  const mp = method.mileageProgression
  // Distance-aware peak: take the larger of the method's multiplier and the
  // goal-distance floor. With no distance supplied (direct unit-test callers)
  // this is exactly the method's value, preserving prior behavior.
  const distancePeakMult = opts.raceDistance ? DISTANCE_PEAK_MULT[opts.raceDistance] : 0
  const peakMult = Math.max(mp.peakMileageRule.value, distancePeakMult)
  // Floor the peak at a distance-appropriate minimum so low-base athletes still
  // build real race-specific volume (see DISTANCE_PEAK_FLOOR_MI).
  const distancePeakFloor = opts.raceDistance ? (DISTANCE_PEAK_FLOOR_MI[opts.raceDistance] ?? 0) : 0
  // Floor at a race-appropriate minimum, then cap at a sane ceiling so a very
  // high base can't scale into an impossible peak. Uncapped without a distance.
  const distancePeakCap = opts.raceDistance ? DISTANCE_PEAK_CAP_MI[opts.raceDistance] : Infinity
  // R1 — availability scaling: peak volume follows running-day frequency
  // (3 days ≈ 0.75× of the 5-day baseline), applied after floors/caps so
  // low-frequency athletes get proportionally less weekly volume rather
  // than the same miles crammed into longer runs.
  const volumeFactor = opts.volumeFactor ?? 1
  // R2 — bound the multiplier model's GAIN over current: one block adds at
  // most DISTANCE_PEAK_GAIN_MI on top of what the athlete already runs.
  // Applied to the multiplier term only — the race-readiness floor still
  // lifts low-base athletes (see DISTANCE_PEAK_GAIN_MI).
  const peakGainCap = opts.raceDistance && currentWeeklyMileage > 0
    ? currentWeeklyMileage + DISTANCE_PEAK_GAIN_MI[opts.raceDistance]
    : Infinity
  // The factor scales the multiplier-of-current model, never the distance
  // race-readiness floor — a 4-day half athlete still needs ~25 mi weeks.
  const peakFromCurrent = Math.min(currentWeeklyMileage * peakMult * volumeFactor, peakGainCap)
  // R2 — content ceiling: the peak must be EXPRESSIBLE by the day content
  // (the long run's time cap plus ~80 min on each other run day at easy
  // pace), or the ramp model prescribes weekly totals no set of day cards
  // can add up to and target-adherence fails plan-wide (the sweep's elite
  // 60 mi/wk persona: a 138 mi "peak" against ~60 mi of buildable content).
  const easyPaceMinPerMi = (opts.easyPaceSecPerMile ?? DEFAULT_EASY_PACE_SEC_PER_MILE) / 60
  const contentCapMi = opts.raceDistance && opts.runningDays
    ? (LONG_TIME_CAP_MIN[opts.raceDistance] * (opts.longRunTimeCapMult ?? 1)
        + Math.max(0, opts.runningDays - 1) * (opts.easyDayMaxMin ?? CONTENT_CAP_MIN_PER_DAY) * CONTENT_CAP_DAY_DISCOUNT) / easyPaceMinPerMi
    : Infinity
  const peak = Math.min(Math.max(peakFromCurrent, distancePeakFloor), distancePeakCap, contentCapMi)
  const startPctMul = adjust.startPctMultiplier ?? 1
  // Never open the plan *below* what the athlete already runs each week — they
  // do that volume safely today, so starting lower just detrains them. Apply
  // any injury de-load to the method's start FIRST, then floor at current
  // weekly mileage: a returning athlete already at 10 mi/wk opens at 10, not 8
  // (the de-load only bites when the method start would otherwise sit *above*
  // current). Capped at peak.
  // Phase 1 (105-F2) — global ramp-step ceiling: the QA gate errors when a
  // week grows >30% over the last FULL week, and a cutback between two
  // build weeks makes that comparison span TWO ramp steps. Two authored
  // 15% steps compound to +32% — a false alarm baked into the method
  // value. 13.5% compounds to +28.8%, inside the bound with margin.
  const RAMP_STEP_CEILING = 0.135
  const maxWeeklyIncreasePct = Math.min(
    adjust.maxWeeklyIncreasePctCap != null
      ? Math.min(mp.maxWeeklyIncreasePct, adjust.maxWeeklyIncreasePctCap)
      : mp.maxWeeklyIncreasePct,
    RAMP_STEP_CEILING,
  )
  // R2 — when the athlete told us what they run today, week 1 is at most
  // one ramp step above it. Methods that open near peak (Pfitzinger's
  // startMileagePctOfPeak ≈ 1) assume the base already exists — opening
  // 30-50% above a STATED current base is exactly the cliff the weekly
  // ramp cap forbids between any other two weeks. Athletes with no stated
  // base (currentWeeklyMileage 0) keep the method's start.
  const startRampCap = currentWeeklyMileage > 0
    ? currentWeeklyMileage * (1 + maxWeeklyIncreasePct)
    : Infinity
  const start = Math.min(
    Math.max(peak * mp.startMileagePctOfPeak * startPctMul, currentWeeklyMileage),
    peak,
    startRampCap,
  )
  // The volume taper must cover every week the phase allocator labels
  // "Taper" — with only method.taper.durationWeeks tapering, a longer
  // allocated taper phase shipped peak-volume weeks under a Taper label
  // (the v1 "17.5 mi taper" complaint). When the phase runs longer than
  // the declared taper, extend the percentage ladder upward so the extra
  // early taper weeks step down gently from full volume.
  const taperPhase = method.phases.find(p => /taper/i.test(p.id) || /taper/i.test(p.name ?? ''))
  const taperBlock = taperPhase ? blocks.find(b => b.phaseId === taperPhase.id) : undefined
  const phaseTaperWeeks = taperBlock ? taperBlock.endWeekIndex - taperBlock.startWeekIndex + 1 : 0
  const taperWeeks = Math.min(
    Math.max(method.taper.durationWeeks, phaseTaperWeeks),
    // R0 — distance cap: a 5K never carries a marathon-length taper.
    opts.maxTaperWeeks ?? Infinity,
    Math.max(1, totalWeeks - 1), // never taper the whole plan
  )
  const taperPcts = [...method.taper.weeklyVolumePcts]
  while (taperPcts.length < taperWeeks) taperPcts.unshift((1 + taperPcts[0]) / 2)
  const peakWeekIndex = totalWeeks - taperWeeks - 1  // last build week before taper

  const out: WeekMileage[] = []
  // Track the highest non-cutback build week so cutbacks don't permanently
  // stunt the cap-based growth — week N+1 after a cutback can build back up
  // toward the trend, not just toward the cut value.
  let lastBuildMi = start
  // Track the longest BUILD-week long run so the taper can step DOWN from it and
  // never introduce a new longest run. Build weeks always precede taper weeks,
  // so this is fully populated before the first taper week is computed.
  let peakBuildLongMi = 0
  for (let w = 0; w < totalWeeks; w++) {
    const phaseId = phaseIdAtWeek(blocks, w)
    const isTaperWeek = w >= totalWeeks - taperWeeks
    let totalMi: number
    let isCutback = false

    if (isTaperWeek) {
      const taperIdx = w - (totalWeeks - taperWeeks)
      const pct = Math.min(1, taperPcts[taperIdx] ?? taperPcts[taperPcts.length - 1])
      // Anchor the taper to the volume the athlete ACTUALLY reached in the
      // final build week — the ramp cap can hold that well under the
      // theoretical `peak`, and a taper percentage of the un-achieved peak
      // can out-volume the build it follows (v1 shipped a "Taper" week
      // bigger than three of its base weeks). Also enforce a monotonic
      // step-down through the taper: no taper week ever exceeds the week
      // before it.
      totalMi = lastBuildMi * pct
      const prevMi = out.length > 0 ? out[out.length - 1].totalMi : lastBuildMi
      totalMi = Math.min(totalMi, prevMi)
    } else {
      // Linear-ish build from start → peak across non-taper weeks
      const span = Math.max(1, peakWeekIndex)
      const t = Math.min(1, w / span)
      const linear = start + (peak - start) * t
      // Cap week-over-week growth against the last NON-cutback build week
      const cap = lastBuildMi * (1 + maxWeeklyIncreasePct)
      totalMi = Math.min(linear, cap)
      // Cutback week — drop to cutbackPct of the last build mileage, but
      // don't disturb the trend baseline for next week's cap calc.
      // R1 — masters cadence cap: recovery weeks come at least this often.
      const cutbackEvery = adjust.cutbackEveryNWeeksCap != null && mp.cutbackEveryNWeeks > 0
        ? Math.min(mp.cutbackEveryNWeeks, adjust.cutbackEveryNWeeksCap)
        : mp.cutbackEveryNWeeks
      if (cutbackEvery > 0 && (w + 1) % cutbackEvery === 0 && w < peakWeekIndex) {
        totalMi = lastBuildMi * mp.cutbackPct
        isCutback = true
      } else {
        lastBuildMi = totalMi
      }
    }

    // Round total to 1 decimal first, then derive longRunMi against the rounded
    // total.
    const totalRounded = Math.round(totalMi * 10) / 10
    let longRunRounded: number
    if (isTaperWeek) {
      // The long run tapers DOWN with weekly volume, anchored to the peak build
      // long run and never exceeding it — a taper must not introduce a new
      // longest run. It stays under the same distance / time ceilings as the
      // build too: the prior flat `total × longRunPctCap` skipped LONG_MAX_MI,
      // so a high-volume taper week (e.g. an ultra's first taper week) could
      // emit a long run longer than any capped build week. Falls back to the
      // flat cap only in the degenerate case of a plan with no build weeks.
      const taperIdx = w - (totalWeeks - taperWeeks)
      const taperPct = taperPcts[taperIdx] ?? taperPcts[taperPcts.length - 1]
      const taperedLong = peakBuildLongMi > 0
        ? peakBuildLongMi * Math.min(1, taperPct)
        : totalRounded * mp.longRunPctCap
      longRunRounded = Math.min(
        Math.floor(taperedLong * 10) / 10,
        longRunMilesFor(totalRounded, mp.longRunPctCap, opts),
      )
    } else {
      longRunRounded = longRunMilesFor(totalRounded, mp.longRunPctCap, opts)
      peakBuildLongMi = Math.max(peakBuildLongMi, longRunRounded)
    }
    out.push({
      weekIndex: w,
      weekNumber: w + 1,
      totalMi: totalRounded,
      longRunMi: longRunRounded,
      isCutback,
      isTaper: isTaperWeek,
      phaseId,
    })
  }
  return out
}

/** Map Onboarding's `first_timer` onto the method-side experience scale. */
export function mapToMethodExperience(level: OnboardingExperienceLevel): MethodExperienceLevel {
  return level === 'first_timer' ? 'beginner' : level
}
