/**
 * Menopause-aware context helpers — pure, no React/IO.
 *
 * Mirrors the injury pattern in `injuryRamp.ts`: turn the optional onboarding
 * fields into a one-line human summary the coach can greet the athlete with and
 * attach to the LLM snapshot. The menopause context is self-identified and
 * age-gated in onboarding; `not_applicable` / `prefer_not_to_say` carry no
 * personalization, same as an absent injury.
 *
 * P0 surfaces this in the coach only. A later overlay (see
 * docs/MENOPAUSE_TRAINING_CONTEXT_DESIGN.md §6) will read the stage to re-dial
 * the training engine.
 */
import type { MenopauseStatus, OnboardingConfig } from '../hooks/useOnboarding'

const STAGE_LABELS: Record<MenopauseStatus, string | null> = {
  perimenopause: 'in perimenopause',
  menopause: 'in menopause',
  postmenopause: 'postmenopausal',
  not_applicable: null,
  prefer_not_to_say: null,
}

const SYMPTOM_LABELS: Record<string, string> = {
  hot_flashes: 'hot flashes',
  sleep_disruption: 'sleep disruption',
  joint_pain: 'joint pain',
  low_energy: 'low energy',
  brain_fog: 'brain fog',
}

/** True when the athlete disclosed an actual stage (not n/a or declined). */
export function hasMenopauseContext(
  config: Pick<OnboardingConfig, 'menopauseStatus'> | null | undefined,
): boolean {
  const s = config?.menopauseStatus
  return s === 'perimenopause' || s === 'menopause' || s === 'postmenopause'
}

/**
 * One-line, human summary of the athlete's menopause context for the coach's
 * greeting and the LLM snapshot. Returns null when there's nothing to say
 * (unset, not applicable, or prefer-not-to-say).
 */
export function menopauseSummaryLine(
  config:
    | Pick<OnboardingConfig, 'menopauseStatus' | 'menopauseSymptoms' | 'menopauseNote'>
    | null
    | undefined,
): string | null {
  if (!config) return null
  const { menopauseStatus, menopauseSymptoms, menopauseNote } = config
  if (!menopauseStatus) return null
  const lead = STAGE_LABELS[menopauseStatus]
  if (!lead) return null

  const parts = [lead]
  if (menopauseSymptoms && menopauseSymptoms.length > 0) {
    const labels = menopauseSymptoms.map(s => SYMPTOM_LABELS[s] ?? s)
    parts.push(`managing ${joinList(labels)}`)
  }
  if (menopauseNote && menopauseNote.trim()) parts.push(menopauseNote.trim())
  return parts.join(' · ')
}

function joinList(items: string[]): string {
  if (items.length <= 1) return items.join('')
  if (items.length === 2) return `${items[0]} and ${items[1]}`
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`
}
