import type { StrengthExerciseLog, StrengthSet } from '../types'
import {
  normalizeExerciseName,
  suggestNextTarget,
  type ExerciseProgression,
  type NextTargetSuggestion,
} from '../utils/strengthProgression'
import { lastSessionSummary } from '../utils/strengthDraft'

/**
 * The set-row strength editor — Phase 1 of the strength-logging overhaul.
 *
 * Design principle: THE PRESCRIPTION IS THE DRAFT. Rows arrive pre-filled
 * (reps from the plan, weight ghosted from the athlete's last session) and
 * UNCHECKED; logging is confirm-or-adjust, not data entry. Editing a row's
 * numbers confirms it automatically — typing IS doing; the checkbox exists
 * for the pure "did it exactly as written" tap and for unchecking a set
 * that didn't happen. Unchecked rows save as done:false (honest data) and
 * are excluded from progression math.
 *
 * This component is deliberately dumb about WHERE exercises come from
 * (plan parse, picker, free text) — it edits the array it's given. The
 * live-session player (Phase 2) reuses it one exercise at a time.
 */

export interface StrengthSetEditorProps {
  exercises: StrengthExerciseLog[]
  onChange: (next: StrengthExerciseLog[]) => void
  /** Per-exercise history, keyed by canonical name. Ghost values and the
   *  "Try today" target come from here; empty map = no history UI. */
  progression: Map<string, ExerciseProgression>
}

/** Format a suggestion's load for display: 0 lb means bodyweight. */
function targetLabel(t: NextTargetSuggestion): string {
  return t.weightLb > 0 ? `${t.weightLb} lb × ${t.reps}` : `BW × ${t.reps}`
}

const TIER_PHRASE: Record<NextTargetSuggestion['tier'], string> = {
  progress: 'ready to progress',
  hold: 'repeat last session',
  deload: 'pull back today',
  starting: 'first time — pick a comfortable weight',
}

/** Cycle a set's intent on tap: working → warmup → AMRAP → working. */
function nextSetType(t: StrengthSet['setType']): StrengthSet['setType'] {
  if (t === 'warmup') return 'amrap'
  if (t === 'amrap') return undefined
  return 'warmup'
}

