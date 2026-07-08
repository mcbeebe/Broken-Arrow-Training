import type { DayCompliance, ComplianceGrade, PlannedTargets } from '../types'
import type { WeekCompliance } from '../hooks/useCompliance'
import { rebucketToPlanZones, type PlanZone } from '../utils/zones'

interface ComplianceWeekRowProps {
  week: WeekCompliance
  weekLabel?: string  // e.g. "Apr 13–19"
  weekFocus?: string  // week focus blurb
  planZones?: PlanZone[]  // athlete's own zone bands — bar renders in these
  /** Surface the per-day "Elev" row + weekly vert footer. Caller decides
   *  based on race profile — see utils/raceReadiness.shouldTrackVerticalGain. */
  showVertical?: boolean
}

const ZONE_COLORS = ['#94A3B8', '#3B82F6', '#22C55E', '#F59E0B', '#EF4444'] // Z1..Z5

/**
 * Weekly compliance row with proportional bars per metric per day.
 *   • Distance / Duration → fill-vs-target bar (dashed 100% target line)
 *   • HR → stacked zone-distribution bar with target-band outline
 */
export default function ComplianceWeekRow({ week, weekLabel, weekFocus, planZones, showVertical }: ComplianceWeekRowProps) {
  const days = (week.days || []).slice(0, 7)
  const anyDrillsPlanned = days.some(d => d.drillsPlanned)

  // ── G9: flexible consistency, not streaks ──────────────────────
  // The headline metric is sessions-done-vs-planned over days that have
  // actually happened — and a planned rest day KEPT counts as done (rest
  // is compliance, not a gap; BJHP 2025 / Milkman 2021: rigid streaks
  // backfire where rest is programmed). Grace: one flexed non-key session
  // doesn't take the week off track.
  const pastDays = days.filter(d => isPastDate(d.date))
  const restKept = pastDays.filter(d => isRestPlan(d.workoutType) && !d.hasActual).length
  const sessionsDone = week.completed + restKept
  const sessionsPlanned = pastDays.length
  const KEY_TYPES = new Set(['long', 'quality', 'race'])
  const missedPast = pastDays.filter(d =>
    !isRestPlan(d.workoutType) && !d.hasActual,
  )
  const missedKeyCount = missedPast.filter(d => KEY_TYPES.has(d.workoutType)).length
  const onTrack = missedPast.length === 0
    || (missedPast.length === 1 && missedKeyCount === 0)
  // Only render the Elev row when there's something to show — either the
  // plan prescribed climb on any day this week, or the athlete actually
  // logged climb (so a "bonus vert" day still surfaces).
  const anyElevation = showVertical && days.some(d =>
    (d.targets.elevationFt !== undefined && d.targets.elevationFt > 0)
    || (d.elevationActual !== undefined && d.elevationActual > 0),
  )

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl p-3 shadow-sm border border-slate-100 dark:border-slate-700">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div>
          <span className="text-sm font-medium text-slate-800 dark:text-white">Week {week.weekNum}</span>
          {weekLabel && <span className="text-xs text-slate-400 ml-2">{weekLabel}</span>}
        </div>
        <div className="flex gap-1">
          {week.completed > 0 && (
            <span className="text-[10px] bg-green-100 text-green-700 rounded-full px-1.5 py-0.5 font-medium">
              {week.completed} ✓
            </span>
          )}
          {week.missed > 0 && (
            <span className="text-[10px] bg-red-100 text-red-700 rounded-full px-1.5 py-0.5 font-medium">
              {week.missed} ✗
            </span>
          )}
          {week.flaggedCount > 0 && (
            <span className="text-[10px] bg-amber-100 text-amber-700 rounded-full px-1.5 py-0.5 font-medium">
              ⚠ {week.flaggedCount}
            </span>
          )}
        </div>
      </div>

      {/* G9 consistency headline — sessions vs planned, rest counts, grace
          for one flexed session. Deliberately NOT a streak. */}
      {sessionsPlanned > 0 && (
        <p className="text-[10px] text-slate-500 dark:text-slate-400 mb-2">
          <span className="font-semibold text-slate-700 dark:text-slate-200">
            {sessionsDone} of {sessionsPlanned} sessions
          </span>
          {' '}— rest days count
          {onTrack && missedPast.length === 1 && ' · on track (1 flexed session is fine)'}
          {onTrack && missedPast.length === 0 && sessionsPlanned >= 3 && ' · on track'}
        </p>
      )}

      {weekFocus && (
        <p className="text-[10px] text-slate-500 dark:text-slate-400 italic mb-2 line-clamp-1">{weekFocus}</p>
      )}

      {/* Per-day grid: columns = days, rows = metric bars */}
      <div className="space-y-1">
        {/* Day labels */}
        <div className="grid grid-cols-[28px_repeat(7,1fr)] gap-1 items-center">
          <div />
          {days.map((d, i) => (
            <div key={i} className="text-[9px] text-slate-400 text-center truncate">
              {dayInitial(d.day)}
            </div>
          ))}
        </div>

        {/* Distance row */}
        <MetricRow label="Dist" days={days} render={d => (
          isRestPlan(d.workoutType)
            ? <RestCell workoutType={d.workoutType} isPast={isPastDate(d.date)} />
            : <RatioBar pct={d.distancePct} grade={d.distanceGrade} />
        )} />

        {/* Duration row */}
        <MetricRow label="Dur" days={days} render={d => (
          isRestPlan(d.workoutType)
            ? <RestCell workoutType={d.workoutType} isPast={isPastDate(d.date)} />
            : <RatioBar pct={d.durationPct} grade={d.durationGrade} />
        )} />

        {/* Elev row — only for vert-heavy races, only when some day this week
            either planned vert or logged it. */}
        {anyElevation && (
          <MetricRow label="Elev" days={days} render={d => (
            isRestPlan(d.workoutType)
              ? <RestCell workoutType={d.workoutType} isPast={isPastDate(d.date)} />
              : <ElevationCell
                  plannedFt={d.targets.elevationFt}
                  actualFt={d.elevationActual}
                  pct={d.elevationPct}
                  grade={d.elevationGrade}
                />
          )} />
        )}

        {/* HR row — stacked zone bar w/ target band */}
        <MetricRow label="HR" days={days} render={d => (
          isRestPlan(d.workoutType)
            ? <RestCell workoutType={d.workoutType} isPast={isPastDate(d.date)} />
            : <ZoneBar
                summary={d.hrZoneSummary}
                grade={d.hrGrade}
                targets={d.targets}
                inZonePct={d.hrInZonePct}
                hrAvg={d.hrAvg}
                planZones={planZones}
              />
        )} />

        {/* Drills row — only shown if any day has planned drills */}
        {anyDrillsPlanned && (
          <MetricRow label="Drills" days={days} render={d => (
            <DrillCell
              planned={d.drillsPlanned}
              completed={d.drillsCompleted}
              grade={d.drillGrade}
              items={d.targets.drillItems}
            />
          )} />
        )}
      </div>

      {/* Footer */}
      <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-700 flex justify-between text-[10px] text-slate-500 dark:text-slate-400">
        <span className="flex flex-wrap items-center gap-x-2">
          <span>{week.actualMiles} / {week.plannedMiles} mi</span>
          {showVertical && (week.plannedElevation > 0 || week.actualElevation > 0) && (
            <span
              title={week.plannedElevation > 0
                ? `Weekly vert: ${formatFt(week.actualElevation)} climbed / ${formatFt(week.plannedElevation)} planned`
                : `Weekly vert: ${formatFt(week.actualElevation)} climbed (no per-day target)`
              }
            >
              ↑ {formatFt(week.actualElevation)}
              {week.plannedElevation > 0 ? ` / ${formatFt(week.plannedElevation)} ft` : ' ft'}
            </span>
          )}
        </span>
        {week.hrCompliance > 0 && (
          <span>HR in zone: <strong className="text-slate-700 dark:text-slate-200">{week.hrCompliance}%</strong></span>
        )}
      </div>

      {/* Zone legend */}
      <div className="mt-1.5 flex gap-2 text-[9px] text-slate-400 items-center">
        <span>Zones:</span>
        {[1, 2, 3, 4, 5].map(z => (
          <span key={z} className="flex items-center gap-0.5">
            <span className="w-2 h-2 rounded-sm inline-block" style={{ background: ZONE_COLORS[z - 1] }} />
            Z{z}
          </span>
        ))}
      </div>
    </div>
  )
}

