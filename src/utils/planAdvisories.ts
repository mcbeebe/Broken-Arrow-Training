import type { HRZone, PlanAdvisory, RaceInfo, TrainingWeek } from '../types'
import { validatePlan, qaFindingsToAdvisories } from '../engines/planQA/validatePlan'
import { benchmarkCompletedIso } from '../engines/planGenerator/benchmarkResult'

/**
 * The advisory pile shown on the plan screens, assembled from three sources.
 *
 * This lived as three `useMemo` bodies inside App.tsx, where none of it could
 * be tested without rendering the whole app. The rules below are the kind that
 * were each added to fix a specific wrong thing the athlete was told, so they
 * are worth pinning: extracted as pure functions, the memos in App keep only
 * their dependency arrays.
 */

export interface SeasonQaInput {
  /** The full derived week stream — anchor plus any spliced season weeks. */
  weeks: TrainingWeek[]
  /** How many weeks the anchor plan itself has. */
  anchorWeekCount: number
  /** How many races the spliced season covers; below 2 there is no season. */
  seasonRaceCount: number
  zones?: HRZone[]
  race?: RaceInfo
  methodId?: string
}

/**
 * R0 — season-level QA.
 *
 * The anchor plan is validated at generation time, but the spliced season
 * (recover / bridge / second-build weeks) never was: cross-block ramp seams
 * and duplicate blocks were structurally invisible. Validate the FULL derived
 * week stream and surface findings from weeks beyond the anchor. The anchor's
 * own findings already ride in `activePlan.advisories`, so they are filtered
 * out here to avoid saying the same thing twice.
 *
 * D11 — the layered rules live INSIDE the anchor weeks by definition (that is
 * what layering is), so the "beyond the anchor" filter silently discarded
 * every one of them, and the early return skipped the validator entirely for a
 * season whose only change is layered days. Hence the `hasLayered` escape and
 * the `qa_layered_` id prefix in the filter.
 */
export function seasonQaAdvisories(input: SeasonQaInput): PlanAdvisory[] {
  const { weeks, anchorWeekCount, seasonRaceCount, zones, race, methodId } = input
  if (seasonRaceCount < 2) return []
  const hasLayered = weeks.some(w => w.days.some(d => d.layeredFor != null))
  if (weeks.length <= anchorWeekCount && !hasLayered) return []
  const qa = validatePlan({ weeks, zones, race, methodId })
  const later = qa.findings.filter(
    f => (f.weekNum ?? 0) > anchorWeekCount || f.id.startsWith('qa_layered_'),
  )
  if (later.length === 0) return []
  return qaFindingsToAdvisories({
    findings: later,
    errors: later.filter(f => f.severity === 'error'),
    warnings: later.filter(f => f.severity === 'warn'),
    pass: later.every(f => f.severity !== 'error'),
  })
}

export interface CombineAdvisoriesInput {
  /** Advisories the generator attached to the anchor plan. */
  planAdvisories?: PlanAdvisory[]
  seasonQa: PlanAdvisory[]
  layer: PlanAdvisory[]
  weeks: TrainingWeek[]
  todayIso: string
}

/**
 * The single list the plan screens render, in source order: generator, then
 * season QA, then layering.
 *
 * "Estimated until you test" retires itself the day a benchmark is actually
 * recorded — primary or secondary. The benchmark card and the athlete model
 * carry the calibration from there, so leaving it up would be telling the
 * athlete their zones are guesses after they have proved otherwise.
 */
export function combineAdvisories(input: CombineAdvisoriesInput): PlanAdvisory[] {
  const base = [
    ...(input.planAdvisories ?? []),
    ...input.seasonQa,
    ...input.layer,
  ]
  return benchmarkCompletedIso(input.weeks, input.todayIso)
    ? base.filter(adv => adv.id !== 'zones_estimated')
    : base
}
