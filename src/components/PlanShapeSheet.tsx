import { useMemo, useState } from 'react'
import type { TrainingWeek } from '../types'
import type { OnboardingConfig } from '../hooks/useOnboarding'
import {
  WEEKDAY_LONG, roleLabel, validateWeekShape, shapeHasErrors, effectiveShape, changedWeekdays, sameShape,
  type WeekShape,
} from '../engines/planGenerator/weekShape'
import { defaultWeekShapeFor, methodForConfig, methodRunDayBounds } from '../engines/planGenerator/shapeDefaults'
import { planKindOf } from '../engines/benchmark/log'
import WeekShapeEditor from './WeekShapeEditor'
import WeekShapePreview from './WeekShapePreview'

/**
 * Plan tab → "Shape my week": change the whole plan's layout at once.
 *
 * Mike's rule for this feature: it must be obvious what is changing and
 * what is being confirmed. So the sheet shows the current layout, the
 * athlete edits it, and before the button it says exactly which weekdays
 * change ("Tuesday: Easy run → Strength"), from which week, what happens
 * to the days they hand-edited or pinned, and what the resulting week
 * looks like — built by the real generator. Two ways to apply, each
 * named for what it keeps:
 *
 *   Keep my edits — rewrite the remaining weeks in place. Plan edits,
 *   swaps and pins stay exactly as they are; undo is one tap.
 *   Rebuild fresh — regenerate the remaining weeks on the new layout as a
 *   new plan generation. Edits and swaps of the old plan are dropped; a
 *   backup is kept under Settings → Restore a previous plan.
 */

interface Props {
  config: OnboardingConfig
  /** The derived weeks (with edits, locks, actuals) — for the affected-day list. */
  weeks: TrainingWeek[]
  currentWeekNum: number
  todayIso: string
  onReshape: (shape: WeekShape, fromWeek: number) => void
  onRebuild: (shape: WeekShape, fromWeek: number) => void
  onClose: () => void
}

type Mode = 'in_place' | 'rebuild'

