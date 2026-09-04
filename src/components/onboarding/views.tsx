import { useEffect } from 'react'
import type { ExtrasFitAssessment } from '../../engines/planGenerator/extrasFit'

/**
 * The leaf views of onboarding: no state of their own, no knowledge of the
 * flow, no data fetching. Pulled out of Onboarding.tsx so the component that
 * runs the flow is about the flow.
 *
 * WeekBreakdown is the one that carries a real promise to the athlete, and it
 * is tested as such — see __tests__/onboardingViews.test.tsx.
 */

export function GeneratingScreen({ message }: { message: string }) {
  // iOS Safari scrolls the page body to keep focused inputs visible above
  // the on-screen keyboard. That scroll persists across renders, so a
  // newly mounted fixed overlay can end up above the visible viewport and
  // the user sees a blank screen until they swipe down. Reset the scroll
  // position (and any lingering input focus) so the screen renders where
  // the user expects.
  useEffect(() => {
    if (typeof document !== 'undefined') {
      const active = document.activeElement as HTMLElement | null
      if (active && typeof active.blur === 'function') active.blur()
    }
    if (typeof window !== 'undefined') {
      window.scrollTo(0, 0)
    }
  }, [])

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col items-center justify-center px-6 text-center">
      <div className="relative w-16 h-16 mb-6">
        <div className="absolute inset-0 rounded-full border-4 border-teal-100" />
        <div className="absolute inset-0 rounded-full border-4 border-teal-500 border-t-transparent animate-spin" />
      </div>
      <h1 className="text-2xl font-bold text-slate-900">Building your plan</h1>
      <p className="text-base text-slate-500 mt-3 max-w-xs">{message}</p>
      <p className="text-xs text-slate-400 mt-6">This only takes a moment.</p>
    </div>
  )
}

/**
 * Live preview of how the days/week budget will be allocated.
 *
 * The plan generator treats `trainingDaysPerWeek` as a TOTAL: strength
 * and cross-training count against the budget rather than stacking on
 * top. This panel makes that visible while the user is still on the
 * Strength step so they can adjust before submission.
 *
 * The exact run count can shift after method selection (some methods
 * have minimum running-day patterns) — the caption notes that without
 * burying the user in detail.
 */
export function WeekBreakdown({
  daysPerWeek,
  strengthDays,
  crossDays,
  fit,
}: {
  daysPerWeek: number | null
  strengthDays: number
  crossDays: number
  /** Decision 6c — the method-aware fit forecast (road / trail, extras > 0).
   *  When present it OVERRIDES the naive split below, because the running
   *  method's floor decides the real run count, not `days − extras`. */
  fit?: ExtrasFitAssessment | null
}) {
  if (daysPerWeek == null) return null

  // Method-aware truth: the plan's running floor fills the week and squeezes
  // (or drops) the extras. Say so here, before the plan is generated, rather
  // than in an advisory on a plan the athlete already committed to.
  if (fit && fit.overBudget) {
    const extras = fit.extrasRequested
    return (
      <div className="rounded-xl p-3 border border-amber-300 bg-amber-50 dark:bg-amber-950 dark:border-amber-800" data-testid="week-breakdown-overbudget">
        <p className="text-xs font-semibold mb-1 text-amber-800 dark:text-amber-200">
          Your {daysPerWeek}-day week — the running comes first
        </p>
        <p className="text-sm text-amber-900 dark:text-amber-100">
          {fit.runningDaysActual} running · {fit.extrasThatFit} of your {extras} strength/cross
        </p>
        <p className="text-xs text-amber-800 dark:text-amber-200 mt-1">
          {fit.noneFit
            ? `${fit.methodName} needs at least ${fit.minRunDays} running days a week, which already fills the ${fit.dayBudget} days you picked — so none of your strength or cross-training would be scheduled. Running is what the race is scored on, so it wins.`
            : `${fit.methodName} needs at least ${fit.minRunDays} running days, so only ${fit.extrasThatFit} of your ${extras} strength/cross ${fit.extrasThatFit === 1 ? 'day fits' : 'days fit'} — the week runs a day over to make room.`}
        </p>
        <p className="text-xs text-amber-700 dark:text-amber-300 mt-1.5">
          To fit all of it: train {fit.daysForAll} days a week, ask for fewer strength/cross days, or keep this plan and add these sessions yourself on an easy-run day — they won't be in the plan.
        </p>
      </div>
    )
  }

  // Fallback (Hyrox / general / no extras / clean fit): the pre-6c split.
  const cross = crossDays
  const extras = strengthDays + cross
  const runs = fit ? fit.runningDaysActual : Math.max(0, daysPerWeek - extras)
  const over = !fit && extras > daysPerWeek

  return (
    <div className={`rounded-xl p-3 border ${over ? 'border-amber-300 bg-amber-50' : 'border-teal-200 bg-teal-50'}`}>
      <p className={`text-xs font-semibold mb-1 ${over ? 'text-amber-800' : 'text-teal-800'}`}>
        Your {daysPerWeek}-day week
      </p>
      <p className={`text-sm ${over ? 'text-amber-900' : 'text-teal-900'}`}>
        {runs} running · {strengthDays} strength · {cross} cross-training
      </p>
      {over ? (
        <p className="text-xs text-amber-700 mt-1">
          Strength + cross exceed your {daysPerWeek}-day budget. We'll trim them to fit.
        </p>
      ) : (
        <p className="text-xs text-teal-700 mt-1">
          We'll pick a training method that matches this split — your exact run count may shift by ±1.
        </p>
      )}
    </div>
  )
}

