import { useMemo } from 'react'
import {
  ComposedChart, Bar, XAxis, YAxis, ReferenceArea, ResponsiveContainer, Tooltip, Legend,
} from 'recharts'
import type { RaceInfo } from '../types'
import type { CachedEccentric } from '../utils/runEccentric'
import {
  buildVerticalTrend,
  classifyAgainstBand,
  describeVerticalState,
  verticalTargetsForCourse,
  type BandState,
  type VerticalBand,
} from '../utils/descentTrend'
import { resolveCourseForRace } from '../utils/resolveCourse'
import { weeksUntilRace } from '../utils/raceCountdown'
import { ChartWithInsight, MetricCard, rangeBandStyle } from './primitives'
import type { MetricDelta } from './primitives'

interface Props {
  /** Per-activity eccentric cache, keyed by "date|activityName". Same map
   *  App.tsx already loads via loadEccentricCache(). */
  eccentricByActivity: Record<string, CachedEccentric>
  race?: RaceInfo
  lookbackWeeks?: number
}

const ASCENT_FILL = '#2563EB'
const DESCENT_FILL = '#EA580C'
const FEET_PER_METER = 3.2808

/** Engine + Strava work in meters; US trail-running speaks feet. Convert
 *  at the display boundary so internal math stays metric. */
function mToFt(m: number): number {
  return Math.round(m * FEET_PER_METER)
}

function fmtFt(m: number): string {
  return mToFt(m).toLocaleString()
}

function deltaFor(currentMeters: number, previousMeters: number | null): MetricDelta | undefined {
  if (previousMeters === null) return undefined
  if (currentMeters === 0 && previousMeters === 0) {
    return { value: 'no change', direction: 'flat' }
  }
  const diff = currentMeters - previousMeters
  // 5 m ≈ 16 ft — anything smaller rounds to "no change" at ft resolution.
  if (Math.abs(diff) < 5) return { value: 'no change', direction: 'flat' }
  return { value: `${fmtFt(Math.abs(diff))} ft`, direction: diff > 0 ? 'up' : 'down' }
}

function metricTone(state: BandState | null): 'default' | 'positive' | 'warning' {
  if (state === 'in-band') return 'positive'
  if (state === 'below') return 'warning'
  return 'default'
}

function bandSubtitle(side: 'ascent' | 'descent', band: VerticalBand | null): string {
  if (!band) return 'No race target'
  const word = side === 'ascent' ? 'climbs' : 'descends'
  return `Race ${word} ${fmtFt(band.raceVerticalMeters)} ft · band ${fmtFt(band.minMetersPerWeek)}–${fmtFt(band.maxMetersPerWeek)} ft/wk`
}

/**
 * "Vertical workload" — the top-line training metric on Stats. Trail
 * running's #1 race-day killer is quad failure on descents; the #2 is
 * legs-cooked from underprepared climbing. We surface both as parallel
 * metrics with race-ready bands derived from the user's course.
 *
 * Component filename remains `DescentCapacitySection` to minimise import
 * churn; the rendered heading is "Vertical workload".
 */
