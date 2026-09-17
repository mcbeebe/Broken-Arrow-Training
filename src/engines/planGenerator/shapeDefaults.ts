import type { TrainingPlan, TrainingWeek } from '../../types'
import type { OnboardingConfig } from '../../hooks/useOnboarding'
import type { TrainingMethod } from '../../types/training-method'
import { RECOMMENDABLE_METHODS, getMethodById } from '../../data/methods'
import { selectMethods, inputsFromOnboarding } from './methodSelection'
import { generatePlanFromMethod } from './generatePlan'
import { generateHyroxPlan } from '../../utils/planGenerator'
import { generateGeneralFitnessPlan } from '../generalFitness'
import { shapeFromDays, type WeekShape } from './weekShape'

/**
 * The shape the generators would give a config on their own — the
 * starting point the athlete edits from, and the "current" shape a plan
 * already has. Derived by generating the plan and reading a full,
 * ordinary week back, so the default is never a second opinion about the
 * layout: it IS the layout.
 */

/** Build the plan the app would build for this config (the same engine
 *  dispatch as the live plan and the onboarding preview). Null when the
 *  config cannot generate yet. */
export function planForConfig(config: OnboardingConfig, today?: string): { plan: TrainingPlan; method: TrainingMethod | null } | null {
  try {
    if (config.raceType === 'hyrox') return { plan: generateHyroxPlan(config, today), method: null }
    if (config.raceType === 'general') return { plan: generateGeneralFitnessPlan(config, today), method: null }
    const method = methodForConfig(config)
    if (!method) return null
    return { plan: generatePlanFromMethod(method, config, today), method }
  } catch {
    return null
  }
}

/** The method the plan runs on: the one already chosen, else the top pick. */
export function methodForConfig(config: OnboardingConfig): TrainingMethod | null {
  if (config.selectedMethodId) {
    const m = getMethodById(config.selectedMethodId)
    if (m) return m
  }
  const inputs = inputsFromOnboarding(config)
  if (!inputs) return null
  const [top] = selectMethods(RECOMMENDABLE_METHODS, inputs)
  return top ? RECOMMENDABLE_METHODS.find(m => m.id === top.methodId) ?? null : null
}

/** An ordinary week to read the shape from: the first full seven-day week
 *  that is not a cutback, recovery, taper or race week — else the first
 *  full week, else the first week at all. */
export function representativeWeek(plan: TrainingPlan): TrainingWeek | null {
  const full = plan.weeks.filter(w => w.days.length === 7 && !w.days.some(d => d.type === 'race'))
  const ordinary = full.find(w => !/cutback|recovery|taper|deload/i.test(w.focus))
  return ordinary ?? full[0] ?? plan.weeks[0] ?? null
}

/** The shape this config generates on its own. */
export function defaultWeekShapeFor(config: OnboardingConfig, today?: string): WeekShape | null {
  const built = planForConfig({ ...config, weekShape: undefined }, today)
  if (!built) return null
  const week = representativeWeek(built.plan)
  return week ? shapeFromDays(week.days) : null
}

/** Running-day bounds a method's patterns support, for shape validation. */
export function methodRunDayBounds(method: TrainingMethod | null | undefined): { min: number; max: number; name?: string } | undefined {
  if (!method) return undefined
  const days = method.weeklyPatterns.map(p => p.daysPerWeek)
  if (days.length === 0) return undefined
  return { min: Math.min(...days), max: Math.max(...days), name: method.name }
}