export default function PlanShapeSheet({ config, weeks, currentWeekNum, todayIso, onReshape, onRebuild, onClose }: Props) {
  const plan = planKindOf(config)
  const current = useMemo(() => effectiveShape(config, currentWeekNum) ?? defaultWeekShapeFor(config), [config, currentWeekNum])
  const [shape, setShape] = useState<WeekShape | null>(null)
  const value = shape ?? current
  const methodRunDays = useMemo(
    () => (plan === 'road' || plan === 'trail' ? methodRunDayBounds(methodForConfig(config)) : undefined),
    [config, plan],
  )
  const lastWeekNum = weeks.length ? weeks[weeks.length - 1].num : currentWeekNum
  // Default to next week when this week has already started (a day of it
  // is behind us); the athlete can pull it back to this week.
  const thisWeek = weeks.find(w => w.num === currentWeekNum)
  const weekStarted = !!thisWeek?.startIso && thisWeek.startIso < todayIso
  const [fromWeek, setFromWeek] = useState<number>(weekStarted && currentWeekNum < lastWeekNum ? currentWeekNum + 1 : currentWeekNum)
  const [mode, setMode] = useState<Mode>('in_place')

  const issues = useMemo(() => (current && value ? validateWeekShape(value, { plan, methodRunDays }) : []), [value, current, plan, methodRunDays])
  const changed = current && value ? changedWeekdays(current, value) : []
  const unchanged = !current || !value || sameShape(current, value)

  // Days from `fromWeek` on that the athlete shaped by hand: they behave
  // differently under each mode, so they are named before the button.
  const affected = useMemo(() => {
    const edited: string[] = [], pinned: string[] = []
    for (const w of weeks) {
      if (w.num < fromWeek) continue
      for (const d of w.days) {
        if (d.type === 'race') continue
        if (d.userEdited) edited.push(d.day)
        else if (d.locked) pinned.push(d.day)
      }
    }
    return { edited, pinned }
  }, [weeks, fromWeek])

  const reshape = value ? { fromWeek, shape: value, at: 0 } : null
  const canApply = !!value && !unchanged && !shapeHasErrors(issues)
  const span = fromWeek === lastWeekNum ? `week ${fromWeek}` : `weeks ${fromWeek}–${lastWeekNum}`

  if (!current || !value) {
    return (
      <Sheet onClose={onClose}><p className="text-sm text-slate-500 px-4 py-6">The plan can't be reshaped yet.</p></Sheet>
    )
  }

  return (
    <Sheet onClose={onClose}>
      <div className="sticky top-0 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-4 py-3 flex items-start justify-between gap-3">
        <div>
          <p className="font-bold text-slate-800 dark:text-white">Shape your week</p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Move the days, swap what a day does. Nothing changes until you confirm.</p>
        </div>
        <button onClick={onClose} aria-label="Close" className="text-slate-400 text-xl leading-none shrink-0">×</button>
      </div>

      <div className="px-4 py-3 space-y-4">
        <WeekShapeEditor value={value} onChange={setShape} plan={plan} defaultShape={current} methodRunDays={methodRunDays} highlight={changed} />

        <div>
          <p className="text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">Starting from</p>
          <div className="flex gap-1.5" role="radiogroup" aria-label="Starting week">
            {[currentWeekNum, currentWeekNum + 1].filter(n => n <= lastWeekNum).map(n => (
              <button key={n} type="button" role="radio" aria-checked={fromWeek === n} onClick={() => setFromWeek(n)}
                className={`flex-1 rounded-lg border px-2 py-2 text-sm font-semibold ${fromWeek === n ? 'border-teal-500 bg-teal-50 text-teal-800' : 'border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-400'}`}
                data-testid={`shape-from-${n}`}>
                {n === currentWeekNum ? `This week (${n})` : `Next week (${n})`}
              </button>
            ))}
          </div>
          {fromWeek === currentWeekNum && weekStarted && (
            <p className="text-[11px] text-amber-700 dark:text-amber-300 mt-1">This week has already started — days that have passed keep what you did; the rest of the week is laid out fresh.</p>
          )}
        </div>

        <div className={`rounded-lg px-3 py-2 ${unchanged ? 'bg-slate-50 dark:bg-slate-700/50' : 'bg-teal-50 dark:bg-teal-900/20'}`} data-testid="shape-changes">
          <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">What changes</p>
          {unchanged ? (
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Nothing yet — tap a day above.</p>
          ) : (
            <ul className="mt-0.5 space-y-0.5">
              {changed.map(wd => (
                <li key={wd} className="text-[11px] text-slate-700 dark:text-slate-200">
                  <span className="font-semibold">{WEEKDAY_LONG[wd]}:</span> {roleLabel(current[wd], plan)} → <span className="font-semibold">{roleLabel(value[wd], plan)}</span>
                </li>
              ))}
              <li className="text-[11px] text-slate-600 dark:text-slate-300 pt-1">Applies to {span}. Weeks before {fromWeek} stay as they were.</li>
            </ul>
          )}
        </div>

        {!unchanged && reshape && (
          <WeekShapePreview config={config} shape={value} reshape={reshape} weekNum={fromWeek} title={`Week ${fromWeek} with this layout`} />
        )}

        {!unchanged && (
          <div>
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">How to apply it</p>
            <div className="space-y-1.5" role="radiogroup" aria-label="How to apply">
              <ModeOption on={mode === 'in_place'} onClick={() => setMode('in_place')} testId="shape-mode-in-place"
                title="Keep my edits — rewrite the remaining weeks in place"
                body={[
                  `Weeks ${span.replace('weeks ', '').replace('week ', '')} are laid out on the new shape.`,
                  affected.edited.length ? `Your ${affected.edited.length} hand-edited day${affected.edited.length === 1 ? '' : 's'} (${affected.edited.slice(0, 4).join(', ')}${affected.edited.length > 4 ? '…' : ''}) stay exactly as you edited them and do not follow the new shape.` : 'No hand-edited days ahead, so nothing needs keeping.',
                  affected.pinned.length ? `${affected.pinned.length} pinned day${affected.pinned.length === 1 ? '' : 's'} (${affected.pinned.slice(0, 4).join(', ')}) keep their pin but get the new layout.` : '',
                  'Undo is one tap afterwards.',
                ].filter(Boolean).join(' ')}
              />
              <ModeOption on={mode === 'rebuild'} onClick={() => setMode('rebuild')} testId="shape-mode-rebuild"
                title="Rebuild fresh — regenerate the remaining weeks"
                body={[
                  `Weeks ${span.replace('weeks ', '').replace('week ', '')} are generated again from scratch on the new shape.`,
                  affected.edited.length ? `Your ${affected.edited.length} hand-edited day${affected.edited.length === 1 ? '' : 's'} and any swaps are dropped.` : 'No hand-edited days ahead to lose.',
                  "Today's plan is backed up first — Settings → Restore a previous plan brings it back.",
                ].join(' ')}
              />
            </div>
          </div>
        )}
      </div>

      <div className="px-4 pb-5 pt-1">
        <button
          type="button" disabled={!canApply}
          onClick={() => { if (!value) return; (mode === 'in_place' ? onReshape : onRebuild)(value, fromWeek); onClose() }}
          className="w-full h-11 rounded-xl bg-teal-700 hover:bg-teal-800 disabled:opacity-50 text-white text-sm font-bold"
          data-testid="shape-confirm"
        >
          {unchanged ? 'Change a day to continue' : mode === 'in_place' ? `Rewrite ${span}, keep my edits` : `Rebuild ${span} fresh`}
        </button>
      </div>
    </Sheet>
  )
}

function ModeOption({ on, onClick, title, body, testId }: { on: boolean; onClick: () => void; title: string; body: string; testId: string }) {
  return (
    <button type="button" role="radio" aria-checked={on} onClick={onClick} data-testid={testId}
      className={`w-full text-left rounded-xl border px-3 py-2 ${on ? 'border-teal-500 bg-teal-50 dark:bg-teal-900/20' : 'border-slate-200 dark:border-slate-600'}`}>
      <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{title}</p>
      <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5">{body}</p>
    </button>
  )
}

function Sheet({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="relative bg-white dark:bg-slate-800 w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl max-h-[85dvh] overflow-y-auto shadow-xl"
        onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Shape your week"
      >
        {children}
      </div>
    </div>
  )
}

