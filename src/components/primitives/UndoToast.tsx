import { useEffect, useRef, useState } from 'react'

interface Props {
  /** Toast message — "Moved Tuesday to Wednesday". */
  message: string
  /** Click handler for the Undo action. Hides the toast on success. */
  onUndo: () => void
  /** Called when the toast auto-dismisses or the user closes it. */
  onDismiss: () => void
  /** Auto-dismiss timer in ms. Default 8000 — long enough to react, short
   *  enough not to linger. */
  durationMs?: number
  /** Label override for the action button. */
  undoLabel?: string
}

/**
 * Single-toast visual. Caller manages mount/unmount and queue. Pinned to
 * bottom-center on web, with a thin progress underline that drains over the
 * dismiss duration so the user sees their time-window shrinking. Removes
 * the "Revert" round-trip flagged in the UX audit (App.tsx plan overrides).
 */
export default function UndoToast({
  message, onUndo, onDismiss, durationMs = 8000, undoLabel = 'Undo',
}: Props) {
  const [paused, setPaused] = useState(false)
  const startRef = useRef<number>(0)
  const remainingRef = useRef<number>(durationMs)

  useEffect(() => {
    if (paused) return
    const start = Date.now()
    startRef.current = start
    const id = window.setTimeout(onDismiss, remainingRef.current)
    return () => {
      window.clearTimeout(id)
      remainingRef.current = Math.max(0, remainingRef.current - (Date.now() - start))
    }
  }, [paused, onDismiss])

  return (
    <div
      role="status"
      aria-live="polite"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 max-w-[90vw] flex items-center gap-3 px-4 py-3 rounded-full bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 shadow-lg"
    >
      <span className="text-sm font-medium truncate">{message}</span>
      <button
        type="button"
        onClick={() => { onUndo(); onDismiss() }}
        className="text-sm font-bold uppercase tracking-wider text-intelligence-400 dark:text-intelligence-600 hover:text-intelligence-300 dark:hover:text-intelligence-700"
      >
        {undoLabel}
      </button>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={onDismiss}
        className="text-slate-400 dark:text-slate-500 hover:text-white dark:hover:text-slate-900 text-lg leading-none"
      >
        ×
      </button>
    </div>
  )
}
