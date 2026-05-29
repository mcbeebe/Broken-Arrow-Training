import { useMemo, useState } from 'react'
import type {
  TrainingWeek,
  PlannedDay,
  ActualWorkout,
  HRZone,
  CoachSnapshot,
  PerformanceMetrics,
} from '../types'
import type { StrengthExperience } from '../hooks/useOnboarding'
import WorkoutModal from './WorkoutModal'

interface JournalEntry {
  day: PlannedDay
  weekNum: number
  /** ISO date (YYYY-MM-DD) used for sorting; falls back to '' when unknown. */
  sortKey: string
}

interface JournalProps {
  weeks: TrainingWeek[]
  athleteId: string
  coachEnabled?: boolean
  coachSnapshot?: CoachSnapshot | null
  zones?: HRZone[]
  latestPerf?: PerformanceMetrics | null
  strengthLevel?: StrengthExperience
  onAskCoach?: (seed: string) => void
  /** Share an edited journal note with the coach in the background. */
  onShareNote?: (day: PlannedDay, note: string) => void | Promise<void>
  manualLog?: {
    logWorkout: (dayLabel: string, data: ActualWorkout) => void
  }
}

function fmtDistance(mi?: number): string | null {
  if (!mi) return null
  return `${mi.toFixed(1)} mi`
}

function fmtDuration(sec?: number): string | null {
  if (!sec) return null
  if (sec >= 3600) {
    const h = Math.floor(sec / 3600)
    const m = Math.round((sec % 3600) / 60)
    return `${h}:${String(m).padStart(2, '0')}`
  }
  return `${Math.round(sec / 60)} min`
}

/**
 * Workout journal — a reverse-chronological feed of every session the
 * athlete has reflected on (workouts with a saved note). Their own words
 * lead; the workout's headline numbers sit underneath as context. Tapping a
 * card opens the full workout, where the note stays editable and the coach's
 * take references it.
 *
 * This is the home for "where did my reflections go?" — the one place that
 * shows the athlete's training story in their own voice over time.
 */
export default function Journal({
  weeks,
  athleteId,
  coachEnabled,
  coachSnapshot,
  zones,
  latestPerf,
  strengthLevel,
  onAskCoach,
  onShareNote,
  manualLog,
}: JournalProps) {
  const [selected, setSelected] = useState<{ day: PlannedDay; weekNum: number } | null>(null)

  const entries = useMemo<JournalEntry[]>(() => {
    const out: JournalEntry[] = []
    for (const week of weeks) {
      for (const day of week.days) {
        if (day.actual?.notes?.trim()) {
          out.push({
            day,
            weekNum: week.num,
            sortKey: day.actual.startDate?.slice(0, 10) || '',
          })
        }
      }
    }
    // Most recent reflection first. Entries without a date sort to the bottom.
    return out.sort((a, b) => b.sortKey.localeCompare(a.sortKey))
  }, [weeks])

  return (
    <div className="max-w-2xl mx-auto px-4 py-4 space-y-3">
      <div className="px-1">
        <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">📓 Training journal</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          {entries.length > 0
            ? `${entries.length} ${entries.length === 1 ? 'reflection' : 'reflections'} — your training story, in your words.`
            : 'Your reflections will collect here.'}
        </p>
      </div>

      {entries.length === 0 ? (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-8 text-center space-y-2">
          <p className="text-3xl">✍️</p>
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            No reflections yet
          </p>
          <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
            Open a completed workout and jot down how it went in the journal box.
            Your notes land here — and your coach reads every one.
          </p>
        </div>
      ) : (
        entries.map(entry => {
          const a = entry.day.actual!
          const stats = [
            fmtDistance(a.distance),
            fmtDuration(a.movingTime),
            a.avgHR ? `${a.avgHR} bpm` : null,
            a.rpe ? `RPE ${a.rpe}` : null,
          ].filter(Boolean)
          return (
            <button
              key={`${entry.weekNum}-${entry.day.day}`}
              type="button"
              onClick={() => setSelected({ day: entry.day, weekNum: entry.weekNum })}
              className="w-full text-left bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3.5 space-y-2 hover:border-amber-300 dark:hover:border-amber-700/60 transition-colors"
            >
              <div className="flex items-baseline justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">
                    {entry.day.workout}
                  </p>
                  <p className="text-xs text-slate-400 dark:text-slate-500">
                    {entry.day.day} · Wk {entry.weekNum}
                  </p>
                </div>
                <span className="text-slate-300 dark:text-slate-600 text-sm shrink-0">›</span>
              </div>

              <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed whitespace-pre-wrap">
                {a.notes!.trim()}
              </p>

              {stats.length > 0 && (
                <p className="text-xs text-slate-400 dark:text-slate-500">
                  {stats.join(' · ')}
                </p>
              )}
            </button>
          )
        })
      )}

      {selected && (
        <WorkoutModal
          day={selected.day}
          weekNum={selected.weekNum}
          onClose={() => setSelected(null)}
          zones={zones || []}
          weeks={weeks}
          latestPerf={latestPerf}
          coachSnapshot={coachSnapshot ?? undefined}
          athleteId={athleteId}
          coachEnabled={coachEnabled}
          strengthLevel={strengthLevel}
          onAskCoach={onAskCoach}
          onSaveNote={manualLog && selected.day.actual ? async (note) => {
            manualLog.logWorkout(selected.day.day, { ...selected.day.actual!, notes: note })
            await onShareNote?.(selected.day, note)
          } : undefined}
        />
      )}
    </div>
  )
}
