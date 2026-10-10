import { useId, type ReactNode } from 'react'
import type { PerformanceMetrics } from '../types'
import { tsbZone, acwrZone, ACWR_BOUNDS, TSB_BOUNDS, ACWR_IN_RANGE_RAMPING_NOTE, type AcwrBounds, type ZoneTone } from '../utils/loadZones'
import { formatLoadP } from '../utils/format'
import Term from './TermGlossary'
import { useDisplayPreferences } from '../hooks/useDisplayPreferences'
import { LOAD_SERIES_COLORS, seriesHex } from '../utils/loadSeriesColors'
import { isDarkMode } from '../utils/styles'
import { recentWindow, changeOver, changeTone, formatChange, SPARK_DAYS, DELTA_DAYS, performanceTargetId, type TrendMetric } from '../utils/metricTrend'
import MetricSparkline from './MetricSparkline'
import MetricTrendCard from './MetricTrendCard'

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
  /** 'tiles' (Today): four compact tiles with sparklines. 'cards'
   *  (Performance): four full-width cards, each with a real chart over
   *  `series`. */
  layout?: 'tiles' | 'cards'
  /** The chosen window, for the cards' charts. Defaults to `history`. */
  series?: PerformanceMetrics[]
  /** Tiles only: makes each tile a button that opens its card. */
  onOpen?: (metric: TrendMetric) => void
}

interface MetricView {
  metric: TrendMetric
  name: string
  label: ReactNode
  value: string
  valueClass: string
  sub: ReactNode
  note: string
  swatch?: string
  color: string
  dp: number
  baseline?: number
  band?: [number, number]
}

/**
 * The performance snapshot: Fitness, Fatigue, Recovery Balance and Load
 * Ratio, each with its zone, a one-line note and its recent trend. Today
 * shows them as compact tiles that open the Performance tab; Performance
 * shows the same four as full-width cards with real charts. One component,
 * so the two can never disagree about a number or its reading.
 */