export default function StrengthSetEditor({ exercises, onChange, progression }: StrengthSetEditorProps) {
  function updateExercise(idx: number, updates: Partial<StrengthExerciseLog>) {
    onChange(exercises.map((ex, i) => (i === idx ? { ...ex, ...updates } : ex)))
  }

  function updateSet(exIdx: number, setIdx: number, updates: Partial<StrengthSet>) {
    const ex = exercises[exIdx]
    updateExercise(exIdx, {
      sets: ex.sets.map((s, i) => (i === setIdx ? { ...s, ...updates } : s)),
    })
  }

  function addSet(exIdx: number) {
    const ex = exercises[exIdx]
    const last = ex.sets[ex.sets.length - 1]
    updateExercise(exIdx, {
      sets: [...ex.sets, { reps: last?.reps || 0, weight: last?.weight || '', done: false }],
    })
  }

  function removeSet(exIdx: number, setIdx: number) {
    const ex = exercises[exIdx]
    if (ex.sets.length <= 1) return
    updateExercise(exIdx, { sets: ex.sets.filter((_, i) => i !== setIdx) })
  }

  /** "Use" the suggested target: fill weight/reps into every working set
   *  and mark them done — the one-tap "did it as suggested" path. Warm-up
   *  rows keep their own numbers (a ramp-in isn't the target). */
  function applyTarget(exIdx: number, t: NextTargetSuggestion) {
    const ex = exercises[exIdx]
    updateExercise(exIdx, {
      sets: ex.sets.map(s =>
        s.setType === 'warmup'
          ? s
          : { ...s, weight: t.weightLb > 0 ? `${t.weightLb} lb` : 'BW', reps: t.reps, done: true },
      ),
    })
  }

  return (
    <div className="space-y-3">
      {exercises.map((ex, exIdx) => {
        const prog = ex.name.trim() ? progression.get(normalizeExerciseName(ex.name)) : undefined
        const lastLine = lastSessionSummary(prog)
        const workingSets = ex.sets.filter(s => s.setType !== 'warmup')
        const plannedReps = workingSets[0]?.reps || 10
        const target = prog
          ? suggestNextTarget(prog, Math.max(workingSets.length, 1), plannedReps)
          : null
        // A working-set index that skips warm-up rows, so labels read
        // W, 1, 2, 3 regardless of where the warm-up sits.
        let workingIdx = 0

        return (
          <div key={exIdx} className="bg-purple-50 dark:bg-slate-900 rounded-xl p-3 border border-purple-200 dark:border-slate-700">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-purple-600">Exercise {exIdx + 1}</span>
              <button
                onClick={() => onChange(exercises.filter((_, i) => i !== exIdx))}
                className="text-xs text-red-500 hover:text-red-700"
              >
                Remove
              </button>
            </div>

            <input
              placeholder="Exercise name (e.g., Back Squat, DB Bench Press)"
              value={ex.name}
              onChange={e => updateExercise(exIdx, { name: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-purple-200 rounded-lg mb-1 focus:outline-none focus:ring-2 focus:ring-purple-500"
            />

            {lastLine && (
              <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400 mb-1.5">Last time: {lastLine}</p>
            )}

            {/* "Try today" — the progression target, one tap to accept. */}
            {target && target.tier !== 'starting' && (
              <div className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 mb-2 border ${
                target.tier === 'progress' ? 'bg-emerald-50 border-emerald-200'
                : target.tier === 'deload' ? 'bg-amber-50 border-amber-200'
                : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700'
              }`}>
                <p className={`flex-1 text-xs leading-snug ${
                  target.tier === 'progress' ? 'text-emerald-800'
                  : target.tier === 'deload' ? 'text-amber-800'
                  : 'text-slate-600 dark:text-slate-300'
                }`}>
                  <span className="font-semibold">Try today: {targetLabel(target)}</span> — {TIER_PHRASE[target.tier]}
                </p>
                <button
                  onClick={() => applyTarget(exIdx, target)}
                  className={`text-xs font-semibold px-2 py-1 rounded-md ${
                    target.tier === 'progress' ? 'text-emerald-700 hover:bg-emerald-100'
                    : target.tier === 'deload' ? 'text-amber-700 hover:bg-amber-100'
                    : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  Use
                </button>
              </div>
            )}

            {/* Column header */}
            <div className="flex items-center gap-2 px-1 mb-1">
              <span className="w-7 text-[10px] font-semibold uppercase text-slate-400">Set</span>
              <span className="flex-1 text-center text-[10px] font-semibold uppercase text-slate-400">Weight</span>
              <span className="w-14 text-center text-[10px] font-semibold uppercase text-slate-400">Reps</span>
              <span className="w-8 text-center text-[10px] font-semibold uppercase text-slate-400">✓</span>
              <span className="w-4" />
            </div>

            <div className="space-y-1.5">
              {ex.sets.map((set, setIdx) => {
                const isWarmup = set.setType === 'warmup'
                const isAmrap = set.setType === 'amrap'
                if (!isWarmup) workingIdx += 1
                const label = isWarmup ? 'W' : isAmrap ? 'A' : String(workingIdx)
                const ghost = set.done === false
                return (
                  <div key={setIdx} className="flex items-center gap-2">
                    {/* Tapping the label cycles working → warm-up → AMRAP. */}
                    <button
                      onClick={() => updateSet(exIdx, setIdx, { setType: nextSetType(set.setType) })}
                      title="Tap to change set type (working / warm-up / AMRAP)"
                      className={`w-7 py-1 rounded text-[11px] font-bold shrink-0 ${
                        isWarmup ? 'bg-amber-100 text-amber-700'
                        : isAmrap ? 'bg-purple-200 text-purple-800'
                        : 'bg-white dark:bg-slate-800 text-purple-500 border border-purple-100'
                      }`}
                    >
                      {label}
                    </button>
                    <input
                      placeholder="lb / BW"
                      value={set.weight}
                      onChange={e => updateSet(exIdx, setIdx, { weight: e.target.value, done: true })}
                      className={`flex-1 min-w-0 px-2 py-1 text-xs border rounded focus:outline-none focus:ring-1 focus:ring-purple-500 ${
                        ghost ? 'border-purple-100 text-slate-400' : 'border-purple-200'
                      }`}
                    />
                    <input
                      type="number"
                      placeholder="Reps"
                      value={set.reps || ''}
                      onChange={e => updateSet(exIdx, setIdx, { reps: parseInt(e.target.value) || 0, done: true })}
                      className={`w-14 px-2 py-1 text-xs border rounded focus:outline-none focus:ring-1 focus:ring-purple-500 ${
                        ghost ? 'border-purple-100 text-slate-400' : 'border-purple-200'
                      }`}
                    />
                    <button
                      onClick={() => updateSet(exIdx, setIdx, { done: set.done === false })}
                      aria-label={ghost ? `Mark set ${label} done` : `Mark set ${label} not done`}
                      className={`w-8 h-7 rounded-md flex items-center justify-center shrink-0 transition-colors ${
                        ghost ? 'border-2 border-slate-300 bg-white dark:bg-slate-800' : 'bg-teal-600'
                      }`}
                    >
                      {!ghost && (
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                      )}
                    </button>
                    {ex.sets.length > 1 ? (
                      <button
                        onClick={() => removeSet(exIdx, setIdx)}
                        aria-label={`Remove set ${label}`}
                        className="w-4 text-[10px] text-red-400 hover:text-red-600 shrink-0"
                      >
                        ✕
                      </button>
                    ) : (
                      <span className="w-4" />
                    )}
                  </div>
                )
              })}
            </div>

            <div className="flex items-center gap-3 mt-1.5">
              <button
                onClick={() => addSet(exIdx)}
                className="text-[10px] text-purple-600 hover:text-purple-800 font-medium"
              >
                + Add Set
              </button>
              <FocusChips value={ex.focus} onChange={focus => updateExercise(exIdx, { focus })} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

const FOCUS_OPTIONS: { value: StrengthExerciseLog['focus']; label: string }[] = [
  { value: 'upper', label: 'Upper' },
  { value: 'lower', label: 'Lower' },
  { value: 'core', label: 'Core' },
  { value: 'full', label: 'Full' },
]

function FocusChips({ value, onChange }: {
  value: StrengthExerciseLog['focus']
  onChange: (v: StrengthExerciseLog['focus']) => void
}) {
  return (
    <div className="flex gap-1 ml-auto">
      {FOCUS_OPTIONS.map(opt => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`px-2 py-0.5 text-[10px] font-medium rounded transition-colors ${
            value === opt.value
              ? 'bg-purple-600 text-white'
              : 'bg-white dark:bg-slate-800 text-purple-600 border border-purple-200'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

