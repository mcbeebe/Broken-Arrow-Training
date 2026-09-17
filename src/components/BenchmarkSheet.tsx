import { useMemo, useState } from 'react'
import {
  BENCHMARK_KINDS, kindsForPlan, isPlausible, isStale, sameSeries,
  type Benchmark, type BenchmarkKind, type BenchmarkUnit, type PlanKind,
} from '../engines/benchmark/log'
import { previewBenchmark, formatBenchmarkValue, type PreviewInput } from '../engines/benchmark/preview'
import { parseTimeToSeconds } from '../utils/parseTime'
import { isoFromLocalDate } from '../utils/planDates'

/**
 * Add a benchmark — the one front door onto every number the plan runs on.
 *
 * Presets are the kinds this plan can use; "Something else" takes a label
 * and a unit of the athlete's choosing. Any entry can carry a protocol in
 * the athlete's words. Before Save, "What this changes" is computed by the
 * real engines (previewBenchmark), so what the athlete confirms is what
 * the plan does — a benchmark applies immediately, with one undo after.
 *
 * Same sheet idiom as StrengthBenchmarkSheet: backdrop closes, 85dvh so the
 * sticky header stays reachable on iOS.
 */

interface Props {
  plan: PlanKind
  todayIso: string
  /** The rest of PreviewInput, minus the candidate the sheet builds. */
  preview: Omit<PreviewInput, 'candidate'>
  /** Open with a preset already chosen. */
  initialKind?: BenchmarkKind
  /** For a custom series ("Murph"): open on that label and unit, so a
   *  re-test lands in the same series as the last one. */
  initialLabel?: string
  initialUnit?: BenchmarkUnit
  onSave: (entry: Omit<Benchmark, 'id' | 'at'>) => void
  onClose: () => void
}

type When = 'today' | 'last_week' | 'date'

const UNIT_LABEL: Record<BenchmarkUnit, string> = {
  seconds: 'time', bpm: 'bpm', reps: 'reps', lb: 'lb', rpe: 'RPE 1–10',
}
const PLACEHOLDER: Partial<Record<BenchmarkKind, string>> = {
  race_5k: '21:40', race_10k: '45:10', race_hm: '1:41:30', race_marathon: '3:35:00', mile_tt: '6:12',
  easy_pace: '8:45 (per mile)', lthr: '168', ski_erg_1k: '4:10', row_1k: '3:50', erg_500: '1:45', erg_1k: '3:40',
  wall_balls_unbroken: '42', wall_balls_100: '4:40', sled_push_rpe: '7', run_1k: '4:05',
  push_ups: '40', goblet_squat_8rm: '55', plank: '1:30',
}
const PROTOCOL_HINT: Partial<Record<BenchmarkKind, string>> = {
  wall_balls_unbroken: 'e.g. rested, one set to failure',
  wall_balls_100: 'e.g. Open weight to a 10 ft target',
  push_ups: 'e.g. one unbroken set — or "in 2 minutes"',
  plank: 'e.g. stopped when hips dropped',
  goblet_squat_8rm: 'e.g. worked up in 5 lb jumps',
  sled_push_rpe: 'e.g. 4 × 25 m at Open weight',
  easy_pace: 'e.g. conversational, flat road',
  lthr: 'e.g. 20-min TT, average of last 15 min × 0.95',
}

function shiftDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  return isoFromLocalDate(new Date(y, m - 1, d + days))
}

