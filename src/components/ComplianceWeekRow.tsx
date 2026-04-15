import type { DayCompliance, ComplianceGrade } from '../types'
import type { WeekCompliance } from '../hooks/useCompliance'

interface ComplianceWeekRowProps {
  week: WeekCompliance
  weekLabel?: string  // e.g. "Apr 13–19"
  weekFocus?: string  // week focus blurb
}

const METRICS: { key: 'distance' | 'duration' | 'hr'; label: string }[] = [
  { key: 'distance', label: 'Dist' },
  { key: 'duration', label: 'Dur' },
  { key: 'hr', label: 'HR' },
]

/**
 * Weekly compliance row — renders one card per week with:
 *   - Header (week #, dates, completed/missed/flagged counts)
 *   - Per-day mini-matrix (rows = metric, cols = day of week)
 *   - Each cell is a colored dot indicating compliance grade
 */
export default function ComplianceWeekRow({ week, weekLabel, weekFocus }: ComplianceWeekRowProps) {
  // Safeguard for weeks that haven't been fully processed yet
  const days = week.days || []

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

      {/* Per-day grid: each column is a day, each row is a metric */}
      <div className="space-y-1">
        {/* Day labels header row */}
        <div className="grid grid-cols-[36px_repeat(7,1fr)] gap-1 items-center">
          <div />
          {days.slice(0, 7).map((d, i) => (
            <div key={i} className="text-[9px] text-slate-400 text-center truncate">
              {dayInitial(d.day)}
            </div>
          ))}
        </div>
        {/* Metric rows */}
        {METRICS.map(metric => (
          <div key={metric.key} className="grid grid-cols-[36px_repeat(7,1fr)] gap-1 items-center">
            <span className="text-[9px] font-semibold text-slate-500 uppercase">{metric.label}</span>
            {days.slice(0, 7).map((d, i) => (
              <ComplianceCell key={i} day={d} metric={metric.key} />
            ))}
          </div>
        ))}
      </div>

      {/* Footer: totals */}
      <div className="mt-2 pt-2 border-t border-slate-100 flex justify-between text-[10px] text-slate-500">
        <span>{week.actualMiles} / {week.plannedMiles} mi</span>
        {week.hrCompliance > 0 && (
          <span>HR in zone: <strong className="text-slate-700">{week.hrCompliance}%</strong></span>
        )}
      </div>
    </div>
  )
}

function ComplianceCell({ day, metric }: { day: DayCompliance; metric: 'distance' | 'duration' | 'hr' }) {
  let grade: ComplianceGrade
  let pct: number | undefined
  switch (metric) {
    case 'distance':
      grade = day.distanceGrade
      pct = day.distancePct
      break
    case 'duration':
      grade = day.durationGrade
      pct = day.durationPct
      break
    case 'hr':
      grade = day.hrGrade
      pct = day.hrInZonePct !== undefined ? day.hrInZonePct / 100 : undefined
      break
  }

  const bg = gradeBg(grade)
  const label = cellLabel(day, metric)

  return (
    <div
      className={`h-4 rounded flex items-center justify-center ${bg}`}
      title={`${day.day} · ${metric}: ${label}${pct !== undefined ? ` (${Math.round(pct * (metric === 'hr' ? 100 : 100))}%)` : ''}`}
    />
  )
}

function gradeBg(grade: ComplianceGrade): string {
  switch (grade) {
    case 'hit': return 'bg-green-500'
    case 'close': return 'bg-amber-400'
    case 'over': return 'bg-blue-400'
    case 'miss': return 'bg-red-500'
    case 'skipped': return 'bg-slate-300'
    case 'na': return 'bg-slate-100'
  }
}

function cellLabel(day: DayCompliance, metric: 'distance' | 'duration' | 'hr'): string {
  const grade = metric === 'distance' ? day.distanceGrade
    : metric === 'duration' ? day.durationGrade
    : day.hrGrade
  switch (grade) {
    case 'hit': return 'on target'
    case 'close': return 'close'
    case 'miss': return 'missed'
    case 'over': return 'over'
    case 'skipped': return 'skipped'
    case 'na': return 'no target'
  }
}

function dayInitial(dayLabel: string): string {
  // "Mon 4/13" → "M"
  const m = dayLabel.match(/^(\w{3})/)
  return m ? m[1].charAt(0) : '?'
}
