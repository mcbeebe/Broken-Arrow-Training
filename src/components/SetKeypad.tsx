import { useState } from 'react'

/**
 * The stepper keypad — Phase 1 of the strength-logging overhaul.
 *
 * Weights and reps are edited through this in-app panel instead of the
 * system keyboard: ±2.5 lb / ±1 rep steppers for the common case, a digit
 * grid for everything else, and quick chips (target / same as last / BW).
 * Deliberately our own surface — it sidesteps the iOS keyboard-resize
 * minefield entirely (a named risk in the roadmap) and keeps every
 * control ≥44px for a mid-session thumb.
 *
 * The panel is dumb about WHERE the value lives: the parent owns the
 * active cell and receives every buffer change through onInput. `value`
 * is the raw buffer — a number string like "22.5", or "BW" for weight.
 */

export interface SetKeypadProps {
  field: 'weight' | 'reps'
  value: string
  exerciseName: string
  /** Set label as rendered in the row: 'W', 'A', '1', '2', … */
  setLabel: string
  setCount: number
  /** Progression target for the quick chip; null hides it. */
  targetWeightLb?: number | null
  targetReps?: number | null
  /** Last session's weight for this position (e.g. "20 lb"); null hides. */
  lastWeight?: string | null
  onInput: (raw: string) => void
  onSwitchField: () => void
  /** "Set done": parent marks the set done and advances or closes. */
  onSetDone: () => void
  onClose: () => void
}

const WEIGHT_STEP = 2.5
const REP_STEP = 1

function toNumber(raw: string): number {
  const n = parseFloat(raw)
  return Number.isFinite(n) ? n : 0
}

/** Trim trailing ".0" so steppers produce "25" not "25.0". */
function fmt(n: number): string {
  return String(Math.round(n * 10) / 10)
}

