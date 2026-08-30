import type { ChartVerdict } from '../utils/progressVerdicts'

/**
 * The one-line read that tops a Progress section — the hybrid grammar's
 * header. The verdict leads in plain language; the chart beneath it is the
 * evidence. Tone colours the accent bar only, never the whole card, so the
 * page stays calm and a single 'bad' verdict reads as a note, not an alarm.
 */
const ACCENT: Record<ChartVerdict['tone'], string> = {
  good: 'border-l-teal-500',
  watch: 'border-l-amber-400',
  bad: 'border-l-rose-400',
  neutral: 'border-l-slate-300 dark:border-l-slate-600',
}

export default function ChartVerdictHeader({ verdict }: { verdict: ChartVerdict }) {
  return (
    <div
      className={`bg-white dark:bg-slate-800 rounded-xl px-4 py-3 shadow-sm border border-slate-100 dark:border-slate-700 border-l-4 ${ACCENT[verdict.tone]}`}
      data-testid="chart-verdict"
      data-tone={verdict.tone}
    >
      <p className="text-sm font-bold text-slate-800 dark:text-white">{verdict.headline}</p>
      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">{verdict.evidence}</p>
    </div>
  )
}
