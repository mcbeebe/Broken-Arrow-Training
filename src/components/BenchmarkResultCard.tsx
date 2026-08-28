import { useState } from 'react'
import type { BenchmarkResultAssessment } from '../engines/planGenerator/benchmarkResult'

/**
 * 4.1 delivery surface: the benchmark-result OFFER. Same trust pattern
 * as RecalibrationCard — deterministic evidence, opt-in, undoable; zones
 * and HR anchors never change without the athlete tapping Apply. The
 * zones_estimated advisory promised "test → the plan updates"; this card
 * is that promise.
 */

interface Props {
  assessment: BenchmarkResultAssessment
  /** Saves the new anchors + applies the zone-rewrite ops as one
   *  undoable batch; returns the batchId. */
  onApply: () => string
  onDismiss: () => void
  /** Undoes the plan-edit batch AND restores the previous anchors. */
  onUndo: (batchId: string) => void
}

const fmt500 = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')} /500m`

export default function BenchmarkResultCard({ assessment, onApply, onDismiss, onUndo }: Props) {
  const [state, setState] = useState<{ status: 'offered' | 'applied' | 'dismissed'; batchId?: string; appliedSummary?: string }>({ status: 'offered' })

  // The applied confirmation must survive the assessment re-deriving —
  // applying SAVES the suggestion, so `qualifies` flips false on the
  // very next render (field bug: the card vanished with no feedback).
  if (state.status === 'applied') {
    return (
      <div className="bg-emerald-50 dark:bg-emerald-950 rounded-xl p-3 border border-emerald-200 dark:border-emerald-800 flex items-center justify-between gap-2" data-testid="benchmark-applied">
        <p className="text-sm text-emerald-800 dark:text-emerald-200">
          ✓ {state.appliedSummary ?? 'Applied — future workouts only.'}
        </p>
        <button
          onClick={() => { if (state.batchId) onUndo(state.batchId); setState({ status: 'offered' }) }}
          className="text-xs font-semibold text-emerald-700 border border-emerald-300 rounded-lg px-2 py-1 hover:bg-emerald-100 shrink-0"
        >
          Undo
        </button>
      </div>
    )
  }

  if (!assessment.qualifies || state.status === 'dismissed') return null

  const hrSuggested = assessment.suggestedLthr != null || assessment.suggestedMaxHR != null
  const headline = assessment.suggestedLthr != null
    ? `Your time trial puts your threshold HR at ~${assessment.suggestedLthr} bpm`
    : assessment.suggestedMaxHR != null
      ? `Your test hit ${assessment.suggestedMaxHR} bpm — above your configured max`
      : assessment.suggestedErg500Sec != null
        ? `Erg baseline captured — ${fmt500(assessment.suggestedErg500Sec)}`
        : 'Benchmark result ready'

  const appliedSummary = [
    hrSuggested ? 'Zones re-anchored from your benchmark — future workouts only' : null,
    assessment.suggestedErg500Sec != null ? `erg baseline ${fmt500(assessment.suggestedErg500Sec)} saved to your measured benchmarks` : null,
  ].filter(Boolean).join(' · ')

  return (
    <div className="bg-teal-50 dark:bg-teal-950 rounded-xl p-3.5 border border-teal-200 dark:border-teal-800" data-testid="benchmark-card">
      <p className="text-xs font-semibold text-teal-700 dark:text-teal-300 mb-1">Benchmark logged</p>
      <p className="text-sm text-teal-900 dark:text-teal-100 font-medium">{headline}</p>
      <ul className="mt-1.5 space-y-0.5">
        {assessment.evidence.map((e, i) => (
          <li key={i} className="text-xs text-teal-800 dark:text-teal-200 leading-relaxed">{e}</li>
        ))}
      </ul>
      <p className="text-xs text-teal-800 dark:text-teal-200 mt-1.5">
        {hrSuggested
          ? "Apply to update your HR zones and rewrite future workouts' targets. Undoable, and past workouts are never touched."
          : 'Apply to save the result to your measured benchmarks — it feeds Your Engine and the race projection. Undoable.'}
      </p>
      <div className="flex gap-2 mt-2.5">
        <button
          onClick={() => { const batchId = onApply(); setState({ status: 'applied', batchId, appliedSummary }) }}
          className="text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-lg px-3 py-1.5"
          data-testid="benchmark-apply"
        >
          {hrSuggested ? 'Update my zones' : 'Save to my benchmarks'}
        </button>
        <button
          onClick={() => { onDismiss(); setState({ status: 'dismissed' }) }}
          className="text-xs font-medium text-teal-700 dark:text-teal-300 border border-teal-300 dark:border-teal-700 rounded-lg px-3 py-1.5 hover:bg-teal-100 dark:hover:bg-teal-900"
        >
          {hrSuggested ? 'Keep current zones' : 'Not now'}
        </button>
      </div>
    </div>
  )
}
