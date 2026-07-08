import { useState } from 'react'
import type { RecalibrationAssessment } from '../engines/planGenerator/recalibration'

/**
 * G5 delivery surface: the recalibration OFFER. Deterministic (no LLM in
 * the loop — the evidence is the argument), opt-in, targets-only,
 * undoable. Follows the verified trust pattern: prompt + explain +
 * one-tap; a target can never change without the athlete tapping Apply
 * (the plan-hash guard lives in the tests).
 */

interface Props {
  assessment: RecalibrationAssessment
  /** Applies the repace ops as one undoable batch; returns the batchId. */
  onApply: () => string
  onDismiss: () => void
  onUndo: (batchId: string) => void
}

export default function RecalibrationCard({ assessment, onApply, onDismiss, onUndo }: Props) {
  const [state, setState] = useState<{ status: 'offered' | 'applied' | 'dismissed'; batchId?: string }>({ status: 'offered' })
  if (!assessment.qualifies || state.status === 'dismissed') return null

  const pctFaster = ((1 - assessment.suggestedFactor) * 100).toFixed(1)

  if (state.status === 'applied') {
    return (
      <div className="bg-emerald-50 dark:bg-emerald-950 rounded-xl p-3 border border-emerald-200 dark:border-emerald-800 flex items-center justify-between" data-testid="recal-applied">
        <p className="text-sm text-emerald-800 dark:text-emerald-200">
          ✓ Pace targets updated ({pctFaster}% faster) — future workouts only.
        </p>
        <button
          onClick={() => { if (state.batchId) onUndo(state.batchId); setState({ status: 'offered' }) }}
          className="text-xs font-semibold text-emerald-700 border border-emerald-300 rounded-lg px-2 py-1 hover:bg-emerald-100"
        >
          Undo
        </button>
      </div>
    )
  }

  return (
    <div className="bg-teal-50 dark:bg-teal-950 rounded-xl p-3.5 border border-teal-200 dark:border-teal-800" data-testid="recal-card">
      <p className="text-xs font-semibold text-teal-700 dark:text-teal-300 mb-1">Pace check-in</p>
      <p className="text-sm text-teal-900 dark:text-teal-100 font-medium">
        You've been running faster than your targets — at the right effort. Update your paces?
      </p>
      <ul className="mt-2 space-y-1">
        {assessment.evidence.slice(0, 3).map((line, i) => (
          <li key={i} className="text-xs text-teal-800 dark:text-teal-200">• {line}</li>
        ))}
      </ul>
      <p className="text-xs text-teal-700 dark:text-teal-300 mt-2">
        This makes future pace targets ~{pctFaster}% faster (half the observed gain — we recalibrate
        conservatively). Workout structure doesn't change, past weeks don't change, and you can undo.
      </p>
      <div className="flex gap-2 mt-2.5">
        <button
          onClick={() => setState({ status: 'applied', batchId: onApply() })}
          className="rounded-lg bg-teal-700 text-white text-sm font-semibold px-3 py-1.5 hover:bg-teal-800"
        >
          Update my paces
        </button>
        <button
          onClick={() => { onDismiss(); setState({ status: 'dismissed' }) }}
          className="text-sm text-slate-500 px-2"
        >
          Keep current targets
        </button>
      </div>
    </div>
  )
}
