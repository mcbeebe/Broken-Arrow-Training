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

  // Adjust to sum exactly
  let delta = totalWeeks - weeks.reduce((s, w) => s + w, 0)
  // Distribute the delta: positive → add to later phases; negative → subtract from later
  let i = phases.length - 1
  while (delta !== 0 && i >= 0) {
    if (delta > 0) {
      weeks[i] += 1
      delta -= 1
    } else {
      if (weeks[i] > 1) {
        weeks[i] -= 1
        delta += 1
      }
    }
    i -= 1
    if (i < 0 && delta !== 0) i = phases.length - 1  // wrap
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

/** Distance-aware inputs the orchestrator threads into the volume builder. */
export interface VolumeDistanceOpts {
  /** Goal race distance — drives peak multiplier floor + long-run caps. */
  raceDistance?: RaceDistance
  /** Athlete's easy pace (sec/mile), used to convert the long-run time cap
   *  into a distance. Falls back to a 10:00/mi default when unknown. */
  easyPaceSecPerMile?: number
}

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
  const timeCapMi = LONG_TIME_CAP_MIN[opts.raceDistance] / easyPaceMinPerMile
  const maxMi = LONG_MAX_MI[opts.raceDistance]
  const target = Math.min(totalMi * pct, maxMi, timeCapMi)
  // Never go below what the flat method cap would have produced (the
  // distance-aware path should only lengthen the long run), but never exceed
  // the absolute distance ceiling either.
  return floor1(Math.min(Math.max(target, totalMi * methodPctCap), maxMi))
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
  const peak = Math.max(currentWeeklyMileage * peakMult, distancePeakFloor)
  const startPctMul = adjust.startPctMultiplier ?? 1
  // Never open the plan *below* what the athlete already runs each week — they
  // do that volume safely today, so starting lower just detrains them. Apply
  // any injury de-load to the method's start FIRST, then floor at current
  // weekly mileage: a returning athlete already at 10 mi/wk opens at 10, not 8
  // (the de-load only bites when the method start would otherwise sit *above*
  // current). Capped at peak.
  const start = Math.min(
    Math.max(peak * mp.startMileagePctOfPeak * startPctMul, currentWeeklyMileage),
    peak,
  )
  const maxWeeklyIncreasePct = adjust.maxWeeklyIncreasePctCap != null
    ? Math.min(mp.maxWeeklyIncreasePct, adjust.maxWeeklyIncreasePctCap)
    : mp.maxWeeklyIncreasePct
  const taperWeeks = method.taper.durationWeeks
  const taperPcts = method.taper.weeklyVolumePcts
  const peakWeekIndex = totalWeeks - taperWeeks - 1  // last build week before taper

  const out: WeekMileage[] = []
  // Track the highest non-cutback build week so cutbacks don't permanently
  // stunt the cap-based growth — week N+1 after a cutback can build back up
  // toward the trend, not just toward the cut value.
  let lastBuildMi = start
  for (let w = 0; w < totalWeeks; w++) {
    const phaseId = phaseIdAtWeek(blocks, w)
    const isTaperWeek = w >= totalWeeks - taperWeeks
    let totalMi: number
    let isCutback = false

    if (isTaperWeek) {
      const taperIdx = w - (totalWeeks - taperWeeks)
      totalMi = peak * (taperPcts[taperIdx] ?? taperPcts[taperPcts.length - 1])
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
      if (mp.cutbackEveryNWeeks > 0 && (w + 1) % mp.cutbackEveryNWeeks === 0 && w < peakWeekIndex) {
        totalMi = lastBuildMi * mp.cutbackPct
        isCutback = true
      } else {
        lastBuildMi = totalMi
      }
    }

    // Round total to 1 decimal first, then floor longRunMi against the
    // rounded total — preserves the invariant longRunMi ≤ totalMi × pctCap.
    const totalRounded = Math.round(totalMi * 10) / 10
    const longRunRounded = isTaperWeek
      ? Math.floor(totalRounded * mp.longRunPctCap * 10) / 10
      : longRunMilesFor(totalRounded, mp.longRunPctCap, opts)
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
