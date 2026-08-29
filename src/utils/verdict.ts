/**
 * The morning verdict — the one thing Today has to answer.
 *
 * The adaptive engine already speaks on the mornings it ACTS on
 * (useMorningOutlook). It says nothing on the mornings it doesn't, which
 * left the athlete's actual question — "am I good to go?" — answered only
 * by silence, and pushed the workout itself below a stack of admin.
 *
 * This builds the verdict for every other morning: the green ones, the
 * ones where the engine is still arming its baselines, and the ones where
 * there is no wearable to ask. It is deliberately pure so the wording can
 * be asserted directly.
 */
import type {
  ReadinessScore, ReadinessBaselines, GarminHealthData, PlannedDay,
} from '../types'
import { HRV_BASELINE_NIGHTS } from '../engines/adaptive/morningOutlook'

export type VerdictTone = 'clear' | 'watch' | 'arming' | 'unknown'

export interface VerdictEvidence {
  label: string
  value: string
  /** The comparison that makes the number mean something. */
  sub: string
}

export interface Verdict {
  tone: VerdictTone
  headline: string
  sub: string
  /** 0-100 display score, or null when there is nothing to score. */
  score: number | null
  evidence: VerdictEvidence[]
  /** What was checked, and the promise that nothing moved. */
  footer: string
}

export interface VerdictInputs {
  score: ReadinessScore | null
  baselines: ReadinessBaselines | null
  health: GarminHealthData | null
  /** Today's planned session, for the load line. */
  today: PlannedDay | null
  /** Nights of overnight data seen so far — drives the arming state. */
  nightsOfHistory: number
  /** False when no wearable is connected at all. */
  hasSource: boolean
}

const hours = (seconds: number) => `${(seconds / 3600).toFixed(1)}h`

/** Sleep, HRV and load — the three the athlete actually reads. Each one is
 *  shown against the athlete's own baseline, never a population norm, and
 *  a signal with no data is omitted rather than dashed. */
function buildEvidence(i: VerdictInputs): VerdictEvidence[] {
  const out: VerdictEvidence[] = []

  const slept = i.health?.sleep?.durationSeconds
  if (slept != null) {
    const base = i.baselines?.sleepDuration.mean
    out.push({
      label: 'Sleep',
      value: hours(slept),
      sub: base != null
        ? (slept >= base ? `above your ${hours(base)} baseline` : `under your ${hours(base)} baseline`)
        : 'last night',
    })
  }

  const hrv = i.health?.hrv?.lastNightAvg
  if (hrv != null) {
    const base = i.baselines?.lnRmssd.sampleSize ? Math.round(Math.exp(i.baselines.lnRmssd.mean)) : null
    const delta = base != null ? hrv - base : null
    out.push({
      label: 'HRV',
      value: String(Math.round(hrv)),
      sub: delta == null ? 'last night'
        : Math.abs(delta) <= 2 ? 'at baseline'
        : delta > 0 ? `${delta} above baseline`
        : `${Math.abs(delta)} under baseline`,
    })
  }

  if (i.today) {
    out.push({
      label: 'Today',
      value: i.today.type === 'rest' ? 'rest day' : (i.today.time || 'planned'),
      sub: i.today.type === 'rest' ? 'nothing scheduled' : 'as the block asked',
    })
  }

  return out.slice(0, 3)
}

export function buildVerdict(i: VerdictInputs): Verdict {
  const evidence = buildEvidence(i)

  // No wearable at all. The engine is not broken; it simply has not been
  // given anything, and saying so is better than an empty ring.
  if (!i.hasSource) {
    return {
      tone: 'unknown',
      headline: 'Go by feel today.',
      sub: 'No watch connected, so this is your call rather than mine.',
      score: null,
      evidence,
      footer: 'Connect a watch — Garmin or Apple — and I can check your overnight numbers before you train.',
    }
  }

  // Still building baselines. "Arming 12/21" is a promise with a date on
  // it; silence is not.
  if (i.nightsOfHistory < HRV_BASELINE_NIGHTS) {
    const left = HRV_BASELINE_NIGHTS - i.nightsOfHistory
    return {
      tone: 'arming',
      headline: 'Learning your normal.',
      sub: `${i.nightsOfHistory} of ${HRV_BASELINE_NIGHTS} nights in. I won't move a session until I know what your baseline actually is.`,
      score: i.score?.displayScore ?? null,
      evidence,
      footer: `Autopilot arms in ${left} night${left === 1 ? '' : 's'}. Until then the plan runs as written.`,
    }
  }

  const status = i.score?.status
  const watch = status === 'YELLOW' || status === 'RED'

  if (watch) {
    // Below par, but not the sustained trend that earns a change. Say that
    // plainly instead of either ignoring it or acting on one bad night.
    return {
      tone: 'watch',
      headline: 'A bit under — your call.',
      sub: 'One night below your baseline. I leave the plan alone for that; a trend is a different matter.',
      score: i.score?.displayScore ?? null,
      evidence,
      footer: 'Checked against 21 nights of your baselines · nothing was changed.',
    }
  }

  return {
    tone: 'clear',
    headline: 'All clear — go as planned.',
    sub: 'Your body backed up the plan overnight.',
    score: i.score?.displayScore ?? null,
    evidence,
    footer: 'Checked against 21 nights of your baselines · nothing was changed.',
  }
}
