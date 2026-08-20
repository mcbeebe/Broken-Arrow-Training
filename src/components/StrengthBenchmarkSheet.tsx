import { useState } from 'react'
import {
  itemsFor, type BenchmarkItem, type StrengthCapacity,
} from '../engines/strength/benchmark'

interface Props {
  kind: 'hyrox' | 'general'
  /** Previous results, when re-testing — shown alongside so progress is visible. */
  previous?: StrengthCapacity | null
  todayIso: string
  onSave: (capacity: StrengthCapacity) => void
  onClose: () => void
}

const FIELD: Record<string, keyof StrengthCapacity> = {
  push_ups: 'pushUps',
  goblet_squat: 'gobletSquatLb',
  plank: 'plankSec',
  wall_balls: 'wallBallsUnbroken',
  sled_push: 'sledRpe',
  erg_500: 'erg500Sec',
}

const UNIT_LABEL: Record<BenchmarkItem['unit'], string> = {
  reps: 'reps',
  lb: 'lb',
  seconds: 'sec',
  rpe: '1–10',
}

/**
 * Log the benchmark. Every field is optional — an athlete without a rower
 * shouldn't be blocked from recording their push-ups, and a partial
 * benchmark still beats a self-report for the parts it covers.
 */
export default function StrengthBenchmarkSheet({ kind, previous, todayIso, onSave, onClose }: Props) {
  const items = itemsFor(kind)
  const [values, setValues] = useState<Record<string, string>>({})

  const anyEntered = Object.values(values).some(v => v.trim() !== '' && Number.isFinite(Number(v)))

  function handleSave() {
    const next: StrengthCapacity = { measuredAt: todayIso }
    for (const item of items) {
      const raw = values[item.id]
      if (raw === undefined || raw.trim() === '') continue
      const n = Number(raw)
      if (!Number.isFinite(n)) continue
      // Clamp rather than reject — a fat-fingered 1000 lb goblet squat
      // becomes a prescription otherwise.
      const clamped = Math.min(item.max, Math.max(item.min, n))
      ;(next[FIELD[item.id]] as number) = Math.round(clamped)
    }
    onSave(next)
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-label="Log your strength benchmark"
    >
      <div className="bg-white dark:bg-slate-800 w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl max-h-[92vh] overflow-y-auto">
        <div className="sticky top-0 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-4 py-3 flex items-start justify-between gap-3">
          <div>
            <p className="font-bold text-slate-800 dark:text-white">
              {previous ? 'Log your re-test' : 'Log your benchmark'}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Every field is optional. What you fill in stops being a guess.
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-slate-400 text-xl leading-none shrink-0">×</button>
        </div>

        <div className="px-4 py-3 space-y-4">
          {items.map(item => {
            const prev = previous?.[FIELD[item.id]] as number | undefined
            return (
              <div key={item.id}>
                <label htmlFor={`bench-${item.id}`} className="block text-sm font-semibold text-slate-800 dark:text-white">
                  {item.label}
                </label>
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5 leading-relaxed">{item.protocol}</p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-relaxed italic">{item.why}</p>
                <div className="flex items-center gap-2 mt-1.5">
                  <input
                    id={`bench-${item.id}`}
                    type="number"
                    inputMode="numeric"
                    min={item.min}
                    max={item.max}
                    value={values[item.id] ?? ''}
                    onChange={e => setValues(v => ({ ...v, [item.id]: e.target.value }))}
                    className="w-28 rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white px-2.5 py-1.5 text-sm"
                    placeholder="—"
                  />
                  <span className="text-xs text-slate-500 dark:text-slate-400">{UNIT_LABEL[item.unit]}</span>
                  {typeof prev === 'number' && (
                    <span className="text-xs text-slate-500 dark:text-slate-400">· last time: {prev}</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        <div className="px-4 pb-5 pt-1">
          <button
            onClick={handleSave}
            disabled={!anyEntered}
            className="w-full rounded-xl bg-emerald-600 disabled:bg-slate-300 dark:disabled:bg-slate-600 text-white font-semibold py-2.5"
          >
            Save benchmark
          </button>
          <p className="text-[11px] text-center text-slate-500 dark:text-slate-400 mt-2">
            Your plan re-prescribes from these numbers immediately.
          </p>
        </div>
      </div>
    </div>
  )
}
