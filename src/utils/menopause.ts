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
  premenopause: 'premenopausal',
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

/** True when the athlete disclosed an actual stage on the menopause continuum
 *  (premenopause through postmenopause) — not n/a or declined. */
export function hasMenopauseContext(
  config: Pick<OnboardingConfig, 'menopauseStatus'> | null | undefined,
): boolean {
  const s = config?.menopauseStatus
  return (
    s === 'premenopause' ||
    s === 'perimenopause' ||
    s === 'menopause' ||
    s === 'postmenopause'
  )
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

/**
 * Heavy bone-loading strength guidance for the active bone-loss stages
 * (perimenopause, menopause, postmenopause). As estrogen falls, bone-mineral
 * density drops and stress-fracture risk climbs; heavy, low-rep resistance and
 * impact are the strongest countermeasures — light/high-rep volume alone is
 * insufficient. Premenopause (still "banking" bone) and n/a keep the standard
 * routine, so this returns null for them.
 *
 * Consumed by the method-based plan generator (extraDays) and surfaced on the
 * strength day. Symptom-/recovery-keying lives elsewhere (coach + GF overlay);
 * this is strictly the strength/bone lever.
 */
export interface MenopauseStrengthCue {
  /** Guide-backed finisher appended to a gym routine (axial/compressive load). */
  gymFinisher: readonly string[]
  /** Finisher for bodyweight-only athletes — impact over external load. */
  bodyweightFinisher: readonly string[]
  /** Short "why", shown on the strength day. */
  framing: string
}

const BONE_LOSS_STAGES: ReadonlySet<MenopauseStatus> = new Set<MenopauseStatus>([
  'perimenopause',
  'menopause',
  'postmenopause',
])

export function menopauseStrengthCue(
  config: Pick<OnboardingConfig, 'menopauseStatus'> | null | undefined,
): MenopauseStrengthCue | null {
  const s = config?.menopauseStatus
  if (!s || !BONE_LOSS_STAGES.has(s)) return null
  return {
    // Beginner-safe heavy loaders (the athlete may be new to lifting): a loaded
    // carry is high compressive load with low injury/skill risk; jumps give an
    // osteogenic impact stimulus when no weights are available.
    gymFinisher: ['Farmer Carry 3×30s'],
    bodyweightFinisher: ['Squat Jump 3×8'],
    framing:
      'Bone-loading priority (midlife): as estrogen drops, heavy load — low reps, hard but clean — is the strongest lever for bone density; light, high-rep work alone won’t protect it. Start at a load you control and progress it across the block.',
  }
}

function joinList(items: string[]): string {
  if (items.length <= 1) return items.join('')
  if (items.length === 2) return `${items[0]} and ${items[1]}`
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`
}
