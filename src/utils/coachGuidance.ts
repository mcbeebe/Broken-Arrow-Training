/**
 * Coach guidance lines for the final roadmap items (fact-checked v1.3):
 *   R6  race execution / pacing (Rule of Thirds + power-hike + aid stations)
 *   R10 mental skills, rehearsed in training
 *   R11 menstrual-cycle awareness (evidence-humble; premenopausal female only)
 *   R12 masters load logic (age ≥ 50)
 * Each returns a one-line snapshot context the coach renders as its own section.
 */
import type { OnboardingConfig } from '../hooks/useOnboarding'

/** R6 — race execution / pacing. Null for short races (5K/10K). */
export function raceExecutionSummaryLine(raceMiles: number, isTrail: boolean): string | null {
  if (raceMiles < 13) return null
  const hike = isTrail ? ' On steep climbs (>~15–20% grade) power-hike rather than run.' : ''
  return (
    'pace by the Rule of Thirds — restrain in the first third (cap effort by HR/RPE; "could I run this on the way ' +
    'back?"), maintain a steady even effort through the middle (catch fueling/heat problems early), then attain in ' +
    'the final third (let the effort rise into the finish).' + hike +
    ' Pre-decide fuel and actions per aid-station segment so a tired brain has nothing to figure out.'
  )
}

/** R10 — mental skills, built in training. */
export function mentalSummaryLine(): string {
  return (
    'build mental skills like fitness: a short positive mantra (≤8 words, present tense); break the race ' +
    'aid-station to aid-station; rehearse multisensory imagery with a breath cue; and favor process goals ' +
    '("quick feet, relax the shoulders") over outcome goals — practice these on hard training days, not just race day'
  )
}

/** R11 — menstrual-cycle awareness. Premenopausal female athletes only. */
export function cycleContextLine(config: OnboardingConfig | null): string | null {
  if (!config || config.sex !== 'female') return null
  const meno = config.menopauseStatus
  const premenopausal = !meno || meno === 'premenopause' || meno === 'not_applicable' || meno === 'prefer_not_to_say'
  if (!premenopausal) return null
  if ((config.age ?? 0) >= 52) return null
  return (
    'cycle-aware and evidence-humble: the follicular phase often favors harder / strength work and the luteal ' +
    'phase can blunt recovery, heat tolerance and motivation — but the science is individual, so track your own ' +
    'cycle against how you feel. If your period has been absent 3+ months, treat it as a RED-S flag worth a ' +
    'clinician check-in.'
  )
}

/** R12 — masters load logic. Age ≥ 50. */
export function mastersContextLine(config: OnboardingConfig | null): string | null {
  if (!config || (config.age ?? 0) < 50) return null
  return (
    'masters-aware: keep the intensity (lactate threshold stays trainable) but recover more deliberately — often ' +
    'one hard session a week rather than two or three, with strength and ~20 g+ protein after hard/long efforts to ' +
    'defend against age-related muscle loss'
  )
}