function MetricRow({
  label,
  days,
  render,
}: {
  label: string
  days: DayCompliance[]
  render: (d: DayCompliance) => React.ReactNode
}) {
  return (
    <div className="grid grid-cols-[28px_repeat(7,1fr)] gap-1 items-center">
      <span className="text-[9px] font-semibold text-slate-500 dark:text-slate-400 uppercase">{label}</span>
      {days.map((d, i) => (
        <div key={i} className="h-3.5">{render(d)}</div>
      ))}
    </div>
  )
}

/**
 * Proportional fill bar for distance/duration.
 *   • 100% target = full width (dashed line marker)
 *   • Fill = min(pct, 1.3) so overshoots are visible but bounded
 *   • Color = grade color
 */
/** Non-color redundancy (G8): the ✗ glyph distinguishes "skipped" from
 *  "no target" without relying on the two grays being tellable apart. */
function SkippedCell() {
  return (
    <div className="h-full rounded-sm bg-slate-300 flex items-center justify-center" title="Skipped">
      <span className="text-[7px] leading-none text-slate-600 font-bold">✗</span>
    </div>
  )
}

function RatioBar({ pct, grade }: { pct?: number; grade: ComplianceGrade }) {
  if (pct === undefined || grade === 'na') {
    return <div className="h-full rounded-sm bg-slate-100 dark:bg-slate-700" title="No target" />
  }
  if (grade === 'skipped') {
    return <SkippedCell />
  }
  const displayPct = Math.min(pct, 1.3)
  const fillWidth = (displayPct / 1.3) * 100  // scale so 130% fills the track
  const targetPos = (1.0 / 1.3) * 100
  const color = gradeFill(grade)

  return (
    <div className="relative h-full rounded-sm bg-slate-100 dark:bg-slate-700 overflow-hidden" title={`${Math.round(pct * 100)}% of target`}>
      <div className="h-full rounded-sm" style={{ width: `${fillWidth}%`, background: color }} />
      {/* target line */}
      <div
        className="absolute top-0 bottom-0 border-r border-dashed border-slate-500"
        style={{ left: `${targetPos}%` }}
      />
    </div>
  )
}

