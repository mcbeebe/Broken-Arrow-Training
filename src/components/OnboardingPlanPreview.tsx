import { useMemo } from 'react'
import type { TrainingPlan } from '../types'
import type { OnboardingConfig } from '../hooks/useOnboarding'
import { RECOMMENDABLE_METHODS } from '../data/methods'
import { selectMethods, inputsFromOnboarding } from '../engines/planGenerator/methodSelection'
import { generatePlanFromMethod } from '../engines/planGenerator/generatePlan'
import { generateHyroxPlan } from '../utils/planGenerator'
import { generateGeneralFitnessPlan } from '../engines/generalFitness'
import { getWorkoutStyle } from '../utils/styles'

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

export default function OnboardingPlanPreview({ config }: { config: OnboardingConfig }) {
  const preview = useMemo(() => buildPreview(config), [config])

  if (!preview || preview.plan.weeks.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        Keep going — your plan takes shape from the next few answers.
      </p>
    )
  }

  const { plan, methodName, methodWhy } = preview
  const week1 = plan.weeks[0]

  return (
    <div data-testid="plan-preview">
      {methodName && (
        <div className="mb-3">
          <p className="text-sm text-slate-500">Best-fit training system so far</p>
          <p className="text-lg font-bold text-slate-800">{methodName}</p>
          {methodWhy && <p className="text-xs text-slate-500 mt-0.5">{methodWhy}</p>}
        </div>
      )}
      <p className="text-sm font-semibold text-slate-600 mb-2">
        Your week 1 — {plan.weeks.length} week{plan.weeks.length === 1 ? '' : 's'} total
        {week1.miles ? ` · ~${week1.miles} mi to start` : ''}
      </p>
      <div className="space-y-1.5">
        {week1.days.map((d, i) => {
          const style = getWorkoutStyle(d.type, d.workout)
          return (
            <div
              key={i}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm"
              style={{ backgroundColor: style.bg, borderLeft: `3px solid ${style.border}` }}
            >
              <span className="font-semibold text-slate-700 w-16 shrink-0">{d.day.split(' ')[0]}</span>
              <span className="text-slate-700 truncate">{d.workout}</span>
            </div>
          )
        })}
      </div>
      <p className="text-xs text-slate-400 mt-3">
        Built from your answers so far — the next questions refine paces,
        strength, and scheduling before anything is final.
      </p>
    </div>
  )
}
