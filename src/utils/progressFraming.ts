/**
 * The honest-metric contract for the Progress tab.
 *
 * On day 5 of a 56-day plan the tab greeted the athlete with "−74% off
 * plan", "0% distance · 2.7 / 162 mi", "8% HR in zone · 1 flagged", three
 * red cards. Every number was arithmetically true and every one was a lie
 * about how the plan was going, because it was measured against the wrong
 * thing:
 *
 *   - distance was divided by the WHOLE SEASON (162 mi), guaranteeing ~0%
 *     for two months;
 *   - the CURRENT week was graded as if it were finished, so a week half-run
 *     always looked short;
 *   - a percentage was painted red off a single data point.
 *
 * This module is the one place that decides what each metric SAYS and what
 * colour it has EARNED. The rules, in one sentence: a metric shows red only
 * when a reasonable coach, looking at the same data, would say "this needs
 * to change" — and nothing about an unfinished week or an unfinished plan
 * meets that bar. Everything else is going-well, nothing-to-grade-yet, or a
 * plain uncoloured number.
 *
 * It is deliberately a pure function of the compliance data plus how far into
 * the plan we are: no clock reads, no storage, so every rule is testable.
 */
import type { OverallCompliance, WeekCompliance } from '../hooks/useCompliance'

export type MetricTone = 'good' | 'watch' | 'bad' | 'neutral' | 'tooSoon'

export interface FramedMetric {
  key: 'completion' | 'distance' | 'duration' | 'hr'
  label: string
  value: string
  sub: string
  tone: MetricTone
}

/** A percentage metric earns a colour only once this many weeks have fully
 *  elapsed. Below it, a shortfall is arithmetic noise, not a trend. */
export const MIN_COMPLETE_WEEKS_TO_GRADE = 2
/** HR-in-zone is a skill; it needs a few measured runs before a number means
 *  anything. One flagged run out of one is a sample of one. */
export const MIN_HR_RUNS_TO_GRADE = 3

/** A week is complete for grading only once it is strictly in the past. The
 *  current week is still being run, so it can never be "short". */
export function isWeekComplete(weekNum: number, currentWeekNum: number): boolean {
  return weekNum < currentWeekNum
}

/** Past weeks that actually had planned work — the only weeks that can be
 *  graded. */
export function completeWeeks(c: OverallCompliance, currentWeekNum: number): WeekCompliance[] {
  return c.weeks.filter(w => isWeekComplete(w.weekNum, currentWeekNum) && w.totalWorkouts > 0)
}

/** Has the plan run long enough for a percentage to carry a colour at all? */
export function planGradeable(c: OverallCompliance, currentWeekNum: number): boolean {
  return completeWeeks(c, currentWeekNum).length >= MIN_COMPLETE_WEEKS_TO_GRADE
}

const round = (n: number) => Math.round(n)
const round1 = (n: number) => Math.round(n * 10) / 10

/** Colour for a graded percentage — never invoked until the plan is
 *  gradeable, so "bad" always means a real, sustained shortfall. */
function toneForPct(pct: number): MetricTone {
  if (pct >= 85) return 'good'
  if (pct >= 65) return 'watch'
  return 'bad'
}

/**
 * The four summary metrics, framed honestly for the CURRENT week.
 *
 * The current week's numbers are shown as progress, not as a grade: they are
 * neutral (no red) because the week is not over. Colour is reserved for HR,
 * which is judged across the whole plan once enough runs exist — and even
 * then only turns red on a genuinely low, well-evidenced number.
 */
export function frameThisWeek(c: OverallCompliance, currentWeekNum: number): {
  weekNum: number
  gradeable: boolean
  metrics: FramedMetric[]
} {
  const wk = c.weeks.find(w => w.weekNum === currentWeekNum) ?? null
  const gradeable = planGradeable(c, currentWeekNum)

  const completed = wk?.completed ?? 0
  const planned = wk?.totalWorkouts ?? 0
  const open = Math.max(0, planned - completed)

  const completion: FramedMetric = {
    key: 'completion',
    label: 'This week',
    value: `${completed} done`,
    sub: open === 0 && completed > 0 ? 'week complete' : `${open} open · rest days count`,
    tone: open === 0 && completed > 0 ? 'good' : 'neutral',
  }

  const actualMi = round1(wk?.actualMiles ?? 0)
  const plannedMi = round1(wk?.plannedMiles ?? 0)
  const distance: FramedMetric = {
    key: 'distance',
    label: 'Distance',
    value: `${actualMi}`,
    // Week-relative, not the season: "2.7 / 10 mi", never "2.7 / 162".
    sub: plannedMi > 0 ? `/ ${plannedMi} mi this week` : 'this week',
    tone: 'neutral',
  }

  const durPct = wk && wk.plannedDuration > 0
    ? round((wk.actualDuration / wk.plannedDuration) * 100)
    : null
  const duration: FramedMetric = {
    key: 'duration',
    label: 'Duration',
    value: durPct !== null ? `${durPct}%` : '—',
    sub: 'of this week’s planned time',
    tone: 'neutral',
  }

  // HR is the one metric judged across the plan, because time-in-zone is a
  // skill that only reads as a trend over several runs.
  const hrRuns = c.weeks.reduce((s, w) => s + w.hrCheckedWorkouts, 0)
  const hr: FramedMetric = hrRuns >= MIN_HR_RUNS_TO_GRADE
    ? {
        key: 'hr',
        label: 'HR in zone',
        value: `${c.overallHRCompliance}%`,
        sub: c.totalFlagged > 0 ? `${c.totalFlagged} flagged` : 'on target',
        tone: gradeable ? toneForPct(c.overallHRCompliance) : 'neutral',
      }
    : {
        key: 'hr',
        label: 'HR in zone',
        value: 'too soon',
        sub: `${hrRuns} of ${MIN_HR_RUNS_TO_GRADE} runs measured`,
        tone: 'tooSoon',
      }

  return { weekNum: currentWeekNum, gradeable, metrics: [completion, distance, duration, hr] }
}

/**
 * Volume-chart banding, honest about which weeks can be judged.
 *
 * 'inprogress' is the fix for the "−74% off plan" banner: the current week is
 * still being run, so a shortfall against its full plan is expected, not a
 * flag. A week can only be "off plan" once it is over.
 */
export type VolumeBand = 'ok' | 'warn' | 'flag' | 'future' | 'inprogress'

export function bandForWeek(
  actual: number,
  planned: number,
  opts: { hasStarted: boolean; isComplete: boolean },
): VolumeBand {
  if (!opts.hasStarted) return 'future'
  if (!opts.isComplete) return 'inprogress'
  if (planned <= 0) return 'ok'
  const dev = Math.abs(actual - planned) / planned
  if (dev <= 0.15) return 'ok'
  if (dev <= 0.25) return 'warn'
  return 'flag'
}
