import type { WeekReview } from '../utils/weekReview'
import { formatReviewRange, formatTrainingTime } from '../utils/weekReview'

interface Props {
  review: WeekReview
  open: boolean
  onToggle: () => void
}

const weekday = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short' })

/** Split "✅ All 3 planned sessions done." into its emoji and its words,
 *  so the words line up in a column. */
function splitLine(line: string): [string, string] {
  const space = line.indexOf(' ')
  return space > 0 ? [line.slice(0, space), line.slice(space + 1)] : ['', line]
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex-1 min-w-0 rounded-lg bg-slate-50 dark:bg-slate-900/60 px-2 py-2 text-center">
      <p className="text-lg font-semibold leading-tight text-slate-800 dark:text-slate-100 tabular-nums">{value}</p>
      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{label}</p>
    </div>
  )
}

function Section({ tone, title, lines, empty }: {
  tone: 'good' | 'improve'
  title: string
  lines: string[]
  empty: string
}) {
  const accent = tone === 'good'
    ? { border: 'border-emerald-500', text: 'text-emerald-700 dark:text-emerald-400', mark: '✚' }
    : { border: 'border-amber-500', text: 'text-amber-700 dark:text-amber-400', mark: '△' }
  return (
    <section className={`border-l-2 ${accent.border} pl-3`} aria-label={title}>
      <p className={`text-xs font-bold uppercase tracking-wide ${accent.text}`}>
        <span aria-hidden="true">{accent.mark}</span> {title}
      </p>
      {lines.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{empty}</p>
      ) : (
        <ul className="mt-1 space-y-1.5">
          {lines.map(line => {
            const [icon, words] = splitLine(line)
            return (
              <li key={line} className="flex gap-2 text-sm leading-snug text-slate-700 dark:text-slate-200">
                <span className="w-5 shrink-0 text-center" aria-hidden="true">{icon}</span>
                <span>{words}</span>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

/**
 * The Today tab's last-7-days review: three numbers, the hardest session,
 * then what is going well and what to change. The words come from
 * buildWeekReview; this only lays them out.
 */
export default function WeekReviewCard({ review, open, onToggle }: Props) {
  const { stats } = review
  const sessions = stats.planned && stats.planned.due > 0
    ? { value: `${stats.planned.done} of ${stats.planned.due}`, label: 'Sessions done' }
    : { value: String(stats.daysTrained), label: stats.daysTrained === 1 ? 'Day trained' : 'Days trained' }
  const fitness = stats.fitnessDelta > 0 ? `+${stats.fitnessDelta}` : stats.fitnessDelta < 0 ? `−${Math.abs(stats.fitnessDelta)}` : '0'

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 overflow-hidden">
      <button
        onClick={onToggle}
        aria-expanded={open}
        aria-controls="week-review-body"
        className="w-full flex items-center justify-between p-4 text-left hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
      >
        <div className="flex-1 min-w-0">
          <p className="text-base font-semibold text-slate-700 dark:text-slate-200">Your last 7 days</p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{formatReviewRange(review.fromIso, review.toIso)}</p>
        </div>
        <span className="text-sm text-teal-700 dark:text-teal-400 ml-2 shrink-0">{open ? '▴ Hide' : '▾ Show'}</span>
      </button>
      {open && (
        <div id="week-review-body" className="px-4 pb-4 space-y-4">
          <div>
            <div className="flex gap-2">
              <Stat {...sessions} />
              {stats.trainingMinutes !== null && <Stat value={formatTrainingTime(stats.trainingMinutes)} label="Training time" />}
              <Stat value={fitness} label="Fitness change" />
            </div>
            {stats.hardest && (
              <p className="text-sm text-slate-600 dark:text-slate-300 mt-2">
                <span aria-hidden="true">💪</span> Hardest session: <span className="font-medium">{weekday(stats.hardest.iso)} · {stats.hardest.name}</span>
              </p>
            )}
          </div>
          <Section tone="good" title="Going well" lines={review.wins} empty={stats.daysTrained > 0 ? 'Nothing stands out yet — keep stacking sessions.' : 'Log a few sessions and your wins will show here.'} />
          <Section tone="improve" title="To improve" lines={review.fixes} empty="Nothing to fix — keep it up." />
        </div>
      )}
    </div>
  )
}
