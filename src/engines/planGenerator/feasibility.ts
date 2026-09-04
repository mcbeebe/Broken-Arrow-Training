/**
 * Feasibility & honesty advisories — the engine's truth-teller.
 *
 * Pure functions that look at the onboarding answers (and optionally the chosen
 * method) and surface plain-language `PlanAdvisory`s: whether the goal is
 * realistic in the time available, whether paces are goal-derived (no recent
 * result), whether the distance is a big jump for the experience level, whether
 * paces are extrapolated across very different distances, and how tight the
 * runway is. Per product decision, we **warn and suggest a realistic
 * alternative** — we never block plan generation.
 *
 * Reuses the existing VDOT math (vdot.ts) and `athleteCurrentVdot` (paceTargets)
 * so the numbers match what the plan generator computes.
 */
import { todayDateString } from '../../utils/planDates'
import type { PlanAdvisory } from '../../types'
import type { OnboardingConfig, RaceDistance, ExperienceLevel } from '../../hooks/useOnboarding'
import type { TrainingMethod } from '../../types/training-method'
import { athleteCurrentVdot } from './paceTargets'
import { vdotFromRace, sanitizeRaceTimeSeconds, FITNESS_ANCHOR_DISTANCES } from './vdot'

/** Race-distance → miles. Mirrors RACE_DISTANCE_LABELS in generatePlan.ts (keep
 *  in sync). mountain_ultra is 0 → no goal-time pacing for it (matches the engine). */
export const RACE_DISTANCE_MILES: Record<RaceDistance, number> = {
  '5k': 3.1,
  '10k': 6.2,
  half_marathon: 13.1,
  marathon: 26.2,
  '50k': 31.1,
  '50_mile': 50,
  '100k': 62.1,
  '100_mile': 100,
  mountain_ultra: 0,
}

const ULTRA_DISTANCES: ReadonlySet<RaceDistance> = new Set<RaceDistance>([
  '50k', '50_mile', '100k', '100_mile', 'mountain_ultra',
])

const ANCHOR_LABELS: Record<string, string> = {
  race_5k: '5K', race_10k: '10K', race_hm: 'half-marathon', race_marathon: 'marathon',
}

/** Realistic single-block fitness gain: ~8% VDOT (mirrors the goal-pace cap). */
export const REALISTIC_VDOT_GAIN = 1.08

/** Experience levels, easiest → hardest, for measuring the gap between what an
 *  athlete *says* they are and what their training volume *implies*. */
const EXPERIENCE_ORDER: ExperienceLevel[] = ['first_timer', 'beginner', 'intermediate', 'advanced', 'elite']
const EXPERIENCE_LABEL: Record<ExperienceLevel, string> = {
  first_timer: 'first-timer', beginner: 'beginner', intermediate: 'intermediate', advanced: 'advanced', elite: 'elite',
}
/** The experience band a measured weekly mileage points to. Boundaries sit
 *  between the per-level typical volumes the generator already assumes
 *  (estimateCurrentWeeklyMileage: 6 / 10 / 20 / 32 / 48 mi). */
function impliedLevelFromMileage(mi: number): number {
  if (mi < 8) return 0   // first_timer
  if (mi < 15) return 1  // beginner
  if (mi < 26) return 2  // intermediate
  if (mi < 40) return 3  // advanced
  return 4               // elite
}

