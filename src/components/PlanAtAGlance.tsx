import type { TrainingWeek, PlannedDay } from '../types'
import { getWorkoutStyle } from '../utils/styles'
import { formatWeekMilesHeader } from '../utils/format'

/**
 * "Plan at a glance" — the engaging, no-Garmin-required snapshot for the
 * Summary tab: where you are in the block, what this week looks like, the next
 * key session, and a phase-appropriate coach note. Everything here comes from
 * the generated plan, so it's useful before any wearable is connected.
 *
 * Display-only (the Today's-Workout CTA below it owns opening the modal).
 */
interface Props {
  weeks: TrainingWeek[]
  currentWeekNum: number
  todayPlannedWorkout?: PlannedDay | null
}

// Phase-keyed coaching note. Keyed off the week `focus` the engine stamps
// ('Base' / 'Build' / 'Peak' / 'Taper' / 'Cutback' / phase name); falls back to
// a sensible default for method-specific phase names.
const PHASE_NOTE: Record<string, string> = {
  Base: 'Base phase — build the aerobic engine. Keep easy days genuinely easy; consistency beats intensity right now.',
  Build: 'Build phase — the quality sessions sharpen now. Commit to the hard days, then recover just as deliberately.',
  Peak: 'Peak phase — your highest specific load. Trust the work, guard your sleep, and skip “bonus” miles.',
  Taper: 'Taper — the fitness is banked. Resist cramming; sharpen, rest, and arrive fresh.',
  Cutback: 'Cutback week — lower volume on purpose. Absorbing the work is what makes the next block possible.',
}

function noteFor(focus: string): string {
  return PHASE_NOTE[focus] ?? `${focus} — show up for the easy days as much as the hard ones, and the plan does the rest.`
}

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export default function PlanAtAGlance({ weeks, currentWeekNum, todayPlannedWorkout }: Props) {
  if (!weeks || weeks.length === 0) return null
  const week = weeks.find(w => w.num === currentWeekNum) ?? weeks[0]
  const nextWeek = weeks.find(w => w.num === week.num + 1) ?? null

  const todayIdx = todayPlannedWorkout
    ? week.days.findIndex(d => d.day === todayPlannedWorkout.day)
    : -1

  // Next key session = the next long or quality day after today (rolling into
  // next week if this week has none left).
  const upcoming = [...week.days.slice(todayIdx + 1), ...(nextWeek?.days ?? [])]
  const nextKey = upcoming.find(d => d.type === 'long' || d.type === 'quality') ?? null

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl p-4 shadow-sm border border-slate-100 dark:border-slate-700 space-y-3">
      <div className="flex items-baseline justify-between">
        <p className="text-base font-bold text-slate-800 dark:text-white">This week</p>
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Week {week.num} of {weeks.length}</p>
      </div>
      <p className="text-sm text-slate-600 dark:text-slate-300 -mt-1">
        <span className="font-semibold">{week.focus}</span> · {formatWeekMilesHeader(week.miles)} planned
      </p>

      {/* Day-by-day chips, today ringed */}
      <div className="grid grid-cols-7 gap-1">
        {week.days.map((d, i) => {
          const style = getWorkoutStyle(d.type)
          const isToday = i === todayIdx
          const dow = d.day.split(' ')[0]
          return (
            <div
              key={i}
              className={`flex flex-col items-center rounded-lg py-1.5 border ${isToday ? 'border-teal-500 ring-1 ring-teal-400' : 'border-slate-100 dark:border-slate-700'}`}
              style={{ backgroundColor: isToday ? undefined : style.bg }}
              title={`${d.day}: ${d.workout}`}
            >
              <span className="text-[10px] font-medium text-slate-400 dark:text-slate-500">{DOW.includes(dow) ? dow[0] : dow}</span>
              <span className="text-base leading-tight">{d.type === 'rest' ? '·' : style.label}</span>
            </div>
          )
        })}
      </div>

      {nextKey && (
        <p className="text-sm text-slate-600 dark:text-slate-300">
          <span className="font-semibold text-slate-700 dark:text-slate-200">Next key session:</span>{' '}
          {nextKey.day.split(' ')[0]} — {nextKey.workout}
          {nextKey.time && nextKey.time !== '—' ? ` · ${nextKey.time}` : ''}
        </p>
      )}

      <div className="flex items-start gap-1.5 rounded-lg bg-teal-50 dark:bg-teal-950/40 border border-teal-100 dark:border-teal-900 px-3 py-2">
        <span aria-hidden>🧭</span>
        <p className="text-sm text-teal-900 dark:text-teal-200 leading-snug">{noteFor(week.focus)}</p>
      </div>
    </div>
  )
}
