import { useMemo } from 'react'
import type { OnboardingConfig } from '../hooks/useOnboarding'
import type { WeekShape, WeekReshape } from '../engines/planGenerator/weekShape'
import { planForConfig, representativeWeek } from '../engines/planGenerator/shapeDefaults'
import { getWorkoutStyle } from '../utils/styles'

/**
 * The week the plan would actually build from a shape — the real
 * generator's output for one ordinary week, one row per day. This is what
 * makes a shape concrete before it is confirmed: not "Tuesday: quality"
 * but "Tue · Tempo 3×8 min". Never blocks: an unbuildable config renders
 * a one-line note.
 */
interface Props {
  config: OnboardingConfig
  shape: WeekShape
  /** Show the plan's week with this number (a mid-plan reshape); default
   *  is a representative ordinary week. */
  weekNum?: number
  /** For a mid-plan reshape: the reshape to apply instead of the base shape. */
  reshape?: WeekReshape
  title?: string
}

export default function WeekShapePreview({ config, shape, weekNum, reshape, title }: Props) {
  const week = useMemo(() => {
    const cfg: OnboardingConfig = reshape
      ? { ...config, weekReshapes: [...(config.weekReshapes ?? []).filter(r => r.fromWeek !== reshape.fromWeek), reshape] }
      : { ...config, weekShape: shape }
    const built = planForConfig(cfg)
    if (!built) return null
    if (weekNum != null) return built.plan.weeks.find(w => w.num === weekNum) ?? representativeWeek(built.plan)
    return representativeWeek(built.plan)
  }, [config, shape, weekNum, reshape])

  if (!week) return <p className="text-xs text-slate-500">The week can't be previewed yet.</p>

  return (
    <div data-testid="week-shape-preview">
      <p className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
        {title ?? `Week ${week.num} with this layout`}{week.miles ? ` · ~${week.miles} mi` : ''}
      </p>
      <div className="space-y-1">
        {week.days.map((d, i) => {
          const style = getWorkoutStyle(d.type, d.workout)
          return (
            <div key={i} className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs" style={{ backgroundColor: style.bg, borderLeft: `3px solid ${style.border}` }}>
              <span className="font-semibold text-slate-700 w-9 shrink-0">{d.day.split(' ')[0]}</span>
              <span className="text-slate-700 truncate">{d.workout}</span>
              {d.time && d.time !== '—' && <span className="ml-auto text-slate-500 shrink-0">{d.time}</span>}
            </div>
          )
        })}
      </div>
    </div>
  )
}
