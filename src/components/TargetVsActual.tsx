import type { DayCompliance, ComplianceGrade } from '../types'
import { formatMiles, formatSeconds } from '../utils/format'

interface TargetVsActualProps {
  compliance: DayCompliance
}

/**
 * Compact Target vs Actual grid rendered inside DayCard when a workout
 * has been logged. Shows distance / duration / HR side-by-side with
 * grade dots (hit / close / miss / over).
 */
export default function TargetVsActual({ compliance }: TargetVsActualProps) {
  const { targets, distanceActual, distancePct, distanceGrade,
    durationActual, durationPct, durationGrade,
    hrAvg, hrInZonePct, hrGrade,
    flagReasons } = compliance

  // No structured targets to compare against — nothing to show
  const hasAnyTarget = targets.distanceMi !== undefined
    || targets.durationMin !== undefined
    || targets.hrLow !== undefined
  if (!hasAnyTarget) return null

  return (
    <div className="mt-2 pt-2 border-t border-slate-200/50">
      <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
        Target vs Actual
      </p>
      <div className="grid grid-cols-3 gap-2">
        {/* Distance */}
        {targets.distanceMi !== undefined && (
          <MetricRow
            label="Dist"
            target={`${targets.distanceMi} mi`}
            actual={distanceActual !== undefined ? formatMiles(distanceActual) : '—'}
            pct={distancePct}
            grade={distanceGrade}
          />
        )}
        {/* Duration — prefer running-time range when present */}
        {(targets.durationMinLow !== undefined || targets.durationMin !== undefined) && (
          <MetricRow
            label="Dur"
            target={
              targets.durationMinLow !== undefined && targets.durationMinHigh !== undefined
                ? `${targets.durationMinLow}–${targets.durationMinHigh} min`
                : `${targets.durationMin} min`
            }
            actual={durationActual !== undefined ? formatSeconds(durationActual * 60) : '—'}
            pct={durationPct}
            grade={durationGrade}
          />
        )}
        {/* HR */}
        {targets.hrLow !== undefined && targets.hrHigh !== undefined && (
          <MetricRow
            label="HR"
            target={`${targets.hrLow}–${targets.hrHigh}`}
            actual={
              hrInZonePct !== undefined
                ? `${hrAvg ? `${hrAvg} avg` : '—'} · ${Math.round(hrInZonePct)}%`
                : hrAvg
                  ? `${hrAvg} avg`
                  : '—'
            }
            grade={hrGrade}
            actualSuffix={hrInZonePct !== undefined ? 'in zone' : undefined}
          />
        )}
      </div>

      {/* Flag reasons */}
      {flagReasons.length > 0 && (
        <div className="mt-1.5 text-[10px] text-amber-700 leading-snug">
          ⚠️ {flagReasons.join(' · ')}
        </div>
      )}
    </div>
  )
}

function MetricRow({
  label,
  target,
  actual,
  pct,
  grade,
  actualSuffix,
}: {
  label: string
  target: string
  actual: string
  pct?: number
  grade: ComplianceGrade
  actualSuffix?: string
}) {
  const dot = gradeDotClass(grade)
  const pctText = pct !== undefined && grade !== 'na' ? `${Math.round(pct * 100)}%` : ''

  return (
    <div className="text-[10px] leading-tight">
      <div className="flex items-center gap-1 text-slate-400 uppercase font-semibold tracking-wide">
        <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
        <span>{label}</span>
        {pctText && <span className="ml-auto text-slate-400 font-normal">{pctText}</span>}
      </div>
      <div className="text-slate-500 mt-0.5">{target}</div>
      <div className="text-slate-800 font-medium">
        {actual}
        {actualSuffix && <span className="text-slate-400 font-normal"> {actualSuffix}</span>}
      </div>
    </div>
  )
}

function gradeDotClass(grade: ComplianceGrade): string {
  switch (grade) {
    case 'hit': return 'bg-green-500'
    case 'close': return 'bg-amber-400'
    case 'miss': return 'bg-red-500'
    case 'over': return 'bg-blue-400'
    case 'skipped': return 'bg-slate-400'
    case 'na': return 'bg-slate-200'
  }
}
