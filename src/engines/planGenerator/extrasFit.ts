import type { OnboardingConfig } from '../../hooks/useOnboarding'
import { RECOMMENDABLE_METHODS } from '../../data/methods'
import { inputsFromOnboarding, selectMethods } from './methodSelection'

/**
 * Decision 6c — foresee, at onboarding, whether a running method's floor
 * leaves room for the strength / cross days the athlete asked for.
 *
 * The method wins when its running minimum fills the week (decision 6a,
 * shipped in #415): a 4-day athlete on a 5-day-minimum method gets five
 * running days and no strength, and #415 made the plan SAY so afterward.
 * This is the same truth, told BEFORE the plan is generated, so the athlete
 * can spend a day, drop an extra, or accept it — rather than discovering it
 * in an advisory on a plan they already committed to.
 *
 * `assessExtrasFit` mirrors the generator's own day-budget arithmetic
 * (generatePlan.ts, the `runningDaysTarget` / `extrasCap` / `weekMaxExtras`
 * chain) so the forecast cannot drift from what the plan actually does — a
 * test pins the two together across the road persona set.
 */

export interface ExtrasFitAssessment {
  /** The method the plan will use, when one resolves (road / trail only). */
  methodName: string | null
  /** Method's minimum running days across its weekly patterns. */
  minRunDays: number
  /** Method's maximum running days across its weekly patterns. */
  maxRunDays: number
  /** Strength + cross days the athlete asked for. */
  extrasRequested: number
  /** The day budget the forecast reasons from: the requested total, capped
   *  at 6 for the mandatory weekly rest day. The injury day-cap is unknown
   *  at the strength step (health comes later), so it is not applied here —
   *  an injury only tightens the squeeze, never loosens it. */
  dayBudget: number
  /** Running days the plan will actually schedule (the method floor wins). */
  runningDaysActual: number
  /** Extra days that will actually fit in a typical build week. */
  extrasThatFit: number
  /** True when not all the requested extras fit. */
  overBudget: boolean
  /** True when the running floor alone fills the budget, so ZERO extras fit. */
  noneFit: boolean
  /** Days it would take to honour everything: minRunDays + extrasRequested. */
  daysForAll: number
}

/**
 * Pure day-budget arithmetic. Every line mirrors generatePlan.ts so the
 * onboarding forecast and the generated plan agree on how many strength /
 * cross days survive the method's running floor.
 */
export function assessExtrasFit(args: {
  minRunDays: number
  maxRunDays: number
  extrasRequested: number
  dayBudget: number
  methodName?: string | null
}): ExtrasFitAssessment {
  const { minRunDays, maxRunDays, extrasRequested, dayBudget } = args
  // generatePlan.ts: runningDaysTarget = clamp(dayBudget - extras, min, max)
  const runningDaysActual = Math.max(minRunDays, Math.min(maxRunDays, dayBudget - extrasRequested))
  const extrasBudget = Math.max(0, dayBudget - runningDaysActual)
  const extrasFloor = extrasRequested > 0 ? 1 : 0
  const extrasInWeekCap = Math.max(0, 7 - runningDaysActual)
  const extrasCap = Math.min(extrasRequested, Math.max(extrasBudget, extrasFloor), extrasInWeekCap)
  // A build week runs `runningDaysActual` days; the plan tolerates one day
  // over the requested total ONLY when the running floor makes it
  // unavoidable, which is how a single extra can still land in a week the
  // athlete filled with running.
  const overshootUnavoidable = runningDaysActual + Math.min(extrasFloor, extrasCap) > dayBudget
  const weekAllowance = dayBudget + (overshootUnavoidable ? 1 : 0)
  const extrasThatFit = Math.min(extrasCap, Math.max(0, weekAllowance - runningDaysActual))
  return {
    methodName: args.methodName ?? null,
    minRunDays,
    maxRunDays,
    extrasRequested,
    dayBudget,
    runningDaysActual,
    extrasThatFit,
    overBudget: extrasThatFit < extrasRequested,
    noneFit: extrasRequested > 0 && extrasThatFit === 0,
    daysForAll: minRunDays + extrasRequested,
  }
}

/** The method the plan would pick for this config, and its running-day span.
 *  Null for anything but a method-based running plan (road / trail) — Hyrox
 *  and general fitness carry strength in their own engines, with no running
 *  floor to fit around. */
export function resolveRunMethodMeta(
  config: OnboardingConfig,
): { methodName: string; minRunDays: number; maxRunDays: number } | null {
  if (config.raceType !== 'road' && config.raceType !== 'trail') return null
  const inputs = inputsFromOnboarding(config)
  if (!inputs) return null
  const [top] = selectMethods(RECOMMENDABLE_METHODS, inputs)
  const method = top ? RECOMMENDABLE_METHODS.find(m => m.id === top.methodId) : undefined
  if (!method) return null
  const patternDays = method.weeklyPatterns.map(p => p.daysPerWeek)
  if (patternDays.length === 0) return null
  return { methodName: method.name, minRunDays: Math.min(...patternDays), maxRunDays: Math.max(...patternDays) }
}

/** The onboarding entry point: resolve the method and assess the fit from a
 *  (possibly partial, mid-flow) config. Null when no running method applies
 *  or the athlete asked for no extras. */
export function assessExtrasFitForConfig(config: OnboardingConfig): ExtrasFitAssessment | null {
  const meta = resolveRunMethodMeta(config)
  if (!meta) return null
  const extrasRequested = Math.max(0, config.strengthDaysPerWeek ?? 0) + Math.max(0, config.crossTrainingDaysPerWeek ?? 0)
  if (extrasRequested === 0) return null
  return assessExtrasFit({
    minRunDays: meta.minRunDays,
    maxRunDays: meta.maxRunDays,
    extrasRequested,
    dayBudget: Math.min(config.trainingDaysPerWeek, 6),
    methodName: meta.methodName,
  })
}
