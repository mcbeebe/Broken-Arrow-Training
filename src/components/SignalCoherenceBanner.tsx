import type { TrainingSignals } from '../utils/trainingSignals'
import { AXIS_LABEL, TODAY_CALL_LABEL } from '../utils/trainingSignals'

// Renders a one-line banner above the Summary cards when the three
// engines disagree. When all signals are aligned, the banner is hidden
// — most days the cards speak the same language and no banner is
// needed. The banner exists specifically to name the disagreement so
// the user doesn't have to reconcile contradicting verdicts on their
// own.

export default function SignalCoherenceBanner({
  signals,
}: {
  signals: TrainingSignals
}) {
  if (signals.coherence === 'aligned') return null
  const callLabel = TODAY_CALL_LABEL[signals.todayCall]
  const leadsLabel = AXIS_LABEL[signals.dominant]
  return (
    <div
      role="status"
      className="rounded-xl px-3 py-2.5 border bg-indigo-50 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-900"
    >
      <div className="flex items-start gap-2">
        <span className="text-lg leading-none mt-0.5 shrink-0" aria-hidden>
          ⚖️
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-indigo-900 dark:text-indigo-100">
            Mixed signals — {signals.reason.toLowerCase().replace(/\.$/, '')}.
          </p>
          <p className="text-xs text-indigo-700 dark:text-indigo-200 mt-0.5">
            Today's call: <span className="font-semibold">{callLabel}</span>
            <span className="opacity-70"> · {leadsLabel} leads</span>
          </p>
        </div>
      </div>
    </div>
  )
}
