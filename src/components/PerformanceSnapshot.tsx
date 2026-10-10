import { useId } from 'react'
import type { PerformanceMetrics } from '../types'
import { tsbZone, acwrZone, ACWR_BOUNDS, TSB_BOUNDS, ACWR_IN_RANGE_RAMPING_NOTE, type AcwrBounds, type ZoneTone } from '../utils/loadZones'
import { formatLoadP } from '../utils/format'
import Term from './TermGlossary'
import { useDisplayPreferences } from '../hooks/useDisplayPreferences'
import { LOAD_SERIES_COLORS, seriesHex, type LoadSeries } from '../utils/loadSeriesColors'
import { isDarkMode } from '../utils/styles'
import { recentWindow, changeOver, changeTone, formatChange, SPARK_DAYS, DELTA_DAYS, type TrendMetric } from '../utils/metricTrend'
import MetricSparkline from './MetricSparkline'

interface Props {
  /** Today's reading of the load model. */
  latest: PerformanceMetrics
  /** The injury checks' ramp alert is live: the Load Ratio tile says the
   *  ratio is climbing fast even when its level is in range. */
  rampAlert?: boolean
  /** The athlete's tuned in-range / spike lines (age, experience). */
  acwrBounds?: AcwrBounds
  athleteId?: string
  /** A title above the tiles. Progress sits them under its chart and
   *  leaves this out; Today, where they stand alone, names them. */
  heading?: string
  /** The load timeline. When given, each tile draws its last
   *  SPARK_DAYS days as a sparkline with the change vs DELTA_DAYS ago. */
  history?: PerformanceMetrics[]
}

/**
 * The performance snapshot: Fitness, Fatigue, Recovery Balance and Load
 * Ratio as four tiles, each with its zone and a one-line note. Shared by
 * Progress (under the Fitness / Fatigue chart) and Today, so the two can
 * never disagree about a number or its reading.
 */
export default function PerformanceSnapshot({ latest, rampAlert = false, acwrBounds = ACWR_BOUNDS, athleteId, heading, history }: Props) {
  const { flags } = useDisplayPreferences(athleteId)
  const headingId = useId()
  // One table for every load surface (utils/loadZones): the bands, the
  // cards and the glossary can no longer disagree about a number.
  const tsb = tsbZone(latest.tsb)
  const acwr = acwrZone(latest.acwr, acwrBounds)
  const inRangeButClimbing = rampAlert && acwr.key === 'in_range'

  // The sparklines read the same window the tiles' values end on.
  const recent = history ? recentWindow(history) : []
  const dark = isDarkMode()
  const loadDp = flags.numericPrecision === 'high' ? 1 : 0
  const ratioDp = flags.numericPrecision === 'low' ? 1 : 2
  const toneBounds = { tsbOverreaching: TSB_BOUNDS.build, acwrLow: acwrBounds.low, acwrHigh: acwrBounds.sweetTop }
  const trend = (metric: TrendMetric, name: string, color: string, dp: number, extra: { baseline?: number; band?: [number, number] } = {}) => {
    if (recent.length < 2) return undefined
    const values = recent.map(p => p[metric])
    const change = changeOver(recent, metric, DELTA_DAYS)
    // Color by the change as shown: a −0.4 that rounds to "± 0" is grey.
    const shown = change === null ? null : Number(change.toFixed(dp))
    const first = values[0].toFixed(dp)
    const last = values[values.length - 1].toFixed(dp)
    return (
      <>
        <MetricSparkline
          values={values}
          color={color}
          label={`${name}, last ${SPARK_DAYS} days: ${first} to ${last}`}
          {...extra}
        />
        {shown !== null && (
          <p className={`text-xs font-semibold mt-0.5 ${CHANGE_TONE_CLASS[changeTone(metric, shown, values[values.length - 1], toneBounds)]}`}>
            {formatChange(shown, dp)} <span className="font-normal text-slate-500 dark:text-slate-400">vs {DELTA_DAYS}d ago</span>
          </p>
        )}
      </>
    )
  }

  const tiles = (
    <div className="grid grid-cols-2 gap-2">
      <PerfStatCard
        label={<Term name="ctl" />}
        value={formatLoadP(latest.ctl, flags.numericPrecision)}
        sub=""
        series="ctl"
        color="series"
        trend={trend('ctl', 'Fitness', seriesHex('ctl', dark), loadDp)}
        note={
          latest.ctl < 20 ? 'Building base — keep training consistently'
          : latest.ctl < 40 ? 'Moderate fitness — on track for build phase'
          : latest.ctl < 60 ? 'Strong fitness — maintain through quality sessions'
          : 'High fitness — protect with smart recovery'
        }
      />
      <PerfStatCard
        label={<Term name="atl" />}
        value={formatLoadP(latest.atl, flags.numericPrecision)}
        sub=""
        series="atl"
        color="series"
        trend={trend('atl', 'Fatigue', seriesHex('atl', dark), loadDp)}
        note={
          latest.atl > latest.ctl * 1.5 ? 'Very high — consider an easy day soon'
          : latest.atl > latest.ctl ? 'Fatigue exceeds fitness — normal in build weeks'
          : latest.atl > latest.ctl * 0.8 ? 'Balanced — steady training'
          : 'Low fatigue — room to push harder'
        }
      />
      <PerfStatCard
        label={<Term name="tsb">Recovery Balance</Term>}
        value={`${latest.tsb >= 0 ? '+' : ''}${formatLoadP(latest.tsb, flags.numericPrecision)}`}
        sub={tsb.label}
        series="tsb"
        color={toneColor(tsb.tone)}
        trend={trend('tsb', 'Recovery Balance', seriesHex('tsb', dark), loadDp, { baseline: 0 })}
        note={tsb.note}
      />
      <PerfStatCard
        label={<Term name="acwr">Load Ratio</Term>}
        value={latest.acwr.toFixed(flags.numericPrecision === 'low' ? 1 : 2)}
        sub={inRangeButClimbing ? `${acwr.label} · climbing fast` : acwr.label}
        color={toneColor(acwr.tone)}
        trend={trend('acwr', 'Load Ratio', dark ? '#94a3b8' : '#475569', ratioDp, { band: [acwrBounds.low, acwrBounds.sweetTop] })}
        note={inRangeButClimbing ? ACWR_IN_RANGE_RAMPING_NOTE : acwr.note}
      />
    </div>
  )

  if (!heading) return tiles
  return (
    <section aria-labelledby={headingId} className="space-y-2">
      <h2 id={headingId} className="px-1 text-base font-semibold text-slate-700 dark:text-slate-200">{heading}</h2>
      {tiles}
    </section>
  )
}

