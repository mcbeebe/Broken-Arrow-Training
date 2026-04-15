import type { PendingInference } from '../types'

interface Props {
  inference: PendingInference
  onAccept: (id: string) => void
  onDismiss: (id: string) => void
}

/**
 * "Coach noticed" card. Appears when the server-side inference detector
 * spots a durable fact worth adding to About Me. User approves or
 * dismisses; accepting appends to About Me.
 */
export default function PendingInferenceView({ inference, onAccept, onDismiss }: Props) {
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-3">
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className="text-base">💡</span>
        <p className="text-[10px] font-bold uppercase tracking-wider text-amber-800">
          Coach noticed
        </p>
      </div>
      <p className="text-sm text-slate-800 leading-snug">{inference.text}</p>
      <p className="text-[10px] text-amber-700/70 mt-1">
        Save this to your About Me so the coach remembers?
      </p>
      <div className="flex gap-2 mt-2">
        <button
          onClick={() => onAccept(inference.id)}
          className="text-xs font-semibold px-3 py-1 rounded-lg bg-amber-600 text-white hover:bg-amber-700 transition-colors"
        >
          Save to About Me
        </button>
        <button
          onClick={() => onDismiss(inference.id)}
          className="text-xs font-medium px-3 py-1 rounded-lg text-amber-800 hover:bg-amber-100 transition-colors"
        >
          Not this one
        </button>
      </div>
    </div>
  )
}