/**
 * Stacked zone-distribution bar.
 *   • Width-proportional segments per zone (from hrZoneSummary)
 *   • Zones inside the target band get an outlined ring
 *   • If no summary: falls back to grade-colored bar using avgHR
 */
function ZoneBar({
  summary,
  grade,
  targets,
  inZonePct,
  hrAvg,
  planZones,
}: {
  summary?: { zone: number; seconds: number; lowHR?: number; highHR?: number }[]
  grade: ComplianceGrade
  targets: PlannedTargets
  inZonePct?: number
  hrAvg?: number
  planZones?: PlanZone[]
}) {
  if (grade === 'na') {
    return <div className="h-full rounded-sm bg-slate-100 dark:bg-slate-700" title="No HR target" />
  }
  if (grade === 'skipped') {
    return <SkippedCell />
  }

  const { hrLow, hrHigh } = targets

  if (summary && summary.length > 0 && hrLow !== undefined && hrHigh !== undefined && planZones && planZones.length > 0) {
    // Re-bucket device-reported zone seconds into the athlete's plan zones
    // via HR-range overlap. This way the visible Z1..Z5 colors correspond
    // to THIS athlete's zone system, not the device's.
    const rebucketed = rebucketToPlanZones(summary, planZones)
    const total = rebucketed.reduce((s, z) => s + z.seconds, 0)
    if (total <= 0) return <div className="h-full rounded-sm bg-slate-100 dark:bg-slate-700" />

    const titleParts = rebucketed
      .filter(z => z.seconds > 0)
      .map(z => `Z${z.zone} ${Math.round((z.seconds / total) * 100)}%`)
    const title = `${titleParts.join(' · ')}${inZonePct !== undefined ? ` — ${Math.round(inZonePct)}% in target` : ''}${hrAvg ? ` · avg ${hrAvg}` : ''}`

    return (
      <div className="flex h-full w-full rounded-sm overflow-hidden" title={title}>
        {rebucketed.map(z => {
          const pct = (z.seconds / total) * 100
          if (pct <= 0) return null
          // In-target if this plan zone overlaps the plan target HR band
          const inTarget = z.high >= hrLow && z.low <= hrHigh
          return (
            <div
              key={z.zone}
              style={{
                width: `${pct}%`,
                background: ZONE_COLORS[z.zone - 1],
                boxShadow: inTarget ? 'inset 0 0 0 1.5px rgba(15,23,42,0.7)' : undefined,
              }}
            />
          )
        })}
      </div>
    )
  }

  // No zone summary or no plan zones — fall back to grade-colored bar
  return (
    <div
      className="h-full rounded-sm"
      style={{ background: gradeFill(grade) }}
      title={hrAvg ? `avg HR ${hrAvg}` : undefined}
    />
  )
}

