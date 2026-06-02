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

// Weekly-climb band model. Three inputs shape the target:
//
//  1. Volume anchor (primary). Climb has to be carried by the miles you
//     actually run. Peak mountain-prep weeks land around 110–175 ft of
//     gain per running mile (rolling ≈ 50–100, steep mountain ≈ 200+); we
//     target that hilly→mountain density against the plan's peak weekly
//     mileage. This is a coaching heuristic, not a published table — it
//     replaces the old fixed "1.2–1.8× race vertical," which ignored the
//     athlete's volume and over-prescribed for lower-mileage runners.
//  2. Race-demand cap. No point training above what the course asks, so the
//     volume target is ceilinged at 1.2–1.8× the race's vertical gain.
//  3. Taper. The band eases over the final ~3 weeks rather than holding peak
//     load into race day.
const VERT_FT_PER_MILE_LOW = 110
const VERT_FT_PER_MILE_HIGH = 175
const RACE_CAP_LOW = 1.2
const RACE_CAP_HIGH = 1.8
const BAND_MIN_RACE_FT = 300       // below this the race isn't a climbing target
// ±10% slack so being a hair under/over the band doesn't trip a warning.
const BAND_TOLERANCE = 0.10

interface ClimbBand {
  minFt: number
  maxFt: number
  /** True when weekly mileage (not race demand) is the binding ceiling. */
  volumeBound: boolean
}

/** Taper multiplier on the band as race day approaches. 1.0 outside the taper. */
function taperFactor(weeksOut: number | null): number {
  if (weeksOut === null || weeksOut < 0) return 1
  if (weeksOut >= 4) return 1
  if (weeksOut === 3) return 0.85
  if (weeksOut === 2) return 0.7
  if (weeksOut === 1) return 0.5
  return 0.35 // race week
}

function climbBand(raceGainFt: number, peakMiles: number, weeksOut: number | null): ClimbBand | null {
  if (raceGainFt < BAND_MIN_RACE_FT) return null
  const raceLow = raceGainFt * RACE_CAP_LOW
  const raceHigh = raceGainFt * RACE_CAP_HIGH

  let minFt = raceLow
  let maxFt = raceHigh
  let volumeBound = false
  if (peakMiles > 0) {
    const volLow = peakMiles * VERT_FT_PER_MILE_LOW
    const volHigh = peakMiles * VERT_FT_PER_MILE_HIGH
    minFt = Math.min(raceLow, volLow)
    maxFt = Math.min(raceHigh, volHigh)
    volumeBound = volHigh < raceHigh
  }

  const taper = taperFactor(weeksOut)
  return {
    minFt: Math.round(minFt * taper),
    maxFt: Math.round(maxFt * taper),
    volumeBound,
  }
}

type BandState = 'below' | 'in-band' | 'above'
function classify(ft: number, band: { minFt: number; maxFt: number }): BandState {
  if (ft < band.minFt * (1 - BAND_TOLERANCE)) return 'below'
  if (ft > band.maxFt * (1 + BAND_TOLERANCE)) return 'above'
  return 'in-band'
}

/** Whether the plan is in its taper window (band actively easing). */
function inTaper(weeksOut: number | null): boolean {
  return weeksOut !== null && weeksOut >= 0 && weeksOut <= 3
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
  const weeksOut = race?.date ? weeksUntilRace(race.date) : null

  // Peak weekly mileage the plan builds toward (or the most an athlete has
  // logged) — the volume that has to carry the climb. Drives the band anchor.
  const peakMiles = useMemo(
    () => weeks.reduce((peak, w) => Math.max(peak, w.plannedMiles || 0, w.actualMiles || 0), 0),
    [weeks],
  )
  const band = raceGainFt > 0 ? climbBand(raceGainFt, peakMiles, weeksOut) : null

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

  // During the taper, sitting below the (now-eased) band is on-plan, not a
  // shortfall — so don't flag it as a warning.
  const tapering = inTaper(weeksOut)
  const belowIsOk = state === 'below' && tapering
  const tone: 'default' | 'positive' | 'warning' = state === 'in-band' || belowIsOk
    ? 'positive'
    : state === 'below'
      ? 'warning'
      : 'default'
  const insightTone: 'positive' | 'warning' | 'intelligence' = state === 'in-band' || belowIsOk
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
  band: ClimbBand | null,
  state: BandState | null,
  weeksOut: number | null,
): string {
  const raceContext = weeksOut !== null && weeksOut > 0
    ? ` with ${weeksOut} week${weeksOut === 1 ? '' : 's'} to race day`
    : ''
  if (!band || !state) {
    return `${currentFt.toLocaleString()} ft of climb this week. Pick a race to see the target band.`
  }
  const cur = currentFt.toLocaleString()
  const bandStr = `${band.minFt.toLocaleString()}–${band.maxFt.toLocaleString()} ft`
  const tapering = inTaper(weeksOut)

  if (state === 'in-band') {
    return `${cur} ft of climb this week — squarely in the ${tapering ? 'eased taper' : 'race-ready'} band (${bandStr})${raceContext}. Hold the line.`
  }
  if (state === 'below') {
    if (tapering) {
      // Below the eased band during the taper is the plan working as intended.
      return `${cur} ft of climb this week — climb is easing into the ${bandStr} taper band${raceContext}. That's the taper doing its job; no need to chase vert now.`
    }
    const gap = Math.max(0, band.minFt - currentFt)
    // When mileage is the binding ceiling, more hill reps won't fix it — miles will.
    const fix = band.volumeBound
      ? 'Build weekly mileage to raise your climb ceiling — your volume, not the hills, is the limit right now.'
      : 'Add a hill session next week.'
    return `${cur} ft of climb this week — short ${gap.toLocaleString()} ft of the ${bandStr} band${raceContext}. ${fix}`
  }
  // above
  if (tapering) {
    return `${cur} ft of climb this week — above the ${bandStr} taper band${raceContext}. Ease off the vert; let your legs come around for race day.`
  }
  return `${cur} ft of climb this week — above the ${bandStr} band${raceContext}. Strong; watch recovery before pushing higher.`
}
