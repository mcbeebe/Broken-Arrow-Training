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

function deltaFor(currentMeters: number, previousMeters: number | null): MetricDelta | undefined {
  if (previousMeters === null) return undefined
  if (currentMeters === 0 && previousMeters === 0) {
    return { value: 'no change', direction: 'flat' }
  }
  const diff = currentMeters - previousMeters
  if (Math.abs(diff) < 5) return { value: 'no change', direction: 'flat' }
  const abs = Math.round(Math.abs(diff))
  return { value: `${abs} m`, direction: diff > 0 ? 'up' : 'down' }
}

function metricTone(state: BandState | null): 'default' | 'positive' | 'warning' {
  if (state === 'in-band') return 'positive'
  if (state === 'below') return 'warning'
  return 'default'
}

function bandSubtitle(side: 'ascent' | 'descent', band: VerticalBand | null): string {
  if (!band) return 'No race target'
  const word = side === 'ascent' ? 'climbs' : 'descends'
  return `Race ${word} ${band.raceVerticalMeters} m · band ${band.minMetersPerWeek}–${band.maxMetersPerWeek} m/wk`
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

  const chartData = trend.weeks.map(w => ({
    weekStart: w.weekStart.slice(5),
    hardAscentMeters: Math.round(w.hardAscentMeters),
    hardDescentMeters: Math.round(w.hardDescentMeters),
  }))

  return (
    <section className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <MetricCard
          label="Hard climb · week"
          value={Math.round(currentAscent).toLocaleString()}
          valueSuffix="m"
          delta={deltaFor(currentAscent, prevAscent)}
          subtitle={bandSubtitle('ascent', targets.ascent)}
          tone={metricTone(ascentState)}
          size="sm"
        />
        <MetricCard
          label="Hard descent · week"
          value={Math.round(currentDescent).toLocaleString()}
          valueSuffix="m"
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
                  y1={targets.descent.minMetersPerWeek}
                  y2={targets.descent.maxMetersPerWeek}
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
                width={36}
              />
              <Tooltip
                contentStyle={{
                  fontSize: 12,
                  borderRadius: 8,
                  border: '1px solid #e2e8f0',
                  padding: '6px 10px',
                }}
                formatter={(value, name) => {
                  const label = name === 'hardAscentMeters' ? 'Hard climb' : 'Hard descent'
                  return [`${value} m`, label] as [string, string]
                }}
                labelFormatter={(label) => `Week of ${label}`}
              />
              <Legend
                iconType="square"
                iconSize={8}
                wrapperStyle={{ fontSize: 10, paddingTop: 4 }}
                formatter={(value) =>
                  value === 'hardAscentMeters' ? 'Climb' : 'Descent'
                }
              />
              <Bar
                dataKey="hardAscentMeters"
                stackId="vertical"
                fill={ASCENT_FILL}
                radius={[0, 0, 0, 0]}
                isAnimationActive={false}
              />
              <Bar
                dataKey="hardDescentMeters"
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
