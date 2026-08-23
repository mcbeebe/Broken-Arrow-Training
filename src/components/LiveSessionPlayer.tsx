import { useMemo } from 'react'
import type { ActualWorkout, PlannedDay, TrainingWeek } from '../types'
import { useLiveSession } from '../hooks/useLiveSession'
import { restRemainingSec, elapsedSec, segmentElapsedSec, type LiveSessionState } from '../utils/liveSession'
import { isGymBasedDay } from '../utils/matching'
import { ghostFillFromHistory, parsePlanExercises, progressionFromWeeks, lastSessionSummary, type StrengthCalibration } from '../utils/strengthDraft'
import { normalizeExerciseName, suggestNextTarget, parseWeightLb } from '../utils/strengthProgression'
import { getExerciseGuide } from '../utils/exercises'

/**
 * The live-session player — Phase 2 of the strength-logging overhaul
 * (design screens 5–7). Full-screen, one exercise at a time, one smart
 * action button whose label is always the next step. All timing renders
 * from the engine's timestamps; this component owns zero clocks.
 *
 * Four faces, keyed off the engine phase:
 *   preview  (no session yet)  → the day's drafted exercises + Start
 *   exercise                   → current set with inline steppers
 *   rest                       → dark screen, ring countdown, +30s/skip
 *   finished                   → summary + Save / Discard
 */

export interface LiveSessionPlayerProps {
  /** The day being trained — used for the preview draft. When a killed
   *  session's draft exists it wins, whatever day it belonged to. */
  planned?: PlannedDay
  dayLabel: string
  dayIso?: string
  athleteId?: string
  allWeeks?: TrainingWeek[]
  calibration?: StrengthCalibration
  onSave: (workout: ActualWorkout, meta: { dayLabel: string; dayIso?: string }) => void
  onClose: () => void
}

