import { useMemo, useState } from 'react'
import {
  WEEKDAYS, WEEKDAY_SHORT, WEEKDAY_LONG, DAY_ROLES, roleLabel, roleShort, describeCounts, validateWeekShape, sameShape,
  type DayRole, type Weekday, type WeekShape, type ShapeIssue,
} from '../engines/planGenerator/weekShape'

/**
 * The week, as seven tiles the athlete can change. Tap a day, pick what
 * it does; the strip, the counts and the validation update as they go.
 *
 * Tap-to-pick rather than drag: it works one-handed on a phone, needs no
 * gesture to discover, and a tap on a tile says exactly which day is
 * being changed — the whole point is that the athlete knows what they
 * are confirming. The engines' laws are the editor's: an error blocks
 * Continue and says why; a warning is said and allowed.
 */

export type ShapePlan = 'road' | 'trail' | 'hyrox' | 'general'

interface Props {
  value: WeekShape
  onChange: (next: WeekShape) => void
  plan: ShapePlan
  /** The layout the engine would choose on its own — "Reset" goes here. */
  defaultShape?: WeekShape | null
  /** Running-day bounds of the chosen method (road/trail), for the warning. */
  methodRunDays?: { min: number; max: number; name?: string }
  /** Weekdays to call out as changed (the Plan tab's diff). */
  highlight?: Weekday[]
  /** Roles this plan offers. Defaults to all six. */
  roles?: readonly DayRole[]
}

const ROLE_STYLE: Record<DayRole, { bg: string; ring: string; ink: string; dot: string }> = {
  long:     { bg: 'bg-violet-100 dark:bg-violet-900/50', ring: 'ring-violet-500', ink: 'text-violet-900 dark:text-violet-100', dot: 'bg-violet-500' },
  quality:  { bg: 'bg-rose-100 dark:bg-rose-900/50',     ring: 'ring-rose-500',   ink: 'text-rose-900 dark:text-rose-100',     dot: 'bg-rose-500' },
  run:      { bg: 'bg-teal-100 dark:bg-teal-900/50',     ring: 'ring-teal-500',   ink: 'text-teal-900 dark:text-teal-100',     dot: 'bg-teal-500' },
  strength: { bg: 'bg-amber-100 dark:bg-amber-900/50',   ring: 'ring-amber-500',  ink: 'text-amber-900 dark:text-amber-100',   dot: 'bg-amber-500' },
  cross:    { bg: 'bg-sky-100 dark:bg-sky-900/50',       ring: 'ring-sky-500',    ink: 'text-sky-900 dark:text-sky-100',       dot: 'bg-sky-500' },
  rest:     { bg: 'bg-slate-100 dark:bg-slate-700/60',   ring: 'ring-slate-400',  ink: 'text-slate-600 dark:text-slate-300',   dot: 'bg-slate-400' },
}


export default function WeekShapeEditor({ value, onChange, plan, defaultShape, methodRunDays, highlight, roles }: Props) {
  const [selected, setSelected] = useState<Weekday | null>(null)
  const issues = useMemo(() => validateWeekShape(value, { plan, methodRunDays }), [value, plan, methodRunDays])
  const errors = issues.filter(i => i.severity === 'error')
  const warnings = issues.filter(i => i.severity === 'warn')
  const offered = roles ?? DAY_ROLES
  const isDefault = defaultShape ? sameShape(value, defaultShape) : false

  return (
    <div data-testid="week-shape-editor">
      <div className="grid grid-cols-7 gap-1" role="group" aria-label="Your week">
        {WEEKDAYS.map(wd => {
          const role = value[wd]
          const st = ROLE_STYLE[role]
          const isSel = selected === wd
          const changed = highlight?.includes(wd)
          return (
            <button
              key={wd} type="button"
              onClick={() => setSelected(isSel ? null : wd)}
              aria-pressed={isSel}
              aria-label={`${WEEKDAY_LONG[wd]}: ${roleLabel(role, plan)}`}
              data-testid={`shape-day-${wd}`}
              className={`rounded-xl px-1 py-2 text-center ${st.bg} ${st.ink} ${isSel ? `ring-2 ${st.ring}` : changed ? 'ring-2 ring-offset-1 ring-slate-400 dark:ring-slate-500' : ''}`}
            >
              <span className="block text-[10px] font-semibold uppercase tracking-wide opacity-70">{WEEKDAY_SHORT[wd]}</span>
              <span className="block text-[11px] font-bold leading-tight mt-0.5">{roleShort(role, plan)}</span>
              {changed && <span className="block text-[10px] mt-0.5 opacity-70">changed</span>}
            </button>
          )
        })}
      </div>

      {selected != null ? (
        <div className="mt-2 rounded-xl border border-slate-200 dark:border-slate-600 px-3 py-2" data-testid="shape-role-picker">
          <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1.5">{WEEKDAY_LONG[selected]} is a…</p>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={`${WEEKDAY_LONG[selected]} role`}>
            {offered.map(r => {
              const st = ROLE_STYLE[r]
              const on = value[selected] === r
              return (
                <button
                  key={r} type="button" role="radio" aria-checked={on}
                  onClick={() => { onChange({ ...value, [selected]: r }); }}
                  className={`rounded-lg px-2.5 py-1.5 text-xs font-bold ${st.bg} ${st.ink} ${on ? `ring-2 ${st.ring}` : ''}`}
                  data-testid={`shape-role-${r}`}
                >{roleLabel(r, plan)}</button>
              )
            })}
          </div>
        </div>
      ) : (
        <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">Tap a day to change what it does.</p>
      )}

      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="text-xs text-slate-600 dark:text-slate-300" data-testid="shape-summary">{describeCounts(value, plan)}</p>
        {defaultShape && !isDefault && (
          <button type="button" onClick={() => { onChange(defaultShape); setSelected(null) }} className="text-[11px] font-semibold text-teal-700 dark:text-teal-300 shrink-0" data-testid="shape-reset">
            Reset to the plan's own layout
          </button>
        )}
      </div>

      {(errors.length > 0 || warnings.length > 0) && (
        <ul className="mt-2 space-y-1" data-testid="shape-issues">
          {errors.map(i => <Issue key={i.code} issue={i} />)}
          {warnings.map(i => <Issue key={i.code} issue={i} />)}
        </ul>
      )}
    </div>
  )
}

function Issue({ issue }: { issue: ShapeIssue }) {
  const err = issue.severity === 'error'
  return (
    <li className={`text-[11px] rounded-lg px-2.5 py-1.5 ${err ? 'bg-red-50 text-red-800 dark:bg-red-900/30 dark:text-red-200' : 'bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200'}`} data-severity={issue.severity}>
      {err ? '⛔ ' : '⚠️ '}{issue.message}
    </li>
  )
}
