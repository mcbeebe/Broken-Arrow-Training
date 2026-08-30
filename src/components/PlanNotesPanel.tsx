/**
 * P14 — "About this plan": the permanent home of the plan's advisories.
 *
 * These moved here off Today, where seven of them stacked above the day's
 * answer every morning. Here they sit next to the weeks they describe, which
 * is where an athlete is already asking "why is it built like this?".
 *
 * Collapsed by default so the plan itself opens the tab, and expanded on
 * arrival from Today's row — you tapped to read them, so they are open.
 */
import { useEffect, useRef, useState } from 'react'
import type { PlanAdvisory } from '../types'
import { sortNotes } from '../utils/planNotes'
import InsightNote from './primitives/InsightNote'

interface Props {
  notes: PlanAdvisory[]
  /**
   * Bumped by Today's row. A counter rather than a boolean so a second tap
   * re-opens the panel after the athlete has collapsed it.
   */
  openRequest?: number
}

export default function PlanNotesPanel({ notes, openRequest = 0 }: Props) {
  // Mounted from a tap on Today's row means openRequest is already non-zero
  // before this component exists — so the initial state has to read it, not
  // just the later bumps. Latching `handled` to the same value keeps the
  // adjustment below quiet until the NEXT visit.
  const [open, setOpen] = useState(openRequest > 0)
  const [handled, setHandled] = useState(openRequest)
  const ref = useRef<HTMLDivElement>(null)

  // React's documented render-time adjustment: a prop changed, so derive from
  // it now rather than painting the wrong state and correcting it in an effect.
  if (openRequest !== handled) {
    setHandled(openRequest)
    if (openRequest > 0) setOpen(true)
  }

  useEffect(() => {
    if (openRequest === 0 || !open) return
    // Guarded: not every webview implements it, and a missing scroll is a
    // cosmetic loss — an exception here would take the whole tab down.
    const el = ref.current
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [openRequest, open])

  if (notes.length === 0) return null

  const serious = notes.filter(n => n.severity === 'critical').length

  return (
    <div ref={ref} className="mb-3" data-testid="plan-notes-panel">
      <button
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="w-full flex items-center justify-between bg-white dark:bg-slate-800 rounded-xl px-3.5 py-2.5 shadow-sm border border-slate-100 dark:border-slate-700 text-left"
        data-testid="plan-notes-toggle"
      >
        <span className="text-xs text-slate-600 dark:text-slate-300">
          <span className="font-bold text-slate-700 dark:text-slate-200">About this plan</span>
          {' '}— {notes.length} note{notes.length === 1 ? '' : 's'}
          {serious > 0 ? `, ${serious} serious` : ''}
        </span>
        <span className="text-sm text-slate-400">{open ? '⌃' : '⌄'}</span>
      </button>
      {open && (
        <div className="space-y-2 mt-2" data-testid="plan-notes-list">
          {sortNotes(notes).map(a => (
            <InsightNote
              key={a.id}
              tone={a.severity === 'critical' ? 'critical' : a.severity === 'caution' ? 'warning' : 'neutral'}
              label={a.title}
            >
              {a.detail}
              {a.suggestion ? <span className="block mt-1 opacity-90">→ {a.suggestion}</span> : null}
            </InsightNote>
          ))}
        </div>
      )}
    </div>
  )
}