export default function DescentCapacitySection({
  eccentricByActivity, race, lookbackWeeks = 12,
}: Props) {
  const trend = useMemo(
    () => buildVerticalTrend(eccentricByActivity, { lookbackWeeks }),
    [eccentricByActivity, lookbackWeeks],
  )

  const resolution = race ? resolveCourseForRace(race) : null
  const targets = resolution
    ? verticalTargetsForCourse(resolution.course)
    : { ascent: null, descent: null }
  const weeksOut = race?.date ? weeksUntilRace(race.date) : null

  // Nothing to show if the engine has produced no vertical data at all.
  const noData = trend.totalHardAscentMeters === 0
    && trend.totalHardDescentMeters === 0
    && (!trend.current || trend.current.runCount === 0)
  if (noData) return null

  const currentAscent = trend.current?.hardAscentMeters ?? 0
  const currentDescent = trend.current?.hardDescentMeters ?? 0
  const prevAscent = trend.previous?.hardAscentMeters ?? null
  const prevDescent = trend.previous?.hardDescentMeters ?? null

  const ascentState = targets.ascent ? classifyAgainstBand(currentAscent, targets.ascent) : null
  const descentState = targets.descent ? classifyAgainstBand(currentDescent, targets.descent) : null

  const insightText = describeVerticalState(trend, targets, weeksOut)
  // Insight tone follows the more urgent of the two sides: below > above > in-band.
  const states = [ascentState, descentState].filter(Boolean) as BandState[]
  const insightTone: 'positive' | 'warning' | 'intelligence' = states.includes('below')
    ? 'warning'
    : states.every(s => s === 'in-band') && states.length > 0
      ? 'positive'
      : 'intelligence'

  const subtitle = resolution
    ? 'Stacked weekly vertical: climbing (blue) + descending (orange)'
    : 'Pick a race on the Summary tab to see your race-ready bands.'

  // Chart axis + bars are in feet (US convention); rolling totals stay
  // in meters internally so the engine stays metric.
  const chartData = trend.weeks.map(w => ({
    weekStart: w.weekStart.slice(5),
    climbFt: mToFt(w.hardAscentMeters),
    descentFt: mToFt(w.hardDescentMeters),
  }))

  return (
    <section className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <MetricCard
          label="Hard climb · week"
          value={fmtFt(currentAscent)}
          valueSuffix="ft"
          delta={deltaFor(currentAscent, prevAscent)}
          subtitle={bandSubtitle('ascent', targets.ascent)}
          tone={metricTone(ascentState)}
          size="sm"
        />
        <MetricCard
          label="Hard descent · week"
          value={fmtFt(currentDescent)}
          valueSuffix="ft"
          delta={deltaFor(currentDescent, prevDescent)}
          subtitle={bandSubtitle('descent', targets.descent)}
          tone={metricTone(descentState)}
          size="sm"
        />
      </div>

      <ChartWithInsight
        title="Weekly vertical workload"
        subtitle={subtitle}
        insight={insightText}
        insightTone={insightTone}
      >
        <div className="h-32">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={chartData}
              margin={{ top: 4, right: 4, left: -8, bottom: 0 }}
            >
              {targets.descent && (
                <ReferenceArea
                  y1={mToFt(targets.descent.minMetersPerWeek)}
                  y2={mToFt(targets.descent.maxMetersPerWeek)}
                  {...rangeBandStyle('suggested')}
                />
              )}
              <XAxis
                dataKey="weekStart"
                tick={{ fontSize: 9, fill: '#94a3b8' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 9, fill: '#94a3b8' }}
                axisLine={false}
                tickLine={false}
                width={40}
                tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${v}`}
              />
              <Tooltip
                contentStyle={{
                  fontSize: 12,
                  borderRadius: 8,
                  border: '1px solid #e2e8f0',
                  padding: '6px 10px',
                }}
                formatter={(value, name) => {
                  const label = name === 'climbFt' ? 'Hard climb' : 'Hard descent'
                  const num = typeof value === 'number' ? value.toLocaleString() : String(value)
                  return [`${num} ft`, label] as [string, string]
                }}
                labelFormatter={(label) => `Week of ${label}`}
              />
              <Legend
                iconType="square"
                iconSize={8}
                wrapperStyle={{ fontSize: 10, paddingTop: 4 }}
                formatter={(value) =>
                  value === 'climbFt' ? 'Climb' : 'Descent'
                }
              />
              <Bar
                dataKey="climbFt"
                stackId="vertical"
                fill={ASCENT_FILL}
                radius={[0, 0, 0, 0]}
                isAnimationActive={false}
              />
              <Bar
                dataKey="descentFt"
                stackId="vertical"
                fill={DESCENT_FILL}
                radius={[3, 3, 0, 0]}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </ChartWithInsight>
    </section>
  )
}
