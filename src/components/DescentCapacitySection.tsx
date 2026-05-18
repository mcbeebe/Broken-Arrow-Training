import { useMemo } from 'react'
import {
  ComposedChart, Bar, XAxis, YAxis, ReferenceArea, ResponsiveContainer, Tooltip,
} from 'recharts'
import type { RaceInfo } from '../types'
import type { WeekCompliance } from '../hooks/useCompliance'
import { resolveCourseForRace } from '../utils/resolveCourse'
import { weeksUntilRace } from '../utils/raceCountdown'
import { ChartWithInsight, MetricCard, rangeBandStyle } from './primitives'
import type { MetricDelta } from './primitives'

interface Props {
  /** Per-plan-week aggregates from useCompliance. Same source as the
   *  Plan tab's "Vertical Progression" chart, so numbers align across
   *  surfaces by construction. */
  weeks: WeekCompliance[]
  race?: RaceInfo
}

const CLIMB_FILL = '#2563EB'

function deltaFor(currentFt: number, previousFt: number | null): MetricDelta | undefined {
  if (previousFt === null) return undefined
  if (currentFt === 0 && previousFt === 0) return { value: 'no change', direction: 'flat' }
  const diff = currentFt - previousFt
  if (Math.abs(diff) < 20) return { value: 'no change', direction: 'flat' }
  return {
    value: `${Math.round(Math.abs(diff)).toLocaleString()} ft`,
    direction: diff > 0 ? 'up' : 'down',
  }
}

/**
 * Race-ready climb band in feet — peak weeks should aim for 1.2–1.8× the
 * race's total vertical gain so the user accumulates the necessary climbing
 * adaptations before tapering. Returns null when the race carries no
 * meaningful climbing (rare for a trail target).
 */
function climbBandForRace(verticalGainFt: number): { minFt: number; maxFt: number } | null {
  if (verticalGainFt < 300) return null
  return {
    minFt: Math.round(verticalGainFt * 1.2),
    maxFt: Math.round(verticalGainFt * 1.8),
  }
}

type BandState = 'below' | 'in-band' | 'above'
function classify(ft: number, band: { minFt: number; maxFt: number }): BandState {
  if (ft < band.minFt) return 'below'
  if (ft > band.maxFt) return 'above'
  return 'in-band'
}

/**
 * "Weekly climb" — surfaces the per-week vertical gain Mike is actually
 * accumulating against a race-ready band derived from the target course.
 * Sourced from useCompliance.actualElevation so the number agrees with
 * the Plan tab's Vertical Progression chart by construction.
 *
 * Component filename stays as DescentCapacitySection to keep imports
 * stable; the rendered surface is climb-only until we add per-activity
 * elevationLoss to the activity model (planned follow-up).
 */
export default function DescentCapacitySection({ weeks, race }: Props) {
  const resolution = race ? resolveCourseForRace(race) : null
  const raceGainFt = resolution ? Math.round(resolution.course.verticalGainFt) : 0
  const band = raceGainFt > 0 ? climbBandForRace(raceGainFt) : null
  const weeksOut = race?.date ? weeksUntilRace(race.date) : null

  // "Current" = most recent week that has any logged climb. Anything
  // after that is future plan weeks the user hasn't reached yet.
  const { current, previous, pastWeeks } = useMemo(() => {
    const past = weeks.filter(w => w.actualElevation > 0)
    return {
      current: past[past.length - 1] ?? null,
      previous: past[past.length - 2] ?? null,
      pastWeeks: past,
    }
  }, [weeks])

  // Hide the section if there's no climb data at all — promoting an
  // empty chart on the dashboard would be noise.
  if (pastWeeks.length === 0) return null

  const currentFt = current?.actualElevation ?? 0
  const previousFt = previous?.actualElevation ?? null
  const state = band ? classify(currentFt, band) : null

  const tone: 'default' | 'positive' | 'warning' = state === 'in-band'
    ? 'positive'
    : state === 'below'
      ? 'warning'
      : 'default'
  const insightTone: 'positive' | 'warning' | 'intelligence' = state === 'in-band'
    ? 'positive'
    : state === 'below'
      ? 'warning'
      : 'intelligence'

  const subtitle = band
    ? `Race climbs ${raceGainFt.toLocaleString()} ft · band ${band.minFt.toLocaleString()}–${band.maxFt.toLocaleString()} ft/wk`
    : 'Pick a target race to see your race-ready band.'

  const insight = buildInsight(currentFt, band, state, weeksOut)

  const chartData = weeks.map(w => ({
    week: `Wk ${w.weekNum}`,
    climbFt: Math.round(w.actualElevation),
    plannedFt: Math.round(w.plannedElevation),
  }))

  return (
    <section className="space-y-2">
      <MetricCard
        label="Hard climb · week"
        value={currentFt.toLocaleString()}
        valueSuffix="ft"
        delta={deltaFor(currentFt, previousFt)}
        subtitle={subtitle}
        context={weeksOut !== null && weeksOut >= 0
          ? `${weeksOut} ${weeksOut === 1 ? 'wk' : 'wks'} to race`
          : undefined}
        tone={tone}
        size="sm"
      />

      <ChartWithInsight
        title="Weekly climb"
        subtitle="Matches the Plan tab's Vertical Progression — same per-week ft, race-ready band overlaid."
        insight={insight}
        insightTone={insightTone}
      >
        <div className="h-32">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={chartData}
              margin={{ top: 4, right: 4, left: -8, bottom: 0 }}
            >
              {band && (
                <ReferenceArea
                  y1={band.minFt}
                  y2={band.maxFt}
                  {...rangeBandStyle('suggested')}
                />
              )}
              <XAxis
                dataKey="week"
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
                  const label = name === 'climbFt' ? 'Climb' : 'Planned'
                  const num = typeof value === 'number' ? value.toLocaleString() : String(value)
                  return [`${num} ft`, label] as [string, string]
                }}
              />
              <Bar
                dataKey="climbFt"
                fill={CLIMB_FILL}
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

function buildInsight(
  currentFt: number,
  band: { minFt: number; maxFt: number } | null,
  state: BandState | null,
  weeksOut: number | null,
): string {
  const raceContext = weeksOut !== null && weeksOut > 0
    ? ` with ${weeksOut} week${weeksOut === 1 ? '' : 's'} to race day`
    : ''
  if (!band || !state) {
    return `${currentFt.toLocaleString()} ft of climb this week. Pick a race to see the target band.`
  }
  const bandStr = `${band.minFt.toLocaleString()}–${band.maxFt.toLocaleString()} ft`
  if (state === 'in-band') {
    return `${currentFt.toLocaleString()} ft of climb this week — squarely in the race-ready band (${bandStr})${raceContext}. Hold the line.`
  }
  if (state === 'below') {
    const gap = Math.max(0, band.minFt - currentFt)
    return `${currentFt.toLocaleString()} ft of climb this week — short ${gap.toLocaleString()} ft of the ${bandStr} band${raceContext}. Add a hill session next week.`
  }
  return `${currentFt.toLocaleString()} ft of climb this week — above the ${bandStr} band${raceContext}. Strong; watch recovery before pushing higher.`
}