export default function BenchmarkSheet({ plan, todayIso, preview, initialKind, initialLabel, initialUnit, onSave, onClose }: Props) {
  const presets = useMemo(() => kindsForPlan(plan), [plan])
  const [kind, setKind] = useState<BenchmarkKind>(initialKind ?? presets[0])
  const [raw, setRaw] = useState('')
  const [protocol, setProtocol] = useState('')
  const [label, setLabel] = useState(initialLabel ?? '')
  const [customUnit, setCustomUnit] = useState<BenchmarkUnit>(initialUnit ?? 'seconds')
  const [when, setWhen] = useState<When>('today')
  const [dateIso, setDateIso] = useState(todayIso)

  const spec = BENCHMARK_KINDS[kind]
  const unit: BenchmarkUnit = kind === 'other' ? customUnit : spec.unit
  const measuredOn = when === 'today' ? todayIso : when === 'last_week' ? shiftDays(todayIso, -7) : dateIso

  const parsed = useMemo(() => {
    const t = raw.trim()
    if (!t) return null
    if (unit === 'seconds') {
      const s = parseTimeToSeconds(t)
      return s != null && s > 0 ? s : null
    }
    const n = Number(t)
    return Number.isFinite(n) && n >= 0 ? n : null
  }, [raw, unit])

  const plausible = parsed != null && (kind === 'other' || isPlausible(kind, parsed))
  const candidate = useMemo<Omit<Benchmark, 'id' | 'at'> | null>(() => {
    if (parsed == null) return null
    return {
      kind, value: parsed, unit, dateIso: measuredOn, source: 'manual',
      ...(protocol.trim() ? { protocol: protocol.trim() } : {}),
      ...(kind === 'other' && label.trim() ? { label: label.trim() } : {}),
    }
  }, [kind, parsed, unit, measuredOn, protocol, label])

  const result = useMemo(
    () => (candidate && plausible ? previewBenchmark({ ...preview, candidate }) : null),
    [candidate, plausible, preview],
  )
  const canSave = !!candidate && plausible && (kind !== 'other' || label.trim().length > 0)
  const current = preview.log
    .filter(b => !b.deleted && sameSeries(b, { kind, label }))
    .sort((a, b) => b.dateIso.localeCompare(a.dateIso) || b.at - a.at)[0]
  const currentName = kind === 'other' && label.trim() ? label.trim() : spec.label

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="relative bg-white dark:bg-slate-800 w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl max-h-[85dvh] overflow-y-auto shadow-xl"
        onClick={e => e.stopPropagation()}
        role="dialog" aria-modal="true" aria-label="Add a benchmark"
      >
        <div className="sticky top-0 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-4 py-3 flex items-start justify-between gap-3">
          <div>
            <p className="font-bold text-slate-800 dark:text-white">Add a benchmark</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">A number you measured. It applies as soon as you save — with an undo.</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-slate-400 text-xl leading-none shrink-0">×</button>
        </div>

        <div className="px-4 py-3 space-y-4">
          <div>
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">What did you measure?</p>
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Benchmark kind">
              {presets.map(k => (
                <button
                  key={k} type="button" role="radio" aria-checked={kind === k}
                  onClick={() => { setKind(k); setRaw('') }}
                  className={`rounded-lg border px-2.5 py-1.5 text-xs font-bold ${
                    kind === k ? 'border-teal-500 bg-teal-100 text-teal-800' : 'border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-400'
                  }`}
                >{BENCHMARK_KINDS[k].label}</button>
              ))}
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5">{spec.feeds}</p>
          </div>

          {kind === 'other' && (
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <div>
                <label htmlFor="bm-label" className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">What is it?</label>
                <input id="bm-label" type="text" value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. Murph, 400m repeat, dead hang"
                  className="w-full px-3 py-2.5 text-base border border-slate-300 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-400" />
              </div>
              <div>
                <label htmlFor="bm-unit" className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">Measured as</label>
                <select id="bm-unit" value={customUnit} onChange={e => { setCustomUnit(e.target.value as BenchmarkUnit); setRaw('') }}
                  className="px-3 py-2.5 text-base border border-slate-300 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-900 dark:text-white">
                  <option value="seconds">time</option><option value="reps">reps</option><option value="lb">lb</option><option value="bpm">bpm</option><option value="rpe">RPE</option>
                </select>
              </div>
            </div>
          )}

          <div>
            <label htmlFor="bm-value" className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
              {unit === 'seconds' ? (kind === 'easy_pace' ? 'Pace per mile' : 'Time') : UNIT_LABEL[unit][0].toUpperCase() + UNIT_LABEL[unit].slice(1)}
            </label>
            <input
              id="bm-value" type="text" inputMode={unit === 'seconds' ? 'numeric' : 'decimal'} autoComplete="off"
              value={raw} onChange={e => setRaw(e.target.value)}
              placeholder={PLACEHOLDER[kind] ?? (unit === 'seconds' ? 'm:ss or h:mm:ss' : '—')}
              className="w-full px-3 py-3 text-base border border-slate-300 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-400"
            />
            {raw.trim() && parsed == null && (
              <p className="text-xs text-amber-600 mt-1">{unit === 'seconds' ? 'Enter as m:ss or h:mm:ss (the “:” is optional).' : 'Enter a number.'}</p>
            )}
            {parsed != null && !plausible && (
              <p className="text-xs text-amber-600 mt-1" data-testid="bm-implausible">
                That reads as {formatBenchmarkValue({ kind, value: parsed, unit })} — outside the range a {spec.label} can be. Check the number.
              </p>
            )}
            {parsed != null && plausible && (
              <p className="text-xs text-teal-600 mt-1" data-testid="bm-echo">Reading this as {formatBenchmarkValue({ kind, value: parsed, unit })}.</p>
            )}
            {current && (
              <p className="text-[11px] text-slate-400 mt-1">
                Current {currentName}: {formatBenchmarkValue(current)} · {current.dateIso}{isStale(current, todayIso) ? ' · due a retest' : ''} — this becomes the next point on its trend.
              </p>
            )}
          </div>

          <div>
            <label htmlFor="bm-protocol" className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">How did you test it? <span className="font-normal text-slate-400">(optional)</span></label>
            <input id="bm-protocol" type="text" value={protocol} onChange={e => setProtocol(e.target.value)} placeholder={PROTOCOL_HINT[kind] ?? 'e.g. race day, flat course'}
              className="w-full px-3 py-2.5 text-sm border border-slate-300 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-400" />
          </div>

          <div>
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">When</p>
            <div className="flex gap-1.5" role="radiogroup" aria-label="When was it measured">
              {([['today', 'Today'], ['last_week', 'Last week'], ['date', 'Pick a date']] as const).map(([v, l]) => (
                <button key={v} type="button" role="radio" aria-checked={when === v} onClick={() => setWhen(v)}
                  className={`flex-1 rounded-lg border px-2 py-2 text-sm font-semibold ${when === v ? 'border-teal-500 bg-teal-50 text-teal-800' : 'border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-400'}`}>{l}</button>
              ))}
            </div>
            {when === 'date' && (
              <input type="date" aria-label="Date measured" value={dateIso} max={todayIso} onChange={e => setDateIso(e.target.value || todayIso)}
                className="mt-2 w-full px-3 py-2.5 text-base border border-slate-300 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-900 dark:text-white" />
            )}
          </div>

          {result && (
            <div className={`rounded-lg px-3 py-2 ${result.caution ? 'bg-amber-50 dark:bg-amber-900/20' : 'bg-slate-50 dark:bg-slate-700/50'}`} data-testid="bm-preview">
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">{result.changesPlan ? 'What this changes' : 'What this does'}</p>
              {result.lines.map((l, i) => (
                <p key={i} className={`text-[11px] mt-0.5 ${result.caution ? 'text-amber-800 dark:text-amber-200' : 'text-slate-600 dark:text-slate-300'}`}>{l}</p>
              ))}
            </div>
          )}
        </div>

        <div className="px-4 pb-5 pt-1">
          <button
            type="button" disabled={!canSave}
            onClick={() => { if (candidate) { onSave(candidate); onClose() } }}
            className="w-full h-11 rounded-xl bg-teal-700 hover:bg-teal-800 disabled:opacity-50 text-white text-sm font-bold"
          >Save benchmark</button>
        </div>
      </div>
    </div>
  )
}
