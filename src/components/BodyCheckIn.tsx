import { useState } from 'react'
import type { SorenessLevel } from '../hooks/useSoreness'
import {
  SORENESS_OPTIONS, sorenessOption, checkInWindowLabel, nextCheckInLabel, fmtClock,
  type CheckInWindow, type DayCheckIns,
} from '../utils/checkInWindow'

/**
 * "How does your body feel right now?" — asked twice a day at most.
 *
 * The question is gated to two windows: the morning (until 10 AM), when the
 * answer can still change today's session, and the evening (from the
 * athlete's evening hour), when it records how the day landed. One answer
 * per window; answering again in the same window replaces it. Between the
 * windows the question is not asked and the morning answer stands.
 *
 * Two surfaces share this: a tile in the Verdict card's evidence grid
 * (the morning), and a row on the Evening Close (the evening).
 */
export interface BodyCheckInProps {
  /** The window open right now, or null between windows. */
  window: CheckInWindow | null
  checkIns: DayCheckIns
  onLog: (window: CheckInWindow, level: SorenessLevel) => void
  eveningHour?: number
  /** Injected by tests; defaults to the wall clock. */
  now?: Date
}

const QUESTION = 'How does your body feel right now?'

function Chips({
  window, selected, onPick, eveningHour,
}: { window: CheckInWindow; selected: SorenessLevel | null; onPick: (level: SorenessLevel) => void; eveningHour: number }) {
  return (
    <div data-testid="body-chips">
      <p className="text-xs font-bold text-slate-800 dark:text-white" data-testid="body-question">{QUESTION}</p>
      <p className="text-[10px] text-slate-400 mt-0.5">{checkInWindowLabel(window, eveningHour)}</p>
      <div className="flex gap-1.5 mt-2">
        {SORENESS_OPTIONS.map(opt => {
          const active = selected === opt.level
          return (
            <button
              key={opt.level}
              onClick={() => onPick(opt.level)}
              className={`flex-1 py-2 rounded-lg text-center transition-all ${
                active ? opt.activeBg : 'bg-slate-50 dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-700/60'
              }`}
              aria-pressed={active}
              data-testid={`body-chip-${opt.level}`}
            >
              <span className="text-lg block leading-none">{opt.emoji}</span>
              <span className={`text-[10px] font-medium block mt-1 ${active ? opt.color : 'text-slate-500 dark:text-slate-400'}`}>
                {opt.label}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function answerFor(checkIns: DayCheckIns, window: CheckInWindow): { level: SorenessLevel; at?: string } | null {
  const level = window === 'morning' ? checkIns.morning : checkIns.evening
  return level == null ? null : { level, at: window === 'morning' ? checkIns.morningAt : checkIns.eveningAt }
}

/**
 * The tile — one cell of the Verdict card's evidence grid, plus (when
 * open) a full-width chip row beneath the grid. Rendered as a fragment so
 * both sit inside the same grid.
 */
export function BodyCheckInTile({ window, checkIns, onLog, eveningHour = 18, now }: BodyCheckInProps) {
  const [open, setOpen] = useState(false)
  const current = window ? answerFor(checkIns, window) : null
  // Between windows the morning answer stands; nothing else is asked.
  const standing = current ?? (window == null ? answerFor(checkIns, 'morning') : null)
  const standingWindow: CheckInWindow | null = current ? window : standing ? 'morning' : null
  const askable = window != null

  let value: string
  let sub: string
  if (standing && standingWindow) {
    const opt = sorenessOption(standing.level)
    value = `${opt.emoji} ${opt.label}`
    sub = `${standingWindow} ${fmtClock(standing.at)}`.trim()
  } else if (askable) {
    value = 'Tap to log'
    sub = checkInWindowLabel(window!, eveningHour)
  } else {
    value = '—'
    sub = nextCheckInLabel(now ?? new Date(), eveningHour)
  }

  const pick = (level: SorenessLevel) => {
    if (!window) return
    onLog(window, level)
    setOpen(false)
  }

  return (
    <>
      <button
        onClick={() => askable && setOpen(o => !o)}
        disabled={!askable}
        aria-expanded={askable ? open : undefined}
        className={`rounded-lg px-2 py-1.5 text-left disabled:cursor-default ${
          askable && !standing
            ? 'border border-dashed border-teal-400 dark:border-teal-600 bg-teal-50/60 dark:bg-teal-950/30'
            : 'bg-slate-50 dark:bg-slate-900'
        }`}
        data-testid="body-tile"
        data-state={standing ? 'answered' : askable ? 'open' : 'closed'}
      >
        <p className="text-[11px] text-slate-400 leading-tight">Body</p>
        <p className={`text-xs font-bold mt-0.5 ${askable && !standing ? 'text-teal-700 dark:text-teal-300' : 'text-slate-700 dark:text-slate-200'}`}>
          {value}
        </p>
        <p className="text-[10px] text-slate-400 leading-tight mt-0.5">{sub}</p>
      </button>
      {open && window && (
        <div className="col-span-full mt-1" data-testid="body-tile-chips">
          <Chips window={window} selected={current?.level ?? null} onPick={pick} eveningHour={eveningHour} />
        </div>
      )}
    </>
  )
}

/**
 * The row — on the Evening Close. The evening question sits inline (the
 * close is the ritual, no tap gate needed), with the morning answer beside
 * it for context. Once answered it collapses to the receipt with a Change.
 */
export function BodyCheckInRow({ window, checkIns, onLog, eveningHour = 18, now }: BodyCheckInProps) {
  const [changing, setChanging] = useState(false)
  const morning = answerFor(checkIns, 'morning')
  const evening = answerFor(checkIns, 'evening')
  const askable = window === 'evening'
  const showChips = askable && (evening == null || changing)

  const receipt = (label: string, a: { level: SorenessLevel; at?: string }) => {
    const opt = sorenessOption(a.level)
    return (
      <span>
        <span className="text-slate-400">{label}</span>{' '}
        <span className="font-semibold text-slate-700 dark:text-slate-200">{opt.emoji} {opt.label}</span>
        {a.at && <span className="text-slate-400"> · {fmtClock(a.at)}</span>}
      </span>
    )
  }

  return (
    <div
      className="mt-3 rounded-xl border border-slate-100 dark:border-slate-700 px-3 py-2.5"
      data-testid="body-row"
      data-state={evening ? 'answered' : askable ? 'open' : 'closed'}
    >
      {showChips ? (
        <Chips
          window="evening"
          selected={evening?.level ?? null}
          onPick={level => { onLog('evening', level); setChanging(false) }}
          eveningHour={eveningHour}
        />
      ) : (
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] leading-snug">
            {evening ? receipt('Body this evening:', evening)
              : morning ? receipt('Body this morning:', morning)
              : <span className="text-slate-400">Body · {askable ? checkInWindowLabel('evening', eveningHour) : nextCheckInLabel(now ?? new Date(), eveningHour)}</span>}
          </p>
          {askable && evening && (
            <button
              onClick={() => setChanging(true)}
              className="text-[11px] font-semibold text-teal-700 dark:text-teal-300 shrink-0"
              data-testid="body-change"
            >
              Change
            </button>
          )}
        </div>
      )}
      {showChips && morning && (
        <p className="text-[10px] text-slate-400 mt-2" data-testid="body-morning-context">
          This morning: {sorenessOption(morning.level).emoji} {sorenessOption(morning.level).label}
          {morning.at ? ` · ${fmtClock(morning.at)}` : ''}
        </p>
      )}
    </div>
  )
}
