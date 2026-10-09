import { useMemo, useState } from 'react'
import type { OnboardingConfig } from '../hooks/useOnboarding'
import type { PlannedDay, WorkoutType } from '../types'
import type { NormalizedImport } from '../utils/planImport/normalize'
import { importedToTrainingPlan } from '../utils/planImport/toTrainingPlan'
import {
  buildImportedConfig, defaultStart, startForWeek, weekOfDate,
} from '../utils/planImport/buildImportedConfig'
import { mondayOnOrBefore } from '../utils/planDates'

/**
 * "Check your plan": the screen between reading an uploaded plan and using it
 * (initiative 004). Nothing is saved until "Use this plan".
 *
 * The week preview is built with `importedToTrainingPlan`, the same function
 * the app renders the plan with, on the config this screen would save, so the
 * dates and day rows are exactly what Today and the Plan view will show.
 * Shared by the Settings upload sheet (PR 5) and onboarding (PR 7).
 */

interface Props {
  result: NormalizedImport
  /** The file's name, shown and never sent. */
  sourceName: string
  /** The athlete's current config: the base the uploaded plan is saved on. */
  base: OnboardingConfig
  todayIso: string
  importsLeft?: number | null
  onUse: (cfg: OnboardingConfig) => void
  onUploadAnother: () => void
}

const PREVIEW_WEEKS = 3