export default function SetKeypad({
  field, value, exerciseName, setLabel, setCount,
  targetWeightLb, targetReps, lastWeight,
  onInput, onSwitchField, onSetDone, onClose,
}: SetKeypadProps) {
  // First digit after opening REPLACES the ghost value instead of
  // appending to it — matching how every numeric editor behaves. The
  // parent keys this component per cell, so switching cells remounts
  // and resets the flag without an effect.
  const [touched, setTouched] = useState(false)

  const isWeight = field === 'weight'
  const step = isWeight ? WEIGHT_STEP : REP_STEP

  function bump(delta: number) {
    const next = Math.max(0, toNumber(value === 'BW' ? '0' : value) + delta)
    setTouched(true)
    onInput(fmt(next))
  }

  function pressDigit(d: string) {
    const base = touched && value !== 'BW' ? value : ''
    if (d === '.' && (base.includes('.') || !isWeight)) return
    setTouched(true)
    onInput(base + d)
  }

  function backspace() {
    setTouched(true)
    onInput(value === 'BW' ? '' : value.slice(0, -1))
  }

  const lastNumeric = lastWeight ? lastWeight.replace(/[^\d.]/g, '') : ''

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[60] bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 rounded-t-2xl shadow-[0_-8px_24px_rgba(15,23,42,0.12)] px-4 pt-3 pb-7">
      {/* Context + value + steppers */}
      <div className="flex items-center justify-between mb-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wide text-purple-700 truncate">
            {exerciseName || 'Exercise'} · set {setLabel} of {setCount} · {isWeight ? 'weight' : 'reps'}
          </p>
          <p className="font-mono text-2xl font-bold text-slate-800 dark:text-white">
            {value === '' ? <span className="text-slate-300">0</span> : value}
            {isWeight && value !== 'BW' && <span className="text-sm font-medium text-slate-400"> lb</span>}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => bump(-step)}
            aria-label={`minus ${step}`}
            className="w-14 h-12 rounded-xl bg-slate-100 dark:bg-slate-700 flex flex-col items-center justify-center"
          >
            <span className="text-lg font-bold text-slate-600 dark:text-slate-200 leading-none">−</span>
            <span className="font-mono text-[10px] text-slate-500">{step}</span>
          </button>
          <button
            onClick={() => bump(step)}
            aria-label={`plus ${step}`}
            className="w-14 h-12 rounded-xl bg-purple-600 flex flex-col items-center justify-center"
          >
            <span className="text-lg font-bold text-white leading-none">+</span>
            <span className="font-mono text-[10px] text-purple-200">{step}</span>
          </button>
        </div>
      </div>

      {/* Quick chips */}
      <div className="flex gap-2 mb-3">
        {isWeight && targetWeightLb != null && targetWeightLb > 0 && (
          <button
            onClick={() => { setTouched(true); onInput(fmt(targetWeightLb)) }}
            className="flex-1 py-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs font-semibold text-emerald-700"
          >
            Target {fmt(targetWeightLb)}
          </button>
        )}
        {!isWeight && targetReps != null && targetReps > 0 && (
          <button
            onClick={() => { setTouched(true); onInput(String(targetReps)) }}
            className="flex-1 py-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs font-semibold text-emerald-700"
          >
            Target {targetReps}
          </button>
        )}
        {isWeight && lastNumeric && (
          <button
            onClick={() => { setTouched(true); onInput(lastNumeric) }}
            className="flex-1 py-2.5 rounded-lg bg-slate-100 dark:bg-slate-700 text-xs font-mono font-semibold text-slate-600 dark:text-slate-200"
          >
            Last ({lastWeight})
          </button>
        )}
        {isWeight && (
          <button
            onClick={() => { setTouched(true); onInput('BW') }}
            className="flex-1 py-2.5 rounded-lg bg-slate-100 dark:bg-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-200"
          >
            BW
          </button>
        )}
        <button onClick={onClose} className="px-3 py-2.5 rounded-lg text-xs font-medium text-slate-400">
          Close
        </button>
      </div>

      {/* Digit grid */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(d => (
          <button
            key={d}
            onClick={() => pressDigit(d)}
            className="h-11 rounded-xl bg-slate-50 dark:bg-slate-700 border border-slate-100 dark:border-slate-600 font-mono text-lg font-semibold text-slate-700 dark:text-slate-200"
          >
            {d}
          </button>
        ))}
        <button
          onClick={() => pressDigit('.')}
          disabled={!isWeight}
          className="h-11 rounded-xl bg-slate-50 dark:bg-slate-700 border border-slate-100 dark:border-slate-600 font-mono text-lg font-semibold text-slate-700 dark:text-slate-200 disabled:opacity-30"
        >
          .
        </button>
        <button
          onClick={() => pressDigit('0')}
          className="h-11 rounded-xl bg-slate-50 dark:bg-slate-700 border border-slate-100 dark:border-slate-600 font-mono text-lg font-semibold text-slate-700 dark:text-slate-200"
        >
          0
        </button>
        <button
          onClick={backspace}
          aria-label="backspace"
          className="h-11 rounded-xl bg-slate-50 dark:bg-slate-700 border border-slate-100 dark:border-slate-600 flex items-center justify-center"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-600 dark:text-slate-200">
            <path d="M21 4H8l-7 8 7 8h13a2 2 0 002-2V6a2 2 0 00-2-2z" /><line x1="18" y1="9" x2="12" y2="15" /><line x1="12" y1="9" x2="18" y2="15" />
          </svg>
        </button>
      </div>

      {/* Advance */}
      <div className="flex gap-2">
        <button
          onClick={onSwitchField}
          className="flex-1 h-11 rounded-xl border border-slate-200 dark:border-slate-600 text-sm font-semibold text-slate-600 dark:text-slate-200"
        >
          {isWeight ? 'Next: reps' : 'Next: weight'}
        </button>
        <button
          onClick={onSetDone}
          className="flex-1 h-11 rounded-xl bg-teal-600 text-sm font-bold text-white flex items-center justify-center gap-1.5"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
          Set done
        </button>
      </div>
    </div>
  )
}
