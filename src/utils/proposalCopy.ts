/**
 * How a proposal describes itself in the review queue.
 *
 * P15 folded the four calibration cards into the queue. The queue's own
 * strings were placeholders — "Benchmark result ready to apply" — while the
 * cards carried the actual finding and its evidence. Moving without this
 * would have kept the layout and thrown away the argument, which is the one
 * thing that makes a proposal answerable.
 *
 * These are the cards' own words, lifted verbatim, so the queue says what
 * the card said.
 */
import type { BenchmarkResultAssessment } from '../engines/planGenerator/benchmarkResult'
import type { RecalibrationAssessment } from '../engines/planGenerator/recalibration'

/** "1:52 /500m" */
export function fmt500(sec: number): string {
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')} /500m`
}

/** The finding, in one line. */
export function benchmarkTitle(a: BenchmarkResultAssessment): string {
  if (a.suggestedLthr != null) return `Your time trial puts your threshold HR at ~${a.suggestedLthr} bpm`
  if (a.suggestedMaxHR != null) return `Your test hit ${a.suggestedMaxHR} bpm — above your configured max`
  if (a.suggestedErg500Sec != null) return `Erg baseline captured — ${fmt500(a.suggestedErg500Sec)}`
  return 'Benchmark result ready'
}

/**
 * What applying it does, followed by the evidence that argues for it. The
 * HR and erg cases do genuinely different things, and said so on the card.
 */
export function benchmarkConsequence(a: BenchmarkResultAssessment): string {
  const hr = a.suggestedLthr != null || a.suggestedMaxHR != null
  const effect = hr
    ? 'Updates your HR zones and rewrites future workouts’ targets. Past workouts are never touched.'
    : 'Saves the result to your measured benchmarks — it feeds Your Engine and the race projection.'
  return [effect, ...a.evidence].join(' ')
}

/** How much faster the recalibration makes future targets, as a percentage. */
export function recalPercent(a: RecalibrationAssessment): string {
  return ((1 - a.suggestedFactor) * 100).toFixed(1)
}

export function recalTitle(): string {
  return 'You’ve been running faster than your targets — at the right effort'
}

export function recalConsequence(a: RecalibrationAssessment): string {
  const effect = `Makes future pace targets ~${recalPercent(a)}% faster — half the observed gain, because we recalibrate conservatively. Workout structure and past weeks do not change.`
  // Three lines was the card's own limit; a queue item that runs on stops
  // being a decision and becomes a document.
  return [effect, ...a.evidence.slice(0, 3)].join(' ')
}
