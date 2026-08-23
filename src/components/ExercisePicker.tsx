import { useMemo, useState } from 'react'
import type { StrengthExerciseLog } from '../types'
import { listExerciseGuides } from '../utils/exercises'
import { normalizeExerciseName, type ExerciseProgression } from '../utils/strengthProgression'
import { detectFocus, draftExercise } from '../utils/strengthDraft'

/**
 * The exercise picker — Phase 1 of the strength-logging overhaul.
 *
 * Free-text names fragment history ("DB Row" vs "db rows" never stitch),
 * so picking becomes the primary path: today's plan first, then recents
 * from the athlete's own history, then the guide library with search and
 * focus filters. Free text stays as the explicit escape hatch at the
 * bottom — never lost, just no longer the default.
 *
 * Every pick returns a fully drafted exercise (prescription or last
 * session as ghost rows) via draftExercise, so the caller just appends.
 */

export interface ExercisePickerProps {
  /** Prescription parsed from today's plan detail (may be empty). */
  plannedExercises: StrengthExerciseLog[]
  /** Names already in the log — filtered out of plan/recent suggestions. */
  existingNames: string[]
  progression: Map<string, ExerciseProgression>
  onPick: (exercise: StrengthExerciseLog) => void
  onClose: () => void
}

type FocusFilter = 'all' | 'upper' | 'lower' | 'core'

export default function ExercisePicker({
  plannedExercises, existingNames, progression, onPick, onClose,
}: ExercisePickerProps) {
  const [query, setQuery] = useState('')
  const [focus, setFocus] = useState<FocusFilter>('all')

  const existingCanonical = useMemo(
    () => new Set(existingNames.filter(n => n.trim()).map(normalizeExerciseName)),
    [existingNames],
  )

  const q = query.trim().toLowerCase()

  const fromPlan = plannedExercises.filter(ex =>
    !existingCanonical.has(normalizeExerciseName(ex.name))
    && (!q || ex.name.toLowerCase().includes(q)),
  )

  // Recents: the athlete's own history, newest first.
  const recents = useMemo(() => {
    return [...progression.values()]
      .filter(p => p.last && !existingCanonical.has(p.canonicalName))
      .sort((a, b) => (b.last!.date).localeCompare(a.last!.date))
      .slice(0, 8)
  }, [progression, existingCanonical])
  const visibleRecents = recents.filter(p => !q || p.displayName.toLowerCase().includes(q))

  const guides = useMemo(() => listExerciseGuides(), [])
  const visibleGuides = guides.filter(g => {
    if (q && !g.name.toLowerCase().includes(q) && !g.aka.toLowerCase().includes(q)) return false
    if (focus !== 'all' && detectFocus(g.name) !== focus) return false
    return true
  })

  function pick(name: string, plannedSets?: StrengthExerciseLog['sets']) {
    onPick(draftExercise(name, progression, plannedSets))
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="relative bg-white dark:bg-slate-800 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[85dvh] flex flex-col shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-4 pt-4 pb-3 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-slate-800 dark:text-white">Add exercise</h3>
            <button onClick={onClose} className="text-sm font-medium text-slate-500">Cancel</button>
          </div>
          <div className="flex items-center gap-2 h-11 bg-slate-100 dark:bg-slate-700 rounded-xl px-3">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-slate-400 shrink-0">
              <circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.5" y2="16.5" />
            </svg>
            <input
              autoFocus={false}
              placeholder="Search exercises…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              className="flex-1 bg-transparent text-sm text-slate-700 dark:text-slate-100 focus:outline-none"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
          {fromPlan.length > 0 && (
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wide text-teal-600 mb-2">From today's plan</p>
              <div className="space-y-1.5">
                {fromPlan.map(ex => (
                  <button
                    key={ex.name}
                    onClick={() => pick(ex.name, ex.sets)}
                    className="w-full min-h-[44px] flex items-center gap-2 bg-teal-50 border border-teal-200 rounded-xl px-3 py-2 text-left"
                  >
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-semibold text-teal-900 truncate">{ex.name}</span>
                      <span className="block font-mono text-[11px] text-teal-600">
                        planned {ex.sets.length} × {ex.sets[0]?.reps ?? '—'}
                      </span>
                    </span>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0d9488" strokeWidth="2.2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                  </button>
                ))}
              </div>
            </div>
          )}

          {visibleRecents.length > 0 && (
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-2">Recent</p>
              <div className="flex flex-wrap gap-2">
                {visibleRecents.map(p => (
                  <button
                    key={p.canonicalName}
                    onClick={() => pick(p.displayName)}
                    className="px-3.5 py-2.5 rounded-full bg-purple-50 border border-purple-200 text-[13px] font-medium text-purple-700"
                  >
                    {p.displayName}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Library</p>
              <div className="flex gap-1.5">
                {(['all', 'upper', 'lower', 'core'] as const).map(f => (
                  <button
                    key={f}
                    onClick={() => setFocus(f)}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-medium capitalize ${
                      focus === f
                        ? 'bg-purple-600 text-white'
                        : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300'
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>
            <div>
              {visibleGuides.map(g => {
                const prog = progression.get(normalizeExerciseName(g.name))
                return (
                  <button
                    key={g.name}
                    onClick={() => pick(g.name)}
                    className="w-full min-h-[52px] flex items-center gap-2 border-b border-slate-100 dark:border-slate-700 text-left"
                  >
                    <span className="flex-1 min-w-0 py-1.5">
                      <span className="block text-sm font-semibold text-slate-700 dark:text-slate-200 truncate">{g.name}</span>
                      <span className="block font-mono text-[11px] text-slate-400 truncate">
                        {detectFocus(g.name)}
                        {prog?.last
                          ? ` · last Wk ${prog.last.weekNum}${prog.last.topWeightLb > 0 ? ` · ${prog.last.topWeightLb} lb` : ''}`
                          : ` · ${g.weight}`}
                      </span>
                    </span>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-slate-300 shrink-0"><polyline points="9 6 15 12 9 18" /></svg>
                  </button>
                )
              })}
              {visibleGuides.length === 0 && (
                <p className="text-xs text-slate-400 italic py-2">No library matches.</p>
              )}
            </div>
          </div>
        </div>

        {/* Free-text escape hatch */}
        <div className="px-4 py-3 pb-6 border-t border-slate-200 dark:border-slate-700">
          <button
            onClick={() => pick(query.trim() || '')}
            className="w-full text-center text-[13px] text-slate-500"
          >
            {query.trim()
              ? <>Add <span className="font-semibold text-purple-700">"{query.trim()}"</span> as custom</>
              : <span className="font-semibold text-purple-700">Add a custom exercise</span>}
          </button>
        </div>
      </div>
    </div>
  )
}
