import { useState } from 'react'
import type { OnboardingConfig } from '../hooks/useOnboarding'
import { usePlanImport, type PlanImportDeps } from '../hooks/usePlanImport'
import { usePlanPick } from '../hooks/usePlanPick'
import { todayDateString } from '../utils/planDates'
import ImportReview from './ImportReview'
import PlanPickFields from './PlanPickFields'
import { PlanImportProblem, PlanReading, PlanSaveFailed } from './PlanImportStatus'

/**
 * "Upload my own plan" (initiative 004, PR 5): pick a file, a photo or pasted
 * text → our reader turns it into weeks → the athlete checks it → it replaces
 * their plan. Nothing changes until "Use this plan".
 *
 * Same sheet idiom as BenchmarkSheet: backdrop closes, 85dvh so the header
 * stays reachable on iOS. While a plan is being read or reviewed, closing
 * asks first: that read used one of the day's uploads.
 */

interface Props {
  /** The athlete's current config, the base the plan is saved on. */
  base: OnboardingConfig
  /** Saves the plan; false when it couldn't be saved. */
  onUse: (cfg: OnboardingConfig) => boolean
  onClose: () => void
  todayIso?: string
  /** Injectable for tests (fetch, base URL, photo resizing). */
  deps?: PlanImportDeps
}

/** The upload sheet; see the module comment. */
export default function PlanImportSheet({ base, onUse, onClose, todayIso, deps }: Props) {
  const { state, read, reset } = usePlanImport(deps)
  // The plan the athlete approved, kept when saving it failed (a full
  // phone), so trying again costs no second read.
  const [failed, setFailed] = useState<{ cfg: OnboardingConfig; tries: number } | null>(null)
  const startOver = () => {
    setFailed(null)
    reset()
  }
  const pick = usePlanPick(startOver)
  const today = todayIso ?? todayDateString()

  const busy = state.step === 'reading' || state.step === 'review'
  const close = () => {
    if (busy && !confirm(state.step === 'reading'
      ? 'Stop reading this plan? It still counts as one of today’s uploads.'
      : 'Close without using this plan? Your current plan stays as it is.')) return
    onClose()
  }

  const use = (cfg: OnboardingConfig) => {
    if (onUse(cfg)) setFailed(null)
    else setFailed(prev => ({ cfg, tries: (prev?.tries ?? 0) + 1 }))
  }
  const readPlan = () => {
    if (pick.input) void read(pick.input)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" onClick={close}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="relative bg-white dark:bg-slate-800 w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl max-h-[85dvh] overflow-y-auto shadow-xl"
        onClick={e => e.stopPropagation()}
        role="dialog" aria-modal="true" aria-label="Upload my own plan"
      >
        <div className="sticky top-0 z-10 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-4 py-3 flex items-center justify-between gap-3">
          <p className="font-bold text-slate-800 dark:text-white">Upload my own plan</p>
          <button onClick={close} aria-label="Close" className="text-slate-400 text-xl leading-none shrink-0 w-11 h-11 -mr-2">×</button>
        </div>

        {pick.inputs}

        <div className="px-4 py-4">
          {state.step === 'review' && !failed && (
            <ImportReview
              result={state.result}
              sourceName={state.sourceName}
              base={base}
              todayIso={today}
              importsLeft={state.importsLeft}
              onUse={use}
              onUploadAnother={startOver}
            />
          )}

          {state.step === 'reading' && (
            <PlanReading sourceName={state.sourceName} startedAt={state.startedAt} onCancel={reset} />
          )}

          {failed && (
            <PlanSaveFailed tries={failed.tries} onRetry={() => use(failed.cfg)} onBack={() => setFailed(null)}
              note="Nothing has changed: your current plan is untouched." />
          )}

          {state.step === 'error' && (
            <PlanImportProblem problem={state.problem} sourceName={state.sourceName} limit={state.limit}
              note="Nothing has changed: your current plan is untouched.">
              <div className="space-y-2">
                <button type="button" onClick={() => { startOver(); pick.openFile() }}
                  className="w-full min-h-[48px] rounded-xl bg-teal-700 text-white font-semibold">Try another file</button>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={pick.openCamera} className="min-h-[48px] rounded-xl border-2 border-slate-200 dark:border-slate-600 text-sm font-semibold text-slate-800 dark:text-slate-100">Take a photo</button>
                  <button type="button" onClick={pick.choosePaste} className="min-h-[48px] rounded-xl border-2 border-slate-200 dark:border-slate-600 text-sm font-semibold text-slate-800 dark:text-slate-100">Paste text</button>
                </div>
              </div>
            </PlanImportProblem>
          )}

          {state.step === 'idle' && (
            <div className="space-y-4" data-testid="plan-import-pick">
              <PlanPickFields pick={pick} notice={
                <p className="p-3 rounded-xl bg-amber-50 dark:bg-amber-900/30 border border-amber-300 dark:border-amber-700 text-xs leading-relaxed text-amber-900 dark:text-amber-200">
                  This replaces your current plan once you approve it. Your current plan is backed up first.
                </p>
              } />

              <div className="grid grid-cols-2 gap-3 pt-1">
                <button type="button" onClick={onClose} className="min-h-[48px] rounded-xl border border-slate-300 dark:border-slate-600 font-semibold text-slate-700 dark:text-slate-200">Cancel</button>
                <button type="button" onClick={readPlan} disabled={!pick.input}
                  className="min-h-[48px] rounded-xl bg-teal-700 text-white font-semibold disabled:opacity-50">Read my plan</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
