import { useMemo, useState } from 'react'
import type {
  TrainingWeek,
  PlannedDay,
  ActualWorkout,
  HRZone,
  CoachSnapshot,
  PerformanceMetrics,
  JournalNote,
} from '../types'
import type { StrengthExperience } from '../hooks/useOnboarding'
import type { JournalNotesApi } from '../hooks/useJournalNotes'
import WorkoutModal from './WorkoutModal'
import JournalEntryModal from './JournalEntryModal'

/** One row in the journal feed — either a reflection saved on a workout, or a
 *  free-standing entry written from the "+ New entry" button. */
type FeedItem =
  | { kind: 'workout'; day: PlannedDay; weekNum: number; sortKey: string; tieKey: string }
  | { kind: 'note'; note: JournalNote; sortKey: string; tieKey: string }

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
  /** Free-standing journal entries (create/edit/delete + the visible list). */
  journalNotes?: JournalNotesApi
  /** Share a newly-created free-standing entry with the coach in the background. */
  onShareEntry?: (note: JournalNote) => void | Promise<void>
}

const MOOD_EMOJI: Record<number, string> = { 1: '😖', 2: '😕', 3: '😐', 4: '🙂', 5: '😄' }
const MOOD_LABEL: Record<number, string> = { 1: 'Rough', 2: 'Low', 3: 'OK', 4: 'Good', 5: 'Great' }

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

/** "Fri, Jun 27" for a standalone entry's date header. */
function fmtNoteDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

/**
 * Workout journal — a reverse-chronological feed of the athlete's reflections.
 * Two sources flow into one story: notes saved on a completed workout, and
 * free-standing entries written straight from this page (rest-day thoughts,
 * mood, sleep, pre-race nerves) via "+ New entry". Their own words lead;
 * workout numbers sit underneath as context. Tapping a workout card opens the
 * full session; tapping a standalone entry reopens it to edit.
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
  journalNotes,
  onShareEntry,
}: JournalProps) {
  const [selected, setSelected] = useState<{ day: PlannedDay; weekNum: number } | null>(null)
  const [composer, setComposer] = useState<{ mode: 'new' } | { mode: 'edit'; note: JournalNote } | null>(null)

  const standaloneNotes = journalNotes?.notes
  const feed = useMemo<FeedItem[]>(() => {
    const out: FeedItem[] = []
    for (const week of weeks) {
      for (const day of week.days) {
        if (day.actual?.notes?.trim()) {
          const iso = day.actual.startDate || ''
          out.push({
            kind: 'workout',
            day,
            weekNum: week.num,
            sortKey: iso.slice(0, 10),
            tieKey: iso,
          })
        }
      }
    }
    for (const note of standaloneNotes ?? []) {
      out.push({
        kind: 'note',
        note,
        sortKey: (note.dateISO || '').slice(0, 10),
        tieKey: note.createdAt || note.dateISO || '',
      })
    }
    // Most recent first; same-day ties fall back to the finer timestamp.
    // Entries without a date sort to the bottom.
    return out.sort((a, b) => {
      const byDate = b.sortKey.localeCompare(a.sortKey)
      return byDate !== 0 ? byDate : b.tieKey.localeCompare(a.tieKey)
    })
  }, [weeks, standaloneNotes])

  const summary =
    feed.length > 0
      ? `${feed.length} ${feed.length === 1 ? 'reflection' : 'reflections'} — your training story, in your words.`
      : 'Your reflections will collect here.'

  return (
    <div className="max-w-2xl mx-auto px-4 py-4 space-y-3">
      <div className="px-1 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">📓 Training journal</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{summary}</p>
        </div>
        {journalNotes && (
          <button
            type="button"
            onClick={() => setComposer({ mode: 'new' })}
            className="shrink-0 inline-flex items-center gap-1 text-sm font-semibold px-3 py-1.5 rounded-full bg-amber-600 text-white hover:bg-amber-700 transition-colors"
          >
            <span className="text-base leading-none">+</span> New entry
          </button>
        )}
      </div>

      {feed.length === 0 ? (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-8 text-center space-y-2">
          <p className="text-3xl">✍️</p>
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">No reflections yet</p>
          <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
            {journalNotes
              ? 'Tap “+ New entry” to jot down how you’re feeling — or add a note on any completed workout. Your reflections land here, and your coach reads every one.'
              : 'Open a completed workout and jot down how it went in the journal box. Your notes land here — and your coach reads every one.'}
          </p>
        </div>
      ) : (
        feed.map(item => {
          if (item.kind === 'note') {
            const n = item.note
            const chips = [
              n.mood ? `${MOOD_EMOJI[n.mood] ?? ''} ${MOOD_LABEL[n.mood] ?? ''}`.trim() : null,
              n.energy ? `Energy ${n.energy}/5` : null,
            ].filter(Boolean)
            return (
              <button
                key={`note-${n.id}`}
                type="button"
                onClick={() => setComposer({ mode: 'edit', note: n })}
                className="w-full text-left bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3.5 space-y-2 hover:border-amber-300 dark:hover:border-amber-700/60 transition-colors"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <div className="min-w-0 flex items-center gap-2">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 rounded px-1.5 py-0.5">
                      ✍️ Note
                    </span>
                    <span className="text-xs text-slate-400 dark:text-slate-500 truncate">
                      {fmtNoteDate(n.dateISO)}
                    </span>
                  </div>
                  <span className="text-slate-300 dark:text-slate-600 text-sm shrink-0">›</span>
                </div>

                <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed whitespace-pre-wrap">
                  {n.text.trim()}
                </p>

                {chips.length > 0 && (
                  <p className="text-xs text-slate-400 dark:text-slate-500">{chips.join(' · ')}</p>
                )}
              </button>
            )
          }

          const a = item.day.actual!
          const stats = [
            fmtDistance(a.distance),
            fmtDuration(a.movingTime),
            a.avgHR ? `${a.avgHR} bpm` : null,
            a.rpe ? `RPE ${a.rpe}` : null,
          ].filter(Boolean)
          return (
            <button
              key={`wk-${item.weekNum}-${item.day.day}`}
              type="button"
              onClick={() => setSelected({ day: item.day, weekNum: item.weekNum })}
              className="w-full text-left bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3.5 space-y-2 hover:border-amber-300 dark:hover:border-amber-700/60 transition-colors"
            >
              <div className="flex items-baseline justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">
                    {item.day.workout}
                  </p>
                  <p className="text-xs text-slate-400 dark:text-slate-500">
                    {item.day.day} · Wk {item.weekNum}
                  </p>
                </div>
                <span className="text-slate-300 dark:text-slate-600 text-sm shrink-0">›</span>
              </div>

              <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed whitespace-pre-wrap">
                {a.notes!.trim()}
              </p>

              {stats.length > 0 && (
                <p className="text-xs text-slate-400 dark:text-slate-500">{stats.join(' · ')}</p>
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

      {composer && journalNotes && (
        <JournalEntryModal
          athleteId={athleteId}
          coachEnabled={coachEnabled}
          existing={composer.mode === 'edit' ? composer.note : undefined}
          onSubmit={(draft) => {
            if (composer.mode === 'edit') {
              journalNotes.updateNote(composer.note.id, draft)
            } else {
              const created = journalNotes.addNote(draft)
              void onShareEntry?.(created)
            }
            setComposer(null)
          }}
          onDelete={composer.mode === 'edit'
            ? () => {
                journalNotes.deleteNote(composer.note.id)
                setComposer(null)
              }
            : undefined}
          onClose={() => setComposer(null)}
        />
      )}
    </div>
  )
}
