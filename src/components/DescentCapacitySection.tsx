import { useMemo } from 'react'
import {
  ComposedChart, Bar, XAxis, YAxis, ReferenceArea, ResponsiveContainer, Tooltip,
} from 'recharts'
import type { RaceInfo } from '../types'
import type { CachedEccentric } from '../utils/runEccentric'
import {
  buildDescentTrend,
  classifyAgainstBand,
  describeDescentState,
  descentTargetForCourse,
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

const METERS_PER_FOOT = 0.3048

function deltaFor(currentMeters: number, previousMeters: number | null): MetricDelta | undefined {
  if (previousMeters === null) return undefined
  if (currentMeters === 0 && previousMeters === 0) {
    return { value: 'no change', direction: 'flat' }
  }
  const diff = currentMeters - previousMeters
  if (Math.abs(diff) < 5) return { value: 'no change', direction: 'flat' }
  const abs = Math.round(Math.abs(diff))
  return {
    value: `${abs} m`,
    direction: diff > 0 ? 'up' : 'down',
  }
}

/**
 * "Descent Capacity" — the top-line metric we promoted out of WorkoutModal
 * (where it lived as a per-workout side card) onto the Dashboard.
 *
 * Trail running's #1 race-day killer is quad failure on descents. Strava
 * shows you elevation gain (the easy part). Garmin doesn't model eccentric
 * load. TrainingPeaks shows the number but doesn't surface it. We have
 * the engine (PR #83) and now we surface it in customer language with a
 * race-ready target band derived from the user's course.
 */
export default function DescentCapacitySection({
  eccentricByActivity, race, lookbackWeeks = 12,
}: Props) {
  const trend = useMemo(
    () => buildDescentTrend(eccentricByActivity, { lookbackWeeks }),
    [eccentricByActivity, lookbackWeeks],
  )

  const resolution = race ? resolveCourseForRace(race) : null
  const target = resolution ? descentTargetForCourse(resolution.course) : null
  const weeksOut = race?.date ? weeksUntilRace(race.date) : null

  // If the engine has never produced any descent data for this athlete,
  // show nothing — promoting an empty chart would be noise.
  if (trend.totalHardDescentMeters === 0 && (!trend.current || trend.current.runCount === 0)) {
    return null
  }

  const currentMeters = trend.current?.hardDescentMeters ?? 0
  const previousMeters = trend.previous?.hardDescentMeters ?? null
  const delta = deltaFor(currentMeters, previousMeters)

  const bandState = target ? classifyAgainstBand(currentMeters, target) : null
  const headlineTone: 'default' | 'positive' | 'warning' = bandState === 'in-band'
    ? 'positive'
    : bandState === 'below'
      ? 'warning'
      : 'default'

  const insightText = describeDescentState(trend, target, weeksOut)
  const insightTone: 'positive' | 'warning' | 'intelligence' =
    bandState === 'in-band' ? 'positive' : bandState === 'below' ? 'warning' : 'intelligence'

  const subtitle = target
    ? `Race-ready band: ${target.minMetersPerWeek}–${target.maxMetersPerWeek} m/week (race descends ${target.raceDescentMeters} m)`
    : race
      ? 'No race-ready band — this race has minimal descent.'
      : 'Pick a target race to see the race-ready band.'

  const raceFt = resolution ? Math.round(resolution.course.verticalLossFt) : 0
  const raceMeters = Math.round(raceFt * METERS_PER_FOOT)

  return (
    <section className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <MetricCard
          label="Hard descent · week"
          value={Math.round(currentMeters).toLocaleString()}
          valueSuffix="m"
          delta={delta}
          subtitle={trend.current
            ? `${trend.current.runCount} ${trend.current.runCount === 1 ? 'run' : 'runs'}`
            : undefined}
          tone={headlineTone}
          size="sm"
        />
        <MetricCard
          label="Race demand"
          value={raceMeters > 0 ? raceMeters.toLocaleString() : '—'}
          valueSuffix={raceMeters > 0 ? 'm' : undefined}
          subtitle={resolution
            ? `${raceFt.toLocaleString()} ft of descent`
            : 'Pick a race to see the target'}
          context={weeksOut !== null && weeksOut >= 0
            ? `${weeksOut} ${weeksOut === 1 ? 'wk' : 'wks'} to go`
            : undefined}
          size="sm"
        />
      </div>

      <ChartWithInsight
        title="Weekly hard-descent volume"
        subtitle={subtitle}
        insight={insightText}
        insightTone={insightTone}
      >
        <div className="h-32">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={trend.weeks.map(w => ({
                weekStart: w.weekStart.slice(5),
                hardDescentMeters: Math.round(w.hardDescentMeters),
              }))}
              margin={{ top: 4, right: 4, left: -8, bottom: 0 }}
            >
              {target && (
                <ReferenceArea
                  y1={target.minMetersPerWeek}
                  y2={target.maxMetersPerWeek}
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
                tickFormatter={(v: number) => `${v}`}
              />
              <Tooltip
                contentStyle={{
                  fontSize: 12,
                  borderRadius: 8,
                  border: '1px solid #e2e8f0',
                  padding: '6px 10px',
                }}
                formatter={(value) => [`${value} m`, 'Hard descent']}
                labelFormatter={(label) => `Week of ${label}`}
              />
              <Bar
                dataKey="hardDescentMeters"
                fill="#EA580C"
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
