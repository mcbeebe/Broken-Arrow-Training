import { useEffect, useRef, useState } from 'react'
import { TERMS, type TermKey } from '../utils/terminology'
import { useTerminologyMode } from '../hooks/useTerminologyMode'

interface TermProps {
  name: TermKey
  /** Override the rendered label. Defaults to the plain or technical name per the active mode. */
  children?: React.ReactNode
  /** Athlete id for the per-athlete terminology mode. */
  athleteId?: string
  className?: string
}

/**
 * `<Term name="ctl">` renders a tap-to-explain training-science term.
 *
 *  - Default copy is plain English ("Fitness"). The user can flip to technical
 *    acronyms ("CTL") via Settings → Appearance → "Show technical names".
 *  - Tapping the term opens a small popover with a one-sentence definition.
 *  - Keyboard accessible (Enter/Space toggles, Esc closes).
 */
export default function Term({ name, children, athleteId, className = '' }: TermProps) {
  const { showTechnicalNames } = useTerminologyMode(athleteId)
  const [open, setOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const entry = TERMS[name]
  const label = children ?? (showTechnicalNames ? entry.tech : entry.plain)

  // Close on outside click and on Escape.
  useEffect(() => {
    if (!open) return
    function onDocClick(e: MouseEvent) {
      const t = e.target as Node
      if (
        buttonRef.current?.contains(t) ||
        popoverRef.current?.contains(t)
      ) return
      setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <span className={`relative inline-block ${className}`}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-label={`What does ${entry.plain} (${entry.tech}) mean?`}
        className="underline decoration-dotted decoration-slate-400 underline-offset-2 focus:outline-none focus:ring-1 focus:ring-blue-400 rounded-sm"
      >
        {label}
      </button>
      {open && (
        <div
          ref={popoverRef}
          role="tooltip"
          className="absolute z-50 top-full left-0 mt-1 w-64 p-3 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-left"
        >
          <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">
            {entry.plain} <span className="text-slate-400 font-normal">({entry.tech})</span>
          </p>
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-300 leading-snug">
            {entry.definition}
          </p>
          {entry.hint && (
            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 italic">{entry.hint}</p>
          )}
        </div>
      )}
    </span>
  )
}