function mmss(totalSec: number): string {
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function stepWeight(weight: string, deltaLb: number): string {
  const n = parseWeightLb(weight)
  const next = Math.max(0, Math.round((n + deltaLb) * 10) / 10)
  if (next === 0) return 'BW'
  return `${next} lb`
}

export default function LiveSessionPlayer({
  planned, dayLabel, dayIso, athleteId, allWeeks, calibration, onSave, onClose,
}: LiveSessionPlayerProps) {
  const progression = useMemo(() => progressionFromWeeks(allWeeks), [allWeeks])
  const session = useLiveSession(athleteId)
  const s = session.state

  const drafted = useMemo(
    () => (planned?.detail ? ghostFillFromHistory(parsePlanExercises(planned.detail), progression, calibration) : []),
    [planned, progression, calibration],
  )

  // ── Preview (screen 5) ─────────────────────────────────────
  if (!s) {
    return (
      <div className="fixed inset-0 z-50 bg-slate-50 dark:bg-slate-900 flex flex-col">
        <div className="px-4 pt-6 pb-3 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <h3 className="font-bold text-slate-800 dark:text-white">Start workout — {dayLabel}</h3>
          <button onClick={onClose} className="text-sm font-medium text-slate-500">Close</button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
          {drafted.length === 0 && (
            <p className="text-sm text-slate-500">Nothing prescribed for this day — open the log editor instead.</p>
          )}
          {drafted.map((ex, i) => {
            const prog = progression.get(normalizeExerciseName(ex.name))
            const target = prog
              ? suggestNextTarget(prog, Math.max(ex.sets.length, 1), ex.sets[0]?.reps || 10)
              : null
            return (
              <div key={i} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-3 flex items-center gap-3">
                <span className="font-mono text-xs font-bold text-slate-400 w-4">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 truncate">{ex.name}</p>
                  <p className="font-mono text-[11px] text-slate-400">
                    {ex.sets.length} × {ex.sets[0]?.reps ?? '—'}
                    {lastSessionSummary(prog) ? ` · last: ${lastSessionSummary(prog)}` : ''}
                  </p>
                </div>
                {target && target.tier === 'progress' && (
                  <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-[10px] font-bold text-emerald-600 shrink-0">
                    {target.weightLb > 0 ? `${target.weightLb} lb` : `+reps`}
                  </span>
                )}
              </div>
            )
          })}
        </div>
        <div className="px-4 pb-8 pt-3 space-y-2.5">
          <button
            onClick={() => session.start(drafted, {
              dayLabel,
              dayIso,
              // Station circuits play round-by-round; everything else is
              // straight sets.
              traversal: planned && planned.type === 'cross' && isGymBasedDay(planned) ? 'round' : 'exercise',
            })}
            disabled={drafted.length === 0}
            className="w-full h-[52px] rounded-2xl bg-purple-600 hover:bg-purple-700 disabled:opacity-40 text-white font-bold text-[15px] flex items-center justify-center gap-2"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20" /></svg>
            Start workout
          </button>
          <button onClick={onClose} className="w-full text-center text-[13px] font-medium text-slate-500">
            or log it afterwards
          </button>
        </div>
      </div>
    )
  }

  const now = session.nowMs

  // ── Finished (summary) ─────────────────────────────────────
  if (s.phase === 'finished') {
    const total = s.exercises.reduce((n, ex) => n + ex.sets.length, 0)
    const done = s.exercises.reduce((n, ex) => n + ex.sets.filter(x => x.done !== false).length, 0)
    return (
      <div className="fixed inset-0 z-50 bg-slate-50 dark:bg-slate-900 flex flex-col">
        <div className="px-4 pt-6 pb-3 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
          <h3 className="font-bold text-slate-800 dark:text-white">Session done — {s.dayLabel}</h3>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-center">
              <p className="font-mono text-2xl font-bold text-teal-700">{mmss(elapsedSec(s, now))}</p>
              <p className="text-[11px] text-slate-500">duration</p>
            </div>
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-center">
              <p className="font-mono text-2xl font-bold text-purple-700">{done}/{total}</p>
              <p className="text-[11px] text-slate-500">sets completed</p>
            </div>
          </div>
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-1 divide-y divide-slate-100 dark:divide-slate-700">
            {s.exercises.map((ex, i) => (
              <div key={i} className="py-2.5 flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">{ex.name}</p>
                <p className="font-mono text-xs text-slate-500 shrink-0">
                  {ex.sets.filter(x => x.done !== false).length}/{ex.sets.length} sets
                </p>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-slate-400 px-1">
            Saving writes an ordinary log — your watch's recording merges in on the next sync.
          </p>
        </div>
        <div className="px-4 pb-8 pt-3 space-y-2.5">
          <button
            onClick={() => {
              const meta = { dayLabel: s.dayLabel, dayIso: s.dayIso }
              const w = session.finish()
              if (w) onSave(w, meta)
              onClose()
            }}
            className="w-full h-[52px] rounded-2xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-[15px]"
          >
            Save workout
          </button>
          <button
            onClick={() => { session.discard(); onClose() }}
            className="w-full text-center text-[13px] font-medium text-slate-400"
          >
            Discard session
          </button>
        </div>
      </div>
    )
  }

  // ── Rest (screen 7) ────────────────────────────────────────
  if (s.phase === 'rest') {
    return <RestScreen s={s} now={now} session={session} />
  }

  // ── Circuit (screen 8) — round-major station flow ──────────
  if (s.traversal === 'round') {
    return <CircuitFace s={s} now={now} session={session} />
  }

  // ── Exercise (screen 6) ────────────────────────────────────
  const { exIdx, setIdx } = s.cursor
  const ex = s.exercises[exIdx]
  const set = ex?.sets[setIdx]
  if (!ex || !set) {
    // Defensive: a malformed draft lands here — end cleanly.
    session.end()
    return null
  }
  const guide = getExerciseGuide(ex.name)
  const nextEx = s.exercises[exIdx + 1]
  const paused = s.pausedAt != null

  return (
    <div className="fixed inset-0 z-50 bg-white dark:bg-slate-900 flex flex-col">
      {/* Top bar */}
      <div className="px-4 pt-5 pb-3 border-b border-slate-200 dark:border-slate-700 space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${paused ? 'bg-amber-400' : 'bg-red-500'}`} />
            <span className="font-mono text-sm font-bold text-slate-800 dark:text-white">{mmss(elapsedSec(s, now))}</span>
            <span className="text-xs text-slate-400">elapsed</span>
          </div>
          <span className="text-[13px] font-semibold text-slate-500">Exercise {exIdx + 1} of {s.exercises.length}</span>
          <div className="flex items-center gap-3">
            <button
              onClick={() => (paused ? session.resume() : session.pause())}
              className="text-[13px] font-medium text-slate-400"
            >
              {paused ? 'Resume' : 'Pause'}
            </button>
            <button onClick={() => session.end()} className="text-[13px] font-medium text-slate-400">End</button>
          </div>
        </div>
        <div className="flex gap-1">
          {s.exercises.map((_, i) => (
            <span
              key={i}
              className={`flex-1 h-1 rounded-full ${i < exIdx ? 'bg-teal-600' : i === exIdx ? 'bg-purple-600' : 'bg-slate-200 dark:bg-slate-700'}`}
            />
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3.5">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wide text-purple-700">Now</p>
          <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white leading-tight">{ex.name}</h2>
          <p className="font-mono text-sm text-slate-500 mt-0.5">
            {ex.sets.length} sets{lastSessionSummary(progression.get(normalizeExerciseName(ex.name))) ? ` · last: ${lastSessionSummary(progression.get(normalizeExerciseName(ex.name)))}` : ''}
          </p>
        </div>

        {guide?.form?.[0] && (
          <div className="bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl px-3 py-2.5">
            <p className="text-xs text-slate-500 dark:text-slate-300 leading-relaxed"><span className="font-semibold text-slate-600 dark:text-slate-200">Cue:</span> {guide.form[0]}</p>
          </div>
        )}

        <div className="space-y-2">
          {ex.sets.map((row, i) => {
            const isDone = row.done !== false && i !== setIdx
            const isCurrent = i === setIdx
            if (isCurrent) {
              return (
                <div key={i} className="border-2 border-purple-600 rounded-2xl p-3.5 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] font-bold text-purple-700">Set {i + 1}</span>
                    <button onClick={() => session.skipSet()} className="text-[11px] font-medium text-slate-400">skip set</button>
                  </div>
                  <div className="flex gap-2.5">
                    <Stepper
                      label={row.weight === 'BW' || row.weight === '' ? 'BW' : row.weight.replace(/\s*lb\s*$/i, '')}
                      unit={row.weight === 'BW' || row.weight === '' ? '' : 'lb'}
                      onMinus={() => session.editSet(exIdx, i, { weight: stepWeight(row.weight, -2.5) })}
                      onPlus={() => session.editSet(exIdx, i, { weight: stepWeight(row.weight, 2.5) })}
                    />
                    <Stepper
                      label={String(row.reps || 0)}
                      unit="reps"
                      onMinus={() => session.editSet(exIdx, i, { reps: Math.max(0, (row.reps || 0) - 1) })}
                      onPlus={() => session.editSet(exIdx, i, { reps: (row.reps || 0) + 1 })}
                    />
                  </div>
                </div>
              )
            }
            return (
              <div
                key={i}
                className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 border ${
                  isDone ? 'bg-teal-50 border-teal-200' : 'border-slate-100 dark:border-slate-700'
                }`}
              >
                <span className={`w-[26px] h-[26px] rounded-lg flex items-center justify-center shrink-0 ${isDone ? 'bg-teal-600' : 'border-2 border-slate-200'}`}>
                  {isDone && (
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                  )}
                </span>
                <span className={`flex-1 text-[13px] font-medium ${isDone ? 'text-teal-800' : 'text-slate-400'}`}>Set {i + 1}</span>
                <span className={`font-mono text-sm ${isDone ? 'font-semibold text-teal-900' : 'text-slate-300'}`}>
                  {row.weight || 'BW'} × {row.reps || 0}
                </span>
              </div>
            )
          })}
        </div>

        {nextEx && (
          <p className="text-[13px] text-slate-500">
            <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mr-2">Next</span>
            {nextEx.name} · {nextEx.sets.length} sets
          </p>
        )}
      </div>

      <div className="px-4 pb-8 pt-3 border-t border-slate-200 dark:border-slate-700">
        <button
          onClick={() => session.logSet()}
          disabled={paused}
          className="w-full h-14 rounded-2xl bg-purple-600 hover:bg-purple-700 disabled:opacity-40 text-white font-bold text-[15px] flex items-center justify-center gap-2"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
          Log set {setIdx + 1}{isFinalSet(s) ? ' · finish' : ' · start rest'}
        </button>
      </div>
    </div>
  )
}

function isFinalSet(s: LiveSessionState): boolean {
  const ex = s.exercises[s.cursor.exIdx]
  const lastSetHere = !ex || s.cursor.setIdx + 1 >= ex.sets.length
  const lastExercise = s.cursor.exIdx + 1 >= s.exercises.length
  return lastSetHere && lastExercise
}

function Stepper({ label, unit, onMinus, onPlus }: {
  label: string; unit: string; onMinus: () => void; onPlus: () => void
}) {
  return (
    <div className="flex-1 flex items-center justify-between bg-purple-50 dark:bg-slate-800 rounded-xl px-2 py-1.5">
      <button onClick={onMinus} aria-label={`minus ${unit || 'weight'}`} className="w-11 h-11 rounded-lg bg-white dark:bg-slate-700 border border-purple-100 dark:border-slate-600 flex items-center justify-center">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#7e22ce" strokeWidth="2.4" strokeLinecap="round"><line x1="5" y1="12" x2="19" y2="12" /></svg>
      </button>
      <div className="text-center px-1">
        <p className="font-mono text-lg font-bold text-slate-900 dark:text-white leading-tight">{label}</p>
        {unit && <p className="text-[10px] text-slate-400 leading-none">{unit}</p>}
      </div>
      <button onClick={onPlus} aria-label={`plus ${unit || 'weight'}`} className="w-11 h-11 rounded-lg bg-white dark:bg-slate-700 border border-purple-100 dark:border-slate-600 flex items-center justify-center">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#7e22ce" strokeWidth="2.4" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
      </button>
    </div>
  )
}

function RestScreen({ s, now, session }: {
  s: LiveSessionState
  now: number
  session: ReturnType<typeof useLiveSession>
}) {
  const remaining = restRemainingSec(s, now)
  const planned = s.restPlannedSec ?? 60
  const C = 615.75 // 2π × r98
  const frac = planned > 0 ? remaining / planned : 0
  const { exIdx, setIdx } = s.cursor
  const justLogged = s.exercises[exIdx]?.sets[setIdx]
  const upcoming = (() => {
    const ex = s.exercises[exIdx]
    if (ex && setIdx + 1 < ex.sets.length) return { label: `Set ${setIdx + 2} of ${ex.sets.length} — ${ex.name}` }
    const next = s.exercises[exIdx + 1]
    return next ? { label: `${next.name} — set 1 of ${next.sets.length}` } : null
  })()

  return (
    <div className="fixed inset-0 z-50 bg-slate-900 text-slate-50 flex flex-col">
      <div className="px-4 pt-5 pb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-red-500" />
          <span className="font-mono text-sm font-bold">{mmss(elapsedSec(s, now))}</span>
          <span className="text-xs text-slate-500">elapsed</span>
        </div>
        <button onClick={() => session.end()} className="text-[13px] font-medium text-slate-400">End session</button>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center gap-6 px-4">
        <p className="text-[13px] font-bold uppercase tracking-widest text-teal-300">Rest</p>
        <div className="relative w-[220px] h-[220px]">
          <svg width="220" height="220" viewBox="0 0 220 220">
            <circle cx="110" cy="110" r="98" fill="none" stroke="#1e293b" strokeWidth="10" />
            <circle
              cx="110" cy="110" r="98" fill="none" stroke="#2dd4bf" strokeWidth="10" strokeLinecap="round"
              strokeDasharray={C} strokeDashoffset={C * (1 - frac)} transform="rotate(-90 110 110)"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <p className="font-mono text-5xl font-extrabold">{mmss(remaining)}</p>
            <p className="font-mono text-[13px] text-slate-500">of {mmss(planned)}</p>
          </div>
        </div>
        <div className="flex gap-3">
          <button onClick={() => session.addRest(30)} className="h-12 px-6 rounded-xl border border-slate-600 font-mono text-sm font-semibold text-slate-200">
            +30s
          </button>
          <button onClick={() => session.nextSet()} className="h-12 px-6 rounded-xl bg-teal-900 text-sm font-semibold text-teal-300">
            Skip rest
          </button>
        </div>
        {justLogged && (
          <div className="flex items-center gap-2 bg-teal-950 border border-teal-800 rounded-full px-4 py-2">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#2dd4bf" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
            <span className="font-mono text-xs text-teal-200">
              Set {setIdx + 1} logged — {justLogged.weight || 'BW'} × {justLogged.reps}
            </span>
          </div>
        )}
      </div>

      {upcoming && (
        <div className="px-4 pb-3">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl px-3.5 py-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Up next</p>
            <p className="text-[15px] font-bold text-slate-100 mt-0.5">{upcoming.label}</p>
          </div>
        </div>
      )}

      <div className="px-4 pb-8">
        <button
          onClick={() => session.nextSet()}
          className="w-full h-14 rounded-2xl bg-teal-400 text-teal-950 font-bold text-[15px] flex items-center justify-center gap-2"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20" /></svg>
          {remaining === 0 ? 'Start next set' : 'Start early'}
        </button>
      </div>
    </div>
  )
}

function stationRxLine(set: { reps: number; weight: string } | undefined): string {
  if (!set) return ''
  const parts: string[] = []
  if (set.reps > 1) parts.push(`\u00d7${set.reps}`)
  if (set.weight && set.weight !== 'BW') parts.push(set.weight)
  return parts.join(' \u00b7 ')
}

function CircuitFace({ s, now, session }: {
  s: LiveSessionState
  now: number
  session: ReturnType<typeof useLiveSession>
}) {
  const round = s.cursor.setIdx
  const maxRounds = s.exercises.reduce((m, ex) => Math.max(m, ex.sets.length), 0)
  const stationsThisRound = s.exercises
    .map((ex, exIdx) => ({ ex, exIdx }))
    .filter(({ ex }) => ex.sets.length > round)
  const current = s.exercises[s.cursor.exIdx]
  const prevSplit = round > 0 ? current?.sets[round - 1]?.timeSec : undefined
  const paused = s.pausedAt != null
  const next = (() => {
    const after = stationsThisRound.find(({ exIdx }) => exIdx > s.cursor.exIdx)
    if (after) return after.ex.name
    const nextRound = s.exercises.find(ex => ex.sets.length > round + 1)
    return nextRound ? `round ${round + 2}` : 'finish'
  })()

  return (
    <div className="fixed inset-0 z-50 bg-white dark:bg-slate-900 flex flex-col">
      <div className="px-4 pt-5 pb-3 border-b border-slate-200 dark:border-slate-700 space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${paused ? 'bg-amber-400' : 'bg-red-500'}`} />
            <span className="font-mono text-sm font-bold text-slate-800 dark:text-white">{mmss(elapsedSec(s, now))}</span>
            <span className="text-xs text-slate-400">total</span>
          </div>
          <p className="text-base font-extrabold text-slate-900 dark:text-white">Station circuit</p>
          <div className="flex items-center gap-3">
            <button onClick={() => (paused ? session.resume() : session.pause())} className="text-[13px] font-medium text-slate-400">
              {paused ? 'Resume' : 'Pause'}
            </button>
            <button onClick={() => session.end()} className="text-[13px] font-medium text-slate-400">End</button>
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <span className="text-xs font-bold uppercase tracking-wide text-purple-700">Round {round + 1} of {maxRounds}</span>
          <div className="flex-1 flex gap-1">
            {Array.from({ length: maxRounds }, (_, r) => (
              <span key={r} className={`flex-1 h-1.5 rounded-full ${r < round ? 'bg-teal-600' : r === round ? 'bg-purple-600' : 'bg-slate-200 dark:bg-slate-700'}`} />
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3.5 space-y-2">
        {stationsThisRound.map(({ ex, exIdx }) => {
          const set = ex.sets[round]
          if (exIdx === s.cursor.exIdx) {
            return (
              <div key={exIdx} className="border-2 border-purple-600 rounded-2xl p-4 space-y-1.5">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-purple-700">
                    Now · station {stationsThisRound.findIndex(x => x.exIdx === exIdx) + 1} of {stationsThisRound.length}
                  </p>
                  <button onClick={() => session.skipSet()} className="text-[11px] font-medium text-slate-400">skip</button>
                </div>
                <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white leading-tight">{ex.name}</h2>
                {stationRxLine(set) && (
                  <p className="font-mono text-[13px] text-slate-500">{stationRxLine(set)}</p>
                )}
                <div className="flex items-baseline gap-2.5">
                  <p className="font-mono text-4xl font-extrabold text-purple-600">{mmss(segmentElapsedSec(s, now))}</p>
                  {prevSplit != null && (
                    <p className="font-mono text-[13px] text-slate-400">round {round} was {mmss(prevSplit)}</p>
                  )}
                </div>
              </div>
            )
          }
          const isDone = set?.done !== false && set?.done !== undefined
          return (
            <div
              key={exIdx}
              className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 border ${
                isDone ? 'bg-teal-50 border-teal-200' : 'border-slate-100 dark:border-slate-700'
              }`}
            >
              <span className={`w-[26px] h-[26px] rounded-lg flex items-center justify-center shrink-0 ${isDone ? 'bg-teal-600' : 'border-2 border-slate-200'}`}>
                {isDone && (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                )}
              </span>
              <span className={`flex-1 text-sm font-medium ${isDone ? 'text-teal-800' : 'text-slate-400'}`}>
                {ex.name}
                {stationRxLine(set) && <span className="font-mono text-[11px] text-slate-400 ml-1.5">{stationRxLine(set)}</span>}
              </span>
              {isDone && set?.timeSec != null && (
                <span className="font-mono text-sm font-bold text-teal-900">{mmss(set.timeSec)}</span>
              )}
            </div>
          )
        })}
        <p className="text-[11px] text-slate-400 pt-1">Splits recorded per station — lap presses on your watch merge in on sync.</p>
      </div>

      <div className="px-4 pb-8 pt-3 border-t border-slate-200 dark:border-slate-700">
        <button
          onClick={() => session.logSet()}
          disabled={paused}
          className="w-full h-14 rounded-2xl bg-purple-600 hover:bg-purple-700 disabled:opacity-40 text-white font-bold text-[15px] flex items-center justify-center gap-2"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
          Station done · next: {next}
        </button>
      </div>
    </div>
  )
}