export function HealthQuestion({ label, value, onChange }: {
  label: string
  value: boolean | null
  onChange: (v: boolean | null) => void
}) {
  return (
    <div>
      <p className="text-sm font-medium text-slate-700 mb-1.5">{label}</p>
      <div className="flex gap-1.5" role="radiogroup" aria-label={label}>
        {([['No', false], ['Yes', true]] as const).map(([txt, v]) => (
          <button
            key={txt}
            type="button"
            role="radio"
            aria-checked={value === v}
            onClick={() => onChange(value === v ? null : v)}
            className={`flex-1 rounded-lg border px-2 py-2 text-sm font-semibold ${
              value === v ? 'border-teal-500 bg-teal-50 text-teal-800' : 'border-slate-200 text-slate-500'
            }`}
          >{txt}</button>
        ))}
      </div>
    </div>
  )
}

export function SummaryCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <p className="text-xs uppercase tracking-wide font-bold text-slate-500 mb-1">{label}</p>
      {children}
    </div>
  )
}

export function StepContainer({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900 leading-tight">{title}</h1>
      {subtitle && <p className="text-sm text-slate-500 mt-1 mb-5">{subtitle}</p>}
      <div className="space-y-3 mt-4">{children}</div>
    </div>
  )
}

export function OptionCard({ selected, onClick, title, desc, icon, multi }: {
  selected: boolean; onClick: () => void; title: string; desc?: string; icon?: string; multi?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-4 rounded-xl border-2 transition ${
        selected
          ? 'border-teal-500 bg-teal-50'
          : 'border-slate-200 bg-slate-50 hover:border-slate-300'
      }`}
    >
      <div className="flex items-start gap-3">
        {icon && (
          <span className="text-2xl mt-0.5">
            {icon === 'mountain' ? '🏔' : icon === 'hyrox' ? '🏋️' : icon === 'general' ? '💪' : icon === 'garmin' ? '⌚' : icon === 'apple' ? '⌚' : icon === 'oura' ? '💍' : icon}
          </span>
        )}
        <div className="flex-1">
          <p className={`font-semibold ${selected ? 'text-teal-800' : 'text-slate-800'}`}>{title}</p>
          {desc && <p className="text-sm text-slate-500 mt-0.5">{desc}</p>}
        </div>
        <div className={`${multi ? 'rounded' : 'rounded-full'} w-5 h-5 border-2 mt-0.5 flex items-center justify-center shrink-0 ${
          selected ? 'border-teal-500 bg-teal-500' : 'border-slate-300'
        }`}>
          {selected && <svg width="12" height="12" fill="white" viewBox="0 0 20 20"><path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" /></svg>}
        </div>
      </div>
    </button>
  )
}
