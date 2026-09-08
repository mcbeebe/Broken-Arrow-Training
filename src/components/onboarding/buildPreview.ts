import type { TrainingPlan } from '../../types'
import type { OnboardingConfig } from '../../hooks/useOnboarding'
import { RECOMMENDABLE_METHODS } from '../../data/methods'
import { selectMethods, inputsFromOnboarding } from '../../engines/planGenerator/methodSelection'
import { generatePlanFromMethod } from '../../engines/planGenerator/generatePlan'
import { generateHyroxPlan } from '../../utils/planGenerator'
import { generateGeneralFitnessPlan } from '../../engines/generalFitness'

/**
 * G3 — the belief-building moment: a real, personalized week 1 rendered
 * mid-onboarding from the answers so far (Runna previews a template; this
 * is the athlete's actual plan). Plan generation is client-side and fast,
 * so this is a pure render of a provisional config — nothing is saved,
 * and the preview can never block the flow (any generation failure just
 * renders nothing; the athlete keeps onboarding).
 */

export interface PreviewResult {
  plan: TrainingPlan
  methodName: string | null
  methodWhy: string | null
}

export function buildPreview(config: OnboardingConfig): PreviewResult | null {
  try {
    if (config.raceType === 'hyrox') {
      return { plan: generateHyroxPlan(config), methodName: 'Hyrox engine', methodWhy: null }
    }
    if (config.raceType === 'general') {
      return { plan: generateGeneralFitnessPlan(config), methodName: null, methodWhy: null }
    }
    const inputs = inputsFromOnboarding(config)
    if (!inputs) return null
    const [top] = selectMethods(RECOMMENDABLE_METHODS, inputs)
    if (!top) return null
    const method = RECOMMENDABLE_METHODS.find(m => m.id === top.methodId)
    if (!method) return null
    return {
      plan: generatePlanFromMethod(method, config),
      methodName: method.name,
      methodWhy: top.rationale[0] ?? null,
    }
  } catch {
    return null // preview is a bonus, never a blocker
  }
}
