/**
 * The derived-plan pipeline: base plan → what the athlete actually sees.
 *
 * This used to live inline in App.tsx's `weeks` useMemo. It is ten transforms
 * deep and **the order is load-bearing** — several steps are only correct
 * because of what runs before them — and nothing tested it. The memo could
 * not be tested where it was: it closes over a dozen hook values inside a
 * 2500-line component, so the only way to exercise an ordering change was to
 * render the whole app and hope a downstream assertion noticed.
 *
 * Extracting it changes no behaviour. Every transform, every conditional and
 * the order are as they were; the transforms arrive as parameters so a test
 * can watch the sequence directly. The reason to do it now rather than later
 * is that splitting App.tsx is on the roadmap, and moving a pipeline nobody
 * has pinned is how a silent reordering ships.
 *
 * ── Why this order ──────────────────────────────────────────────────────
 *
 * 1. SWAPS first. Everything downstream works in post-swap coordinate space.
 *
 * 2. EDITS after swaps, before actuals. Field edits (updateDay) must sit in
 *    post-swap space so swapDayIndices can re-anchor an edit to follow its
 *    workout into the swapped slot; putting edits first reintroduces the
 *    "edit lands on the wrong day after a swap" bug. Actuals match by day
 *    label, so they stay correct even when an edit adds or removes a day.
 *
 * 3. LOCKS after both, so `day.locked` is stamped on final-positioned days
 *    and lands on the right calendar day. Every scheduler below — the replan
 *    here, plus travel/autopilot/review, which read these derived weeks —
 *    skips a locked day, so a lock stamped in pre-swap space would protect
 *    the wrong one.
 *
 * 4. REPLAN on the prescription: after edits, before any actual is matched
 *    in. The rules rewrite what was *planned*; the actuals layer still
 *    matches by day label afterwards.
 *
 * 5-7. ACTUALS, poorest source first: Strava, then Garmin detail, then
 *    Apple. Each overwrites the last, so the richest source wins. Apple is
 *    last because it exists to fill days the other two never covered, for
 *    athletes whose only wearable is a watch.
 *
 * 8. MANUAL LOGS over all of them — an athlete's own correction outranks
 *    anything a device reported.
 *
 * 9. REZONE last, so it rewrites baked-in HR bpm references in `day.zone`
 *    and `day.detail` on the finished text — including text the replan and
 *    the merges just wrote. Running it earlier would leave anything written
 *    afterwards carrying stale zones, which the compliance grader reads.
 */
import type { TrainingWeek, HRZone, StravaActivity, GarminActivityDetail } from '../types'
import type { AppleActivity } from './apple'
import { matchActivitiesToPlan, mergeGarminDetailIntoWeeks, mergeAppleActivitiesIntoWeeks } from './matching'
import { rezoneWeeks } from './rezone'

/** One layer of the pipeline: weeks in, weeks out. */
export type WeeksTransform = (weeks: TrainingWeek[]) => TrainingWeek[]

export interface DerivePlanWeeksInput {
  /** The season-spliced base plan — the pipeline's entry point. */
  base: TrainingWeek[]
  applySwaps: WeeksTransform
  applyEdits: WeeksTransform
  applyLocks: WeeksTransform
  applyReplans: WeeksTransform
  applyManualLogs: WeeksTransform
  /** Strava is skipped entirely when hidden or empty — matching a day
   *  against zero activities is a no-op, but skipping keeps the identity
   *  of `weeks` stable so downstream memos don't churn. */
  showStrava: boolean
  stravaActivities: StravaActivity[]
  garminConnected: boolean
  garminActivityDetails: Record<string, GarminActivityDetail[]>
  appleActivities: AppleActivity[]
  zones: HRZone[]
}

export function derivePlanWeeks(input: DerivePlanWeeksInput): TrainingWeek[] {
  let w = input.base

  w = input.applySwaps(w)
  w = input.applyEdits(w)
  w = input.applyLocks(w)
  w = input.applyReplans(w)

  if (input.showStrava && input.stravaActivities.length > 0) {
    w = matchActivitiesToPlan(w, input.stravaActivities)
  }
  if (input.garminConnected && Object.keys(input.garminActivityDetails).length > 0) {
    w = mergeGarminDetailIntoWeeks(w, input.garminActivityDetails)
  }
  if (input.appleActivities.length > 0) {
    w = mergeAppleActivitiesIntoWeeks(w, input.appleActivities)
  }

  w = input.applyManualLogs(w)
  w = rezoneWeeks(w, input.zones)

  return w
}

/**
 * The documented order, as data. `derivePlanWeeks` is the only definition
 * that matters; this exists so a test can assert against a written-down
 * sequence rather than restating the implementation, and so a reviewer
 * reordering the function is told what they are changing.
 */
export const DERIVED_PIPELINE_ORDER = [
  'swaps',
  'edits',
  'locks',
  'replan',
  'strava',
  'garminDetail',
  'apple',
  'manualLog',
  'rezone',
] as const

export type DerivedPipelineStage = typeof DERIVED_PIPELINE_ORDER[number]
