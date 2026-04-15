import type { DayCompliance, ComplianceGrade, PlannedTargets } from '../types'
import type { WeekCompliance } from '../hooks/useCompliance'
import { rebucketToPlanZones, type PlanZone } from '../utils/zones'

interface ComplianceWeekRowProps {
  week: WeekCompliance
  weekLabel?: string  // e.g. "Apr 13–19"
  weekFocus?: string  // week focus blurb
  planZones?: PlanZone[]  // athlete's own zone bands — bar renders in these
}

const ZONE_COLORS = ['#94A3B8', '#3B82F6', '#22C55E', '#F59E0B', '#EF4444'] // Z1..Z5

/**
 * Weekly compliance row with proportional bars per metric per day.
 *   • Distance / Duration → fill-vs-target bar (dashed 100% target line)
 *   • HR → stacked zone-distribution bar with target-band outline
 */
export default function ComplianceWeekRow({ week, weekLabel, weekFocus, planZones }: ComplianceWeekRowProps) {
  const days = (week.days || []).slice(0, 7)

  return (
    <div className="bg-white rounded-xl p-3 shadow-sm border border-slate-100">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div>
          <span className="text-sm font-medium text-slate-800">Week {week.weekNum}</span>
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

      {weekFocus && (
        <p className="text-[10px] text-slate-500 italic mb-2 line-clamp-1">{weekFocus}</p>
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
          <RatioBar pct={d.distancePct} grade={d.distanceGrade} />
        )} />

        {/* Duration row */}
        <MetricRow label="Dur" days={days} render={d => (
          <RatioBar pct={d.durationPct} grade={d.durationGrade} />
        )} />

        {/* HR row — stacked zone bar w/ target band */}
        <MetricRow label="HR" days={days} render={d => (
          <ZoneBar
            summary={d.hrZoneSummary}
            grade={d.hrGrade}
            targets={d.targets}
            inZonePct={d.hrInZonePct}
            hrAvg={d.hrAvg}
            planZones={planZones}
          />
        )} />
      </div>

      {/* Footer */}
      <div className="mt-2 pt-2 border-t border-slate-100 flex justify-between text-[10px] text-slate-500">
        <span>{week.actualMiles} / {week.plannedMiles} mi</span>
        {week.hrCompliance > 0 && (
          <span>HR in zone: <strong className="text-slate-700">{week.hrCompliance}%</strong></span>
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
      <span className="text-[9px] font-semibold text-slate-500 uppercase">{label}</span>
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
function RatioBar({ pct, grade }: { pct?: number; grade: ComplianceGrade }) {
  if (pct === undefined || grade === 'na') {
    return <div className="h-full rounded-sm bg-slate-100" title="No target" />
  }
  if (grade === 'skipped') {
    return <div className="h-full rounded-sm bg-slate-300" title="Skipped" />
  }
  const displayPct = Math.min(pct, 1.3)
  const fillWidth = (displayPct / 1.3) * 100  // scale so 130% fills the track
  const targetPos = (1.0 / 1.3) * 100
  const color = gradeFill(grade)

  return (
    <div className="relative h-full rounded-sm bg-slate-100 overflow-hidden" title={`${Math.round(pct * 100)}% of target`}>
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
    return <div className="h-full rounded-sm bg-slate-100" title="No HR target" />
  }
  if (grade === 'skipped') {
    return <div className="h-full rounded-sm bg-slate-300" title="Skipped" />
  }

  const { hrLow, hrHigh } = targets

  if (summary && summary.length > 0 && hrLow !== undefined && hrHigh !== undefined && planZones && planZones.length > 0) {
    // Re-bucket device-reported zone seconds into the athlete's plan zones
    // via HR-range overlap. This way the visible Z1..Z5 colors correspond
    // to THIS athlete's zone system, not the device's.
    const rebucketed = rebucketToPlanZones(summary, planZones)
    const total = rebucketed.reduce((s, z) => s + z.seconds, 0)
    if (total <= 0) return <div className="h-full rounded-sm bg-slate-100" />

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

function dayInitial(dayLabel: string): string {
  const m = dayLabel.match(/^(\w{3})/)
  return m ? m[1].charAt(0) : '?'
}
