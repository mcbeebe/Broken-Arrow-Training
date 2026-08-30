/**
 * Travel mode — the plan-view home for a declared trip.
 *
 * The audit's highest-severity finding: onboarding collects "Travel,
 * blackout dates" and then throws it away, so a known trip rots into
 * "Missed?" chips. This panel finally reads that note (as a prompt, never
 * an auto-action), lets the athlete declare a date range + what kit they'll
 * have, and hands the rebalance to the same undoable op-log a coach
 * proposal rides on — one tap to adapt, one tap to undo.
 *
 * The engine (buildTravelBatch) is pure and tested; this component only
 * collects the declaration, previews the count, and calls back.
 */
import { useState } from 'react'
import type { TrainingWeek } from '../types'
import {
  buildTravelBatch,
  activeTravelWindows,
  TRAVEL_KIT_LABELS,
  type TravelKit,
  type TravelDeclaration,
  type TravelWindow,
} from '../engines/planGenerator/travelMode'
import { mentionsTravel, parseTravelNote } from '../utils/travelNote'

interface Props {
  /** The weeks currently shown — the preview and the batch adapt what the
   *  athlete actually has in front of them. */
  weeks: TrainingWeek[]
  /** config.scheduleConstraintsNote — the discovery prompt + prefill source. */
  note?: string
  windows: TravelWindow[]
  todayIso: string
  onActivate: (decl: TravelDeclaration) => void
  onDeactivate: (window: TravelWindow) => void
}

const KITS: TravelKit[] = ['full', 'run', 'bodyweight', 'rest']

function fmtRange(startIso: string, endIso: string): string {
  const f = (iso: string) => {
    const d = new Date(`${iso}T12:00:00`)
    return `${d.getMonth() + 1}/${d.getDate()}`
  }
  return `${f(startIso)}–${f(endIso)}`
}

export default function TravelModePanel({ weeks, note, windows, todayIso, onActivate, onDeactivate }: Props) {
  const active = activeTravelWindows(windows, todayIso)
  const prefill = parseTravelNote(note, todayIso)
  const noteHint = active.length === 0 && mentionsTravel(note)

  const [open, setOpen] = useState(false)
  const [start, setStart] = useState(prefill.startIso ?? '')
  const [end, setEnd] = useState(prefill.endIso ?? '')
  const [kit, setKit] = useState<TravelKit>(prefill.kit ?? 'run')

  const valid = !!start && !!end && start <= end
  const preview = valid ? buildTravelBatch(weeks, { startIso: start, endIso: end, kit }) : null

  return (
    <div className="mb-3" data-testid="travel-panel">
      {/* Active trips — the "travel mode on · Undo" strip. */}
      {active.map(w => (
        <div
          key={w.id}
          className="mb-2 rounded-xl px-3.5 py-2.5 bg-teal-50 dark:bg-teal-900/30 border border-teal-200 dark:border-teal-800 flex items-center justify-between gap-3"
          data-testid="travel-active"
        >
          <div className="min-w-0">
            <p className="text-xs font-bold text-teal-800 dark:text-teal-200">✈️ Travel mode · {fmtRange(w.startIso, w.endIso)}</p>
            <p className="text-[11px] text-teal-700 dark:text-teal-300 truncate">{w.summary}</p>
          </div>
          <button
            onClick={() => onDeactivate(w)}
            className="shrink-0 text-[11px] font-semibold text-teal-700 dark:text-teal-300 underline underline-offset-2"
            data-testid="travel-undo"
          >
            Undo
          </button>
        </div>
      ))}

      {/* Discovery prompt from the onboarding note. */}
      {noteHint && !open && (
        <button
          onClick={() => setOpen(true)}
          className="w-full text-left rounded-xl px-3.5 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm"
          data-testid="travel-note-hint"
        >
          <span className="text-xs text-slate-600 dark:text-slate-300">
            <span className="font-bold text-slate-700 dark:text-slate-200">✈️ You mentioned travel in onboarding.</span>{' '}
            Set it up so the plan adapts around it? ›
          </span>
        </button>
      )}

      {/* Always-available subtle entry point (when there's no note hint). */}
      {!noteHint && !open && (
        <button
          onClick={() => setOpen(true)}
          className="w-full text-left rounded-xl px-3.5 py-2 text-[11px] text-slate-500 dark:text-slate-400 border border-dashed border-slate-200 dark:border-slate-700"
          data-testid="travel-open"
        >
          ✈️ Travelling soon? Adapt your plan around a trip ›
        </button>
      )}

      {/* The declaration form. */}
      {open && (
        <div className="rounded-xl px-3.5 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm" data-testid="travel-form">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-bold text-slate-700 dark:text-slate-200">Adapt your plan for a trip</p>
            <button onClick={() => setOpen(false)} className="text-sm text-slate-400" data-testid="travel-close" aria-label="Close">⌃</button>
          </div>

          <div className="flex gap-2 mb-3">
            <label className="flex-1 text-[11px] text-slate-500 dark:text-slate-400">
              First day away
              <input
                type="date"
                value={start}
                onChange={e => setStart(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-2 py-1.5 text-xs text-slate-800 dark:text-slate-100"
                data-testid="travel-start"
              />
            </label>
            <label className="flex-1 text-[11px] text-slate-500 dark:text-slate-400">
              Last day away
              <input
                type="date"
                value={end}
                onChange={e => setEnd(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-2 py-1.5 text-xs text-slate-800 dark:text-slate-100"
                data-testid="travel-end"
              />
            </label>
          </div>

          <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1.5">What will you have?</p>
          <div className="grid grid-cols-2 gap-1.5 mb-3">
            {KITS.map(k => (
              <button
                key={k}
                onClick={() => setKit(k)}
                className={
                  'rounded-lg px-2 py-1.5 text-[11px] font-semibold border text-left ' +
                  (kit === k
                    ? 'bg-teal-600 text-white border-teal-600'
                    : 'bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-600')
                }
                data-testid={`travel-kit-${k}`}
                aria-pressed={kit === k}
              >
                {TRAVEL_KIT_LABELS[k]}
              </button>
            ))}
          </div>

          {preview && (
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-2" data-testid="travel-preview">
              {preview.summary}
            </p>
          )}

          <button
            disabled={!valid || (preview?.affectedDays ?? 0) === 0}
            onClick={() => {
              onActivate({ startIso: start, endIso: end, kit })
              setOpen(false)
            }}
            className={
              'w-full rounded-lg px-3 py-2 text-xs font-bold ' +
              (valid && (preview?.affectedDays ?? 0) > 0
                ? 'bg-teal-600 text-white'
                : 'bg-slate-200 dark:bg-slate-700 text-slate-400 dark:text-slate-500')
            }
            data-testid="travel-activate"
          >
            Adapt my plan
          </button>
        </div>
      )}
    </div>
  )
}
