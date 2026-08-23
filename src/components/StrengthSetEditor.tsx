import { useState } from 'react'
import type { StrengthExerciseLog, StrengthSet } from '../types'
import {
  normalizeExerciseName,
  suggestNextTarget,
  type ExerciseProgression,
  type NextTargetSuggestion,
} from '../utils/strengthProgression'
import { lastSessionSummary } from '../utils/strengthDraft'
import SetKeypad from './SetKeypad'

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

/** Row label for a set: 'W' for warm-ups, 'A' for AMRAP, else its index
 *  among non-warm-up rows (so labels read W, 1, 2, 3 wherever the
 *  warm-up sits). */
function setLabelFor(ex: StrengthExerciseLog, setIdx: number): string {
  const set = ex.sets[setIdx]
  if (set.setType === 'warmup') return 'W'
  if (set.setType === 'amrap') return 'A'
  let n = 0
  for (let i = 0; i <= setIdx; i++) if (ex.sets[i].setType !== 'warmup') n += 1
  return String(n)
}

/** The keypad's raw buffer for a stored weight string: '22.5 lb' → '22.5',
 *  'BW' stays, anything unparseable edits from scratch. */
function weightBuffer(weight: string): string {
  if (weight.trim().toUpperCase() === 'BW') return 'BW'
  return weight.replace(/[^\d.]/g, '')
}

interface ActiveCell {
  exIdx: number
  setIdx: number
  field: 'weight' | 'reps'
}

export default function StrengthSetEditor({ exercises, onChange, progression }: StrengthSetEditorProps) {
  // Which weight/reps cell the stepper keypad is editing. Values are
  // edited ONLY through the keypad — our own panel instead of the system
  // keyboard, which sidesteps the iOS keyboard-resize minefield.
  const [active, setActive] = useState<ActiveCell | null>(null)

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
                    <button
                      onClick={() => setActive({ exIdx, setIdx, field: 'weight' })}
                      aria-label={`Set ${label} weight`}
                      className={`flex-1 min-w-0 px-2 py-1.5 text-xs font-mono text-center border rounded bg-white dark:bg-slate-800 ${
                        active?.exIdx === exIdx && active?.setIdx === setIdx && active.field === 'weight'
                          ? 'border-purple-500 ring-1 ring-purple-500'
                          : ghost ? 'border-purple-100 text-slate-400' : 'border-purple-200 text-slate-700 dark:text-slate-200'
                      }`}
                    >
                      {set.weight || '—'}
                    </button>
                    <button
                      onClick={() => setActive({ exIdx, setIdx, field: 'reps' })}
                      aria-label={`Set ${label} reps`}
                      className={`w-14 px-2 py-1.5 text-xs font-mono text-center border rounded bg-white dark:bg-slate-800 ${
                        active?.exIdx === exIdx && active?.setIdx === setIdx && active.field === 'reps'
                          ? 'border-purple-500 ring-1 ring-purple-500'
                          : ghost ? 'border-purple-100 text-slate-400' : 'border-purple-200 text-slate-700 dark:text-slate-200'
                      }`}
                    >
                      {set.reps || '—'}
                    </button>
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

      {active && exercises[active.exIdx]?.sets[active.setIdx] && (() => {
        const ex = exercises[active.exIdx]
        const set = ex.sets[active.setIdx]
        const prog = ex.name.trim() ? progression.get(normalizeExerciseName(ex.name)) : undefined
        const workingSets = ex.sets.filter(s => s.setType !== 'warmup')
        const target = prog
          ? suggestNextTarget(prog, Math.max(workingSets.length, 1), workingSets[0]?.reps || 10)
          : null
        const lastSets = prog?.last?.sets ?? []
        const lastWeight = (lastSets[active.setIdx] ?? lastSets[lastSets.length - 1])?.weight ?? null
        return (
          <SetKeypad
            key={`${active.exIdx}-${active.setIdx}-${active.field}`}
            field={active.field}
            value={active.field === 'weight' ? weightBuffer(set.weight) : set.reps ? String(set.reps) : ''}
            exerciseName={ex.name}
            setLabel={setLabelFor(ex, active.setIdx)}
            setCount={ex.sets.length}
            targetWeightLb={target?.weightLb ?? null}
            targetReps={target?.reps ?? null}
            lastWeight={lastWeight}
            onInput={raw => {
              // Committing through the keypad IS doing the set.
              if (active.field === 'weight') {
                const weight = raw === 'BW' ? 'BW' : raw === '' ? '' : `${raw} lb`
                updateSet(active.exIdx, active.setIdx, { weight, done: true })
              } else {
                updateSet(active.exIdx, active.setIdx, { reps: parseInt(raw) || 0, done: true })
              }
            }}
            onSwitchField={() =>
              setActive({ ...active, field: active.field === 'weight' ? 'reps' : 'weight' })}
            onSetDone={() => {
              updateSet(active.exIdx, active.setIdx, { done: true })
              // Flow to the next set's weight — the between-sets rhythm.
              if (active.setIdx + 1 < ex.sets.length) {
                setActive({ ...active, setIdx: active.setIdx + 1, field: 'weight' })
              } else {
                setActive(null)
              }
            }}
            onClose={() => setActive(null)}
          />
        )
      })()}
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