export default function PerformanceSnapshot({
  latest, rampAlert = false, acwrBounds = ACWR_BOUNDS, athleteId, heading, history, layout = 'tiles', series, onOpen,
}: Props) {
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

  const views: MetricView[] = [
    {
      metric: 'ctl', name: 'Fitness', label: <Term name="ctl" />,
      value: formatLoadP(latest.ctl, flags.numericPrecision),
      valueClass: LOAD_SERIES_COLORS.ctl.text!, sub: '', swatch: LOAD_SERIES_COLORS.ctl.swatch,
      color: seriesHex('ctl', dark), dp: loadDp,
      note:
        latest.ctl < 20 ? 'Building base — keep training consistently'
        : latest.ctl < 40 ? 'Moderate fitness — on track for build phase'
        : latest.ctl < 60 ? 'Strong fitness — maintain through quality sessions'
        : 'High fitness — protect with smart recovery',
    },
    {
      metric: 'atl', name: 'Fatigue', label: <Term name="atl" />,
      value: formatLoadP(latest.atl, flags.numericPrecision),
      valueClass: LOAD_SERIES_COLORS.atl.text!, sub: '', swatch: LOAD_SERIES_COLORS.atl.swatch,
      color: seriesHex('atl', dark), dp: loadDp,
      note:
        latest.atl > latest.ctl * 1.5 ? 'Very high — consider an easy day soon'
        : latest.atl > latest.ctl ? 'Fatigue exceeds fitness — normal in build weeks'
        : latest.atl > latest.ctl * 0.8 ? 'Balanced — steady training'
        : 'Low fatigue — room to push harder',
    },
    {
      metric: 'tsb', name: 'Recovery Balance', label: <Term name="tsb">Recovery Balance</Term>,
      value: `${latest.tsb >= 0 ? '+' : ''}${formatLoadP(latest.tsb, flags.numericPrecision)}`,
      valueClass: ZONE_TEXT[toneColor(tsb.tone)], sub: tsb.label, swatch: LOAD_SERIES_COLORS.tsb.swatch,
      color: seriesHex('tsb', dark), dp: loadDp, baseline: 0, note: tsb.note,
    },
    {
      metric: 'acwr', name: 'Load Ratio', label: <Term name="acwr">Load Ratio</Term>,
      value: latest.acwr.toFixed(ratioDp),
      valueClass: ZONE_TEXT[toneColor(acwr.tone)],
      sub: inRangeButClimbing ? `${acwr.label} · climbing fast` : acwr.label,
      color: dark ? '#94a3b8' : '#475569', dp: ratioDp, band: [acwrBounds.low, acwrBounds.sweetTop],
      note: inRangeButClimbing ? ACWR_IN_RANGE_RAMPING_NOTE : acwr.note,
    },
  ]

  /** The change vs DELTA_DAYS ago, coloured by its zone-aware tone. */
  const changeLine = (v: MetricView, size: 'xs' | 'sm') => {
    const change = changeOver(history ?? [], v.metric, DELTA_DAYS)
    if (change === null) return undefined
    // Color by the change as shown: a −0.4 that rounds to "± 0" is grey.
    const shown = Number(change.toFixed(v.dp))
    return (
      <p className={`text-${size} font-semibold ${CHANGE_TONE_CLASS[changeTone(v.metric, shown, latest[v.metric], toneBounds)]}`}>
        {formatChange(shown, v.dp)} <span className="font-normal text-slate-500 dark:text-slate-400">vs {DELTA_DAYS}d ago</span>
      </p>
    )
  }

  if (layout === 'cards') {
    const windowed = [...(series ?? history ?? [])].sort((a, b) => a.date.localeCompare(b.date))
    return (
      <div className="space-y-3">
        {views.map(v => (
          <MetricTrendCard
            key={v.metric}
            id={performanceTargetId(v.metric)}
            name={v.name}
            label={v.label}
            swatch={v.swatch}
            value={v.value}
            valueClass={v.valueClass}
            sub={v.sub || undefined}
            change={changeLine(v, 'sm')}
            note={v.note}
            data={windowed.map(p => ({ date: p.date, value: p[v.metric] }))}
            color={v.color}
            dp={v.dp}
            baseline={v.baseline}
            band={v.band}
          />
        ))}
      </div>
    )
  }

  const tiles = (
    <div className="grid grid-cols-2 gap-2">
      {views.map(v => {
        const values = recent.map(p => p[v.metric])
        return (
          <PerfStatCard
            key={v.metric}
            label={v.label}
            value={v.value}
            valueClass={v.valueClass}
            sub={v.sub}
            swatch={v.swatch}
            note={v.note}
            open={onOpen ? { onClick: () => onOpen(v.metric), label: `Open ${v.name} on Performance` } : undefined}
            trend={recent.length < 2 ? undefined : (
              <>
                <MetricSparkline
                  values={values}
                  color={v.color}
                  label={`${v.name}, last ${SPARK_DAYS} days: ${values[0].toFixed(v.dp)} to ${values[values.length - 1].toFixed(v.dp)}`}
                  baseline={v.baseline}
                  band={v.band}
                />
                <div className="mt-0.5">{changeLine(v, 'xs')}</div>
              </>
            )}
          />
        )
      })}
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
function toneColor(tone: ZoneTone): keyof typeof ZONE_TEXT {
  return tone === 'good' ? 'green' : tone === 'warning' ? 'amber' : tone === 'critical' ? 'red' : 'slate'
}

// The light steps sit on white; the dark card needs the lighter steps
// (green-700 on slate-800 is barely legible).
const ZONE_TEXT = {
  red: 'text-red-600 dark:text-red-400',
  green: 'text-green-700 dark:text-green-400',
  amber: 'text-amber-600 dark:text-amber-400',
  slate: 'text-slate-700 dark:text-slate-200',
} as const

/** A compact stat tile. `swatch` ties it to its chart line; the value
 *  wears the series color (Fitness, Fatigue) or its zone's (Recovery
 *  Balance, Load Ratio). With `open`, the whole tile is a button: it sits
 *  under the content, so the glossary term on the label still opens its
 *  own definition (a button can't nest inside a button). */
function PerfStatCard({ label, value, valueClass, sub, note, swatch, trend, open }: {
  label: ReactNode; value: string; valueClass: string; sub: ReactNode; note?: string; swatch?: string
  /** The sparkline and its change line, under the value. */
  trend?: ReactNode
  open?: { onClick: () => void; label: string }
}) {
  return (
    <div className={`relative bg-white dark:bg-slate-800 rounded-xl p-3 shadow-sm border border-slate-100 dark:border-slate-700 ${open ? 'hover:border-slate-300 dark:hover:border-slate-500 transition-colors' : ''}`}>
      {open && (
        <button
          type="button"
          onClick={open.onClick}
          aria-label={open.label}
          className="absolute inset-0 w-full h-full rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
        />
      )}
      <div className={open ? 'relative pointer-events-none' : undefined}>
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide flex items-center">
              {swatch && <span aria-hidden className={`inline-block w-3 h-[3px] rounded-full mr-1.5 shrink-0 ${swatch}`} />}
              <span className="pointer-events-auto">{label}</span>
            </p>
            <p className={`text-2xl font-bold ${valueClass}`}>{value}</p>
            <p className="text-xs text-slate-400 leading-tight">{sub}</p>
          </div>
          {open && <span aria-hidden className="text-slate-400 dark:text-slate-500 text-lg leading-none">›</span>}
        </div>
        {trend}
        {note && (
          <p className="text-sm text-slate-600 dark:text-slate-300 mt-1.5 leading-snug border-t border-slate-100 dark:border-slate-700 pt-1.5">{note}</p>
        )}
      </div>
    </div>
  )
}