/** A change's tone as text: green good, amber caution, grey neutral. */
const CHANGE_TONE_CLASS = {
  good: 'text-green-700 dark:text-green-400',
  caution: 'text-amber-700 dark:text-amber-400',
  neutral: 'text-slate-500 dark:text-slate-400',
} as const

/** A zone's tone as a stat-card color. */
function toneColor(tone: ZoneTone): string {
  return tone === 'good' ? 'green' : tone === 'warning' ? 'amber' : tone === 'critical' ? 'red' : 'slate'
}

/** A stat card. `series` ties it to its chart line with a swatch; its
 *  value wears the series color when `color` is 'series', else a zone
 *  tone (Recovery Balance and Load Ratio color by zone, not identity). */
function PerfStatCard({ label, value, sub, color, note, series, trend }: {
  label: React.ReactNode; value: string; sub: React.ReactNode; color: string; note?: string; series?: LoadSeries
  /** The sparkline and its change line, under the value. */
  trend?: React.ReactNode
}) {
  // The light steps sit on white; the dark card needs the lighter steps
  // (green-700 on slate-800 is barely legible).
  const colorMap: Record<string, string> = {
    red: 'text-red-600 dark:text-red-400',
    green: 'text-green-700 dark:text-green-400',
    amber: 'text-amber-600 dark:text-amber-400',
    slate: 'text-slate-700 dark:text-slate-200',
  }
  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl p-3 shadow-sm border border-slate-100 dark:border-slate-700">
      <div className="flex items-baseline gap-2">
        <div>
          <p className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide flex items-center">
            {series && <span aria-hidden className={`inline-block w-3 h-[3px] rounded-full mr-1.5 shrink-0 ${LOAD_SERIES_COLORS[series].swatch}`} />}
            {label}
          </p>
          <p className={`text-2xl font-bold ${(color === 'series' && series ? LOAD_SERIES_COLORS[series].text : colorMap[color]) || 'text-slate-800 dark:text-white'}`}>{value}</p>
          <p className="text-xs text-slate-400 leading-tight">{sub}</p>
        </div>
      </div>
      {trend}
      {note && (
        <p className="text-sm text-slate-600 dark:text-slate-300 mt-1.5 leading-snug border-t border-slate-100 dark:border-slate-700 pt-1.5">{note}</p>
      )}
    </div>
  )
}