/**
 * Per-day elevation cell.
 *   • If the day had a planned vert target → ratio bar (same scale as Dist/Dur).
 *   • If only actual vert (bonus climb on a flat day) → muted indigo fill
 *     proportional to how much was climbed, so the day still reads as "vert
 *     happened" without faking a target.
 *   • Otherwise → empty grey track.
 */
function ElevationCell({
  plannedFt,
  actualFt,
  pct,
  grade,
}: {
  plannedFt?: number
  actualFt?: number
  pct?: number
  grade: ComplianceGrade
}) {
  if (plannedFt !== undefined && plannedFt > 0) {
    const title = `${formatFt(actualFt ?? 0)} of ${formatFt(plannedFt)} ft planned`
    return (
      <div title={title} className="h-full">
        <RatioBar pct={pct} grade={grade} />
      </div>
    )
  }
  if (actualFt !== undefined && actualFt > 0) {
    // Bonus vert with no plan target — show a fixed-width indigo tick so the
    // day reads as "climbed" without pretending the plan asked for it.
    return (
      <div
        className="h-full rounded-sm bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center"
        title={`+${formatFt(actualFt)} ft bonus vert (no plan target)`}
      >
        <span className="text-[8px] font-semibold text-indigo-700 dark:text-indigo-300 leading-none">
          +{formatFt(actualFt)}
        </span>
      </div>
    )
  }
  return <div className="h-full rounded-sm bg-slate-100 dark:bg-slate-700" title="No vert" />
}

function formatFt(ft: number): string {
  if (ft >= 1000) {
    const k = ft / 1000
    return `${k % 1 === 0 ? k : k.toFixed(1)}k`
  }
  return `${Math.round(ft)}`
}

/**
 * Drill cell — solid color indicating hit/miss/skipped. Title reveals
 * the planned drill items.
 */
function DrillCell({
  planned, completed, grade, items,
}: {
  planned: boolean
  completed: boolean
  grade: ComplianceGrade
  items?: string[]
}) {
  if (!planned || grade === 'na') {
    return <div className="h-full rounded-sm bg-slate-100 dark:bg-slate-700" title="No drills planned" />
  }
  const itemList = items?.join(' · ') ?? ''
  const title = completed
    ? `Drills done${itemList ? ` (${itemList})` : ''}`
    : `Drills planned but not completed${itemList ? ` (${itemList})` : ''}`
  return (
    <div
      className="h-full rounded-sm flex items-center justify-center text-[8px] font-bold text-white"
      style={{ background: gradeFill(grade) }}
      title={title}
    >
      {completed ? '✓' : '—'}
    </div>
  )
}

function gradeFill(grade: ComplianceGrade): string {
  switch (grade) {
    case 'hit': return '#22C55E'
    case 'close': return '#FBBF24'
    case 'over': return '#60A5FA'
    case 'miss': return '#EF4444'
    case 'skipped': return '#CBD5E1'
    case 'na': return '#F1F5F9'
  }
}

/** True for workout types that mean "planned rest / not training".
 *  These days should render distinct from 'no target' (empty grey)
 *  because resting was literally the plan. */
function isRestPlan(type: string): boolean {
  return type === 'rest' || type === 'travel'
}

/** Local YYYY-MM-DD for today. */
function todayISO(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

function isPastDate(iso?: string): boolean {
  if (!iso) return false
  return iso < todayISO()
}

/**
 * Rest-day cell.
 *   • Past rest day → emerald tint + ✓ ("rested as planned")
 *   • Today/future rest day → muted emerald tint, no ✓ (just "scheduled rest")
 * Distinct from skipped (dark grey) and no-target (light grey).
 */
function RestCell({ workoutType, isPast }: { workoutType: string; isPast: boolean }) {
  const label = workoutType === 'travel' ? 'Travel' : 'Rest'
  if (isPast) {
    return (
      <div
        className="h-full rounded-sm bg-emerald-100/70 flex items-center justify-center"
        title={`${label} — on plan`}
      >
        <span className="text-[7px] text-emerald-700 font-semibold leading-none">✓</span>
      </div>
    )
  }
  // Future / today — scheduled but not yet done. No ✓.
  return (
    <div
      className="h-full rounded-sm bg-emerald-50 border border-emerald-100"
      title={`${label} — scheduled`}
    />
  )
}

function dayInitial(dayLabel: string): string {
  const m = dayLabel.match(/^(\w{3})/)
  return m ? m[1].charAt(0) : '?'
}