const CHIP: Record<WorkoutType, { label: string; cls: string }> = {
  rest: { label: 'Rest', cls: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300' },
  run: { label: 'Easy', cls: 'bg-teal-100 text-teal-800 dark:bg-teal-900/50 dark:text-teal-200' },
  long: { label: 'Long', cls: 'bg-blue-900 text-white' },
  quality: { label: 'Quality', cls: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200' },
  cross: { label: 'Cross', cls: 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200' },
  strength: { label: 'Strength', cls: 'bg-slate-200 text-slate-800 dark:bg-slate-600 dark:text-slate-100' },
  race: { label: 'Race', cls: 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200' },
  limited: { label: 'Limited', cls: 'bg-slate-100 text-slate-600' },
  travel: { label: 'Travel', cls: 'bg-slate-100 text-slate-600' },
}

/** "6 mi" or "45 min" for a day row, from the strings the app renders. */
function amountOf(day: PlannedDay): string {
  const first = day.zone.split(' · ')[0]
  if (first.endsWith(' mi')) return first.replace(/\.0 mi$/, ' mi')
  return day.time && day.time !== '—' ? day.time : ''
}

function formatDate(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}

/** The review screen; see the module comment. */
export default function ImportReview({ result, sourceName, base, todayIso, importsLeft, onUse, onUploadAnother }: Props) {
  const { plan, suggestions, notes, levels } = result
  const weekCount = plan.weeks.length
  const [mode, setMode] = useState<'date' | 'week'>('date')
  const [dateIso, setDateIso] = useState(() => defaultStart(suggestions, weekCount, todayIso))
  const [weekN, setWeekN] = useState(1)
  const [raceName, setRaceName] = useState(suggestions.raceName ?? '')
  const [raceDate, setRaceDate] = useState(suggestions.raceDate ?? '')
  const [editingRace, setEditingRace] = useState(false)
  const [raceEdited, setRaceEdited] = useState(false)
  const [open, setOpen] = useState<Set<number>>(() => new Set([1]))
  const [showAll, setShowAll] = useState(weekCount <= PREVIEW_WEEKS)

  const startIso = mode === 'date'
    ? mondayOnOrBefore(dateIso || todayIso)
    : startForWeek(weekN, weekCount, todayIso)
  const choices = { startIso, raceName, raceDate }
  const preview = useMemo(
    () => importedToTrainingPlan(plan, buildImportedConfig(base, plan, { startIso, raceName, raceDate }), todayIso),
    [plan, base, startIso, raceName, raceDate, todayIso],
  )

  const sessions = plan.weeks.reduce((n, w) => n + w.sessions.filter(s => s.type !== 'rest').length, 0)
  const peak = Math.max(0, ...preview.weeks.map(w => (typeof w.miles === 'number' ? w.miles : 0)))
  const raceWhere = raceDate ? weekOfDate(raceDate, startIso, weekCount) : null
  const found = !raceEdited && !!(suggestions.raceName || suggestions.raceDate)
  const canUse = mode === 'week' || /^\d{4}-\d{2}-\d{2}$/.test(dateIso)
  const shown = showAll ? preview.weeks : preview.weeks.slice(0, PREVIEW_WEEKS)

  const toggle = (num: number) => setOpen(prev => {
    const next = new Set(prev)
    if (next.has(num)) next.delete(num)
    else next.add(num)
    return next
  })

  return (
    <div className="space-y-4" data-testid="import-review">
      <div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-white">Check your plan</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          We read it from <span className="font-medium text-slate-700 dark:text-slate-200">{sourceName}</span>. Fix anything that looks off. You can edit any day later, too.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {[
          { value: String(weekCount), label: weekCount === 1 ? 'week' : 'weeks', id: 'weeks' },
          { value: String(sessions), label: sessions === 1 ? 'session' : 'sessions', id: 'sessions' },
          { value: peak > 0 ? `${Math.round(peak)} mi` : 'By time', label: 'peak week', id: 'peak' },
        ].map(t => (
          <div key={t.id} className="rounded-xl bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700 p-2.5" data-testid={`import-tile-${t.id}`}>
            <p className="text-lg font-bold text-slate-900 dark:text-white">{t.value}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">{t.label}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 space-y-3">
        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">When does week 1 start?</p>
        <div className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-900/50" role="group" aria-label="How to set the start">
          {([['date', 'Pick a date'], ['week', 'I’m already on week…']] as const).map(([m, label]) => (
            <button
              key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)}
              className={`min-h-[40px] rounded-md text-sm ${mode === m ? 'bg-white dark:bg-slate-700 font-semibold text-slate-900 dark:text-white shadow-sm' : 'text-slate-600 dark:text-slate-300'}`}
            >{label}</button>
          ))}
        </div>
        {mode === 'date' ? (
          <div className="space-y-1">
            <label htmlFor="import-start" className="text-xs text-slate-600 dark:text-slate-300">Week 1 begins</label>
            <input
              id="import-start" type="date" value={dateIso} onChange={e => setDateIso(e.target.value)}
              className="w-full px-3 py-2.5 text-base rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
            />
            <p className="text-[11px] text-slate-500 dark:text-slate-400">Any date snaps to that week&rsquo;s Monday.</p>
          </div>
        ) : (
          <div className="space-y-1">
            <label htmlFor="import-week" className="text-xs text-slate-600 dark:text-slate-300">This week is week</label>
            <input
              id="import-week" type="number" inputMode="numeric" min={1} max={weekCount} value={weekN}
              onChange={e => setWeekN(Math.min(Math.max(1, Number(e.target.value) || 1), weekCount))}
              className="w-24 px-3 py-2.5 text-base rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
            />
            <p className="text-[11px] text-slate-500 dark:text-slate-400">of {weekCount}. Week 1 then began {formatDate(startIso)}.</p>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 space-y-1.5" data-testid="import-race">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Race</p>
          {found && (
            <span className="text-[11px] font-semibold text-teal-800 bg-teal-100 dark:bg-teal-900/50 dark:text-teal-200 px-2 py-0.5 rounded-full">Found in your plan</span>
          )}
        </div>
        {editingRace ? (
          <div className="space-y-2">
            <label className="block text-xs text-slate-600 dark:text-slate-300" htmlFor="import-race-name">Race name</label>
            <input
              id="import-race-name" type="text" value={raceName} maxLength={120}
              onChange={e => { setRaceName(e.target.value); setRaceEdited(true) }}
              className="w-full px-3 py-2.5 text-base rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
            />
            <label className="block text-xs text-slate-600 dark:text-slate-300" htmlFor="import-race-date">Race date</label>
            <input
              id="import-race-date" type="date" value={raceDate}
              onChange={e => { setRaceDate(e.target.value); setRaceEdited(true) }}
              className="w-full px-3 py-2.5 text-base rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
            />
            <button type="button" onClick={() => setEditingRace(false)} className="min-h-[36px] text-sm font-semibold text-teal-700 dark:text-teal-300">Done</button>
          </div>
        ) : (
          <>
            {raceName || raceDate ? (
              <>
                {raceName && <p className="text-base font-semibold text-slate-900 dark:text-white">{raceName}</p>}
                {raceDate && (
                  <p className="text-sm text-slate-600 dark:text-slate-300" data-testid="import-race-when">
                    {formatDate(raceDate)}
                    {raceWhere === 'after' ? ' · after your plan ends'
                      : raceWhere === 'before' ? ' · before your plan starts'
                      : raceWhere ? ` · week ${raceWhere.week}${raceWhere.week === weekCount ? ', the last week' : ''}` : ''}
                  </p>
                )}
              </>
            ) : (
              <p className="text-sm text-slate-500 dark:text-slate-400">No race in this plan.</p>
            )}
            <button type="button" onClick={() => setEditingRace(true)} className="min-h-[36px] text-sm font-semibold text-teal-700 dark:text-teal-300">
              {raceName || raceDate ? 'Edit race' : 'Add a race'}
            </button>
          </>
        )}
      </div>

      {(notes.length > 0 || levels.length > 1) && (
        <div className="rounded-xl bg-amber-50 dark:bg-amber-900/30 border border-amber-300 dark:border-amber-700 px-4 py-3 space-y-1.5" data-testid="import-notes">
          <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
            {notes.length + (levels.length > 1 ? 1 : 0)} {notes.length + (levels.length > 1 ? 1 : 0) === 1 ? 'thing' : 'things'} to check
          </p>
          {levels.length > 1 && (
            <p className="text-xs leading-relaxed text-amber-900 dark:text-amber-200">
              · Your plan has {levels.length} versions ({levels.join(', ')}). We read the one your note named, or the first. To use another, upload it again and name it in &ldquo;Anything we should know?&rdquo;.
            </p>
          )}
          {notes.map((n, i) => (
            <p key={i} className="text-xs leading-relaxed text-amber-900 dark:text-amber-200">· {n}</p>
          ))}
        </div>
      )}

      <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden divide-y divide-slate-100 dark:divide-slate-700">
        {shown.map(week => {
          const isOpen = open.has(week.num)
          return (
            <div key={week.num}>
              <button
                type="button" onClick={() => toggle(week.num)} aria-expanded={isOpen}
                className="w-full min-h-[48px] px-4 py-2 flex items-center justify-between gap-2 text-left bg-slate-50 dark:bg-slate-900/40"
                data-testid={`import-week-${week.num}`}
              >
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100">Week {week.num} · {week.dates}</span>
                  {week.focus && <span className="block text-xs text-slate-500 dark:text-slate-400 truncate">{week.focus}</span>}
                </span>
                <span className="text-sm font-semibold text-teal-700 dark:text-teal-300 shrink-0">
                  {typeof week.miles === 'number' ? `${week.miles} mi` : week.miles} {isOpen ? '▴' : '▾'}
                </span>
              </button>
              {isOpen && week.days.map(day => (
                <div key={day.day} className="grid grid-cols-[76px_minmax(0,1fr)_auto] gap-2 items-center px-4 py-2 border-t border-slate-100 dark:border-slate-700">
                  <span className="text-xs text-slate-500 dark:text-slate-400">{day.day}</span>
                  <span className={`text-sm truncate ${day.type === 'rest' ? 'text-slate-500 dark:text-slate-400' : 'text-slate-800 dark:text-slate-100'}`}>
                    {day.workout}{amountOf(day) ? ` · ${amountOf(day)}` : ''}
                  </span>
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${CHIP[day.type].cls}`}>{CHIP[day.type].label}</span>
                </div>
              ))}
            </div>
          )
        })}
        {!showAll && (
          <button type="button" onClick={() => setShowAll(true)} className="w-full min-h-[48px] text-sm font-semibold text-teal-700 dark:text-teal-300 bg-slate-50 dark:bg-slate-900/40">
            Show all {weekCount} weeks
          </button>
        )}
      </div>

      <div className="space-y-1 pt-1">
        <button
          type="button" disabled={!canUse}
          onClick={() => onUse(buildImportedConfig(base, plan, choices))}
          className="w-full py-3.5 rounded-xl bg-teal-700 text-white font-semibold disabled:opacity-50"
        >Use this plan</button>
        <button type="button" onClick={onUploadAnother} className="w-full min-h-[44px] text-sm font-semibold text-slate-600 dark:text-slate-300">
          Upload a different file
        </button>
        {importsLeft != null && (
          <p className="text-center text-[11px] text-slate-500 dark:text-slate-400" data-testid="import-left">
            {importsLeft === 1 ? '1 upload' : `${importsLeft} uploads`} left today
          </p>
        )}
      </div>
    </div>
  )
}