function formatClock(seconds: number): string {
  const s = Math.round(seconds)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const pad = (n: number) => (n < 10 ? '0' + n : '' + n)
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`
}

/**
 * Predict a race time (seconds) for a given VDOT at a distance — the numerical
 * inverse of `vdotFromRace` (monotonic: more time → slower → lower VDOT).
 * Used to translate "realistic VDOT" into a concrete suggested goal time.
 */
export function predictRaceTime(vdot: number, distanceMiles: number): number {
  if (vdot <= 0 || distanceMiles <= 0) return 0
  let lo = distanceMiles * 240   // 4:00/mi — faster than any human
  let hi = distanceMiles * 1500  // 25:00/mi — slower than any race effort
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2
    const v = vdotFromRace({ distanceMiles, timeSeconds: mid })
    if (v > vdot) lo = mid // too fast for this VDOT → needs more time
    else hi = mid
  }
  return Math.round((lo + hi) / 2)
}

/** Whole weeks until race day (Monday-aligned, never negative). Mirrors the
 *  generator's runway clamp so the advisory fires consistently with it. */
function weeksUntilRace(raceDateIso: string, todayIso: string): number {
  const monday = (iso: string) => {
    const d = new Date(iso + 'T12:00:00')
    const sinceMon = (d.getDay() + 6) % 7
    d.setDate(d.getDate() - sinceMon)
    return d.getTime()
  }
  const days = Math.round((monday(raceDateIso) - monday(todayIso)) / 86400000)
  return Math.max(0, Math.floor(days / 7) + 1)
}

/**
 * Assess feasibility and return honest advisories. `method` is optional: pass it
 * (or the top recommended pick) to include the runway check, which needs the
 * method's supported plan lengths. Distance/goal/anchor checks are method-agnostic.
 */
export function assessFeasibility(
  config: OnboardingConfig,
  todayIso: string = todayDateString(),
  method?: TrainingMethod,
): PlanAdvisory[] {
  const out: PlanAdvisory[] = []
  const dist = config.raceDistance
  const raceMiles = dist ? (RACE_DISTANCE_MILES[dist] ?? 0) : 0

  const currentVdot = athleteCurrentVdot(config)
  const goalSeconds = raceMiles > 0 ? sanitizeRaceTimeSeconds(config.goalRaceTimeSeconds, raceMiles) : null
  const goalVdot = goalSeconds != null ? vdotFromRace({ distanceMiles: raceMiles, timeSeconds: goalSeconds }) : null

  // Goal entered but no recent result → paces are derived from the goal itself.
  if (goalSeconds != null && currentVdot == null) {
    out.push({
      id: 'goal_no_anchor',
      severity: 'info',
      title: 'Paces set from your goal',
      detail: 'You gave a goal time but no recent race, so your training paces are built from the goal itself rather than a measured effort.',
      suggestion: 'Run a tune-up race or time trial in the first few weeks to confirm these paces fit your current fitness.',
    })
  }

  // Goal vs current fitness — warn + suggest a realistic alternative.
  if (goalVdot != null && currentVdot != null && goalVdot > currentVdot * REALISTIC_VDOT_GAIN) {
    const pct = Math.round((goalVdot / currentVdot - 1) * 100)
    const realisticSeconds = raceMiles > 0 ? predictRaceTime(currentVdot * REALISTIC_VDOT_GAIN, raceMiles) : null
    out.push({
      id: 'goal_ambitious',
      severity: goalVdot > currentVdot * 1.15 ? 'critical' : 'caution',
      title: 'Ambitious goal',
      detail: `Your goal is about ${pct}% faster than your current fitness suggests — more than a single focused block typically delivers (~8%).`,
      suggestion: realisticSeconds != null
        ? `A strong, realistic target from where you are now is around ${formatClock(realisticSeconds)}. Keep the bigger goal for a later season once this base is in.`
        : undefined,
    })
  }

  // Distance vs experience — first ultra off a low base.
  if (dist && ULTRA_DISTANCES.has(dist) && (config.experienceLevel === 'first_timer' || config.experienceLevel === 'beginner')) {
    out.push({
      id: 'ultra_experience',
      severity: 'critical',
      title: 'Big jump in distance',
      detail: `An ultra is a major step for a ${config.experienceLevel.replace('_', ' ')} runner — the weekly volume and time-on-feet are well beyond a first build.`,
      suggestion: 'Consider a 50K or a road marathon first, or budget roughly a year of consistent base before committing to the ultra.',
    })
  }

  // Stated experience vs. measured base mileage. A self-reported level over-drives
  // the plan (method fit, mileage ramp), so when the athlete's actual weekly volume
  // points to a clearly different level (≥2 bands off), say so plainly and name the
  // fix — don't let a miscalibrated dropdown silently set the ramp. Only fires when
  // there's a measured mileage to compare against.
  const weeklyMi = config.currentWeeklyMileage
  if (weeklyMi != null && weeklyMi > 0) {
    const statedIdx = EXPERIENCE_ORDER.indexOf(config.experienceLevel)
    const impliedIdx = impliedLevelFromMileage(weeklyMi)
    if (statedIdx >= 0 && Math.abs(statedIdx - impliedIdx) >= 2) {
      const statedLabel = EXPERIENCE_LABEL[config.experienceLevel]
      const impliedLabel = EXPERIENCE_LABEL[EXPERIENCE_ORDER[impliedIdx]]
      const overClaim = statedIdx > impliedIdx
      const mi = Math.round(weeklyMi)
      out.push({
        id: 'experience_mismatch',
        severity: overClaim ? 'caution' : 'info',
        title: 'Experience vs. mileage',
        detail: overClaim
          ? `You picked “${statedLabel}”, but about ${mi} mi/wk is closer to a ${impliedLabel} base — the plan leans on the level you chose, so it may ramp faster than your current volume supports.`
          : `You picked “${statedLabel}”, but about ${mi} mi/wk is well above a typical ${statedLabel} base, so the plan may start more conservatively than you need.`,
        suggestion: overClaim
          ? `If ${mi} mi/wk is right, choosing ${impliedLabel} — or adding a recent race time — will match the ramp to your fitness.`
          : `If that mileage is right, choosing ${impliedLabel} — or adding a recent race time — will better match your base.`,
      })
    }
  }

  // Cross-distance anchor extrapolation.
  const fa = config.fitnessAnchor
  if (fa && raceMiles > 0) {
    const anchorMiles = FITNESS_ANCHOR_DISTANCES[fa.type]
    if (anchorMiles && anchorMiles > 0) {
      const ratio = Math.max(anchorMiles, raceMiles) / Math.min(anchorMiles, raceMiles)
      if (ratio >= 4) {
        out.push({
          id: 'cross_distance',
          severity: 'info',
          title: 'Paces estimated across distances',
          detail: `Your paces are extrapolated from a ${ANCHOR_LABELS[fa.type] ?? 'recent'} effort to a very different race distance (~${Math.round(ratio)}× gap), so treat them as an estimate.`,
          suggestion: 'A recent effort closer to your race distance would sharpen these paces.',
        })
      }
    }
  }

  // Runway — needs the method to know its shortest supported build.
  if (method && config.raceDate) {
    const weeksAvail = weeksUntilRace(config.raceDate, todayIso)
    const minWeeks = Math.min(...method.generationRules.supportedPlanWeeks)
    if (weeksAvail < minWeeks) {
      out.push({
        id: 'runway_short',
        severity: weeksAvail < 4 ? 'critical' : 'caution',
        title: 'Tight runway',
        detail: `Your race is about ${weeksAvail} week${weeksAvail === 1 ? '' : 's'} away — less than this method’s usual ${minWeeks}-week build, so the plan is compressed into the time you have.`,
        suggestion: weeksAvail < 4
          ? 'With this little time, focus on sharpening and arriving fresh rather than building new fitness.'
          : 'Keep early intensity modest — there isn’t room to safely absorb a big jump in training load.',
      })
    }
  }

  return out
}
