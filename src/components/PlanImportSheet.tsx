import { useEffect, useRef, useState } from 'react'
import type { OnboardingConfig } from '../hooks/useOnboarding'
import { usePlanImport, type PlanImportDeps } from '../hooks/usePlanImport'
import { IMPORT_PROBLEMS, spentLine } from '../utils/planImport/importErrors'
import { UPLOAD_LIMITS } from '../utils/planImport/uploadLimits'
import { todayDateString } from '../utils/planDates'
import ImportReview from './ImportReview'

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

const FILE_ACCEPT = '.pdf,.csv,.tsv,.txt,.docx,.xlsx,.doc,.xls,application/pdf,text/csv,text/plain,image/*'

function badgeFor(file: File): string {
  const ext = /\.([a-z0-9]{1,5})$/i.exec(file.name)?.[1]?.toUpperCase()
  if (file.type.startsWith('image/')) return 'IMG'
  return ext && ext.length <= 4 ? ext : 'FILE'
}

function sizeLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** The upload sheet; see the module comment. */
export default function PlanImportSheet({ base, onUse, onClose, todayIso, deps }: Props) {
  const { state, read, reset } = usePlanImport(deps)
  const [file, setFile] = useState<File | null>(null)
  const [pasting, setPasting] = useState(false)
  const [pasted, setPasted] = useState('')
  const [hint, setHint] = useState('')
  // The plan the athlete approved, kept when saving it failed (a full
  // phone), so trying again costs no second read.
  const [failedCfg, setFailedCfg] = useState<OnboardingConfig | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const fileInput = useRef<HTMLInputElement>(null)
  const cameraInput = useRef<HTMLInputElement>(null)
  const today = todayIso ?? todayDateString()

  useEffect(() => {
    if (state.step !== 'reading') return
    const started = state.startedAt
    const tick = () => setElapsed(Math.max(0, Math.floor((Date.now() - started) / 1000)))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [state])

  const busy = state.step === 'reading' || state.step === 'review'
  const close = () => {
    if (busy && !confirm(state.step === 'reading'
      ? 'Stop reading this plan? It still counts as one of today’s uploads.'
      : 'Close without using this plan? Your current plan stays as it is.')) return
    onClose()
  }

  const pick = (input: HTMLInputElement | null) => {
    const f = input?.files?.[0]
    if (input) input.value = ''
    if (!f) return
    setFile(f)
    setPasting(false)
    setFailedCfg(null)
    reset()
  }

  const startOver = () => {
    setFailedCfg(null)
    reset()
  }
  const use = (cfg: OnboardingConfig) => setFailedCfg(onUse(cfg) ? null : cfg)
  const choosePhoto = () => { startOver(); cameraInput.current?.click() }
  const choosePaste = () => { startOver(); setFile(null); setPasting(true) }
  const canRead = pasting ? pasted.trim().length > 0 : !!file

  const readPlan = () => {
    if (pasting) void read({ text: pasted, hint })
    else if (file) void read({ file, hint })
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

        <input ref={fileInput} type="file" accept={FILE_ACCEPT} className="hidden" data-testid="plan-file-input"
          onChange={e => pick(e.currentTarget)} />
        <input ref={cameraInput} type="file" accept="image/*" capture="environment" className="hidden" data-testid="plan-camera-input"
          onChange={e => pick(e.currentTarget)} />

        <div className="px-4 py-4">
          {state.step === 'review' && !failedCfg && (
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
            <div className="py-8 flex flex-col items-center text-center gap-3" data-testid="plan-import-reading" aria-live="polite">
              <div className="w-10 h-10 rounded-full border-4 border-teal-200 border-t-teal-600 animate-spin" aria-hidden="true" />
              <p className="font-semibold text-slate-800 dark:text-slate-100">Reading {state.sourceName}…</p>
              <p className="text-sm text-slate-500 dark:text-slate-400 max-w-xs">
                This can take a minute or two for a long plan. Keep this screen open.
              </p>
              <p className="text-xs text-slate-400 tabular-nums">{elapsed}s</p>
              <button type="button" onClick={reset} className="mt-2 min-h-[44px] px-5 rounded-xl border border-slate-300 dark:border-slate-600 text-sm font-semibold text-slate-700 dark:text-slate-200">
                Cancel
              </button>
            </div>
          )}

          {failedCfg && (
            <div className="space-y-4" data-testid="plan-import-save-failed" role="alert">
              <div className="text-center space-y-2 py-2">
                <p className="text-lg font-bold text-slate-900 dark:text-white">We couldn&rsquo;t save your plan</p>
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  Your phone may be out of storage. Free some space, then try again. Your plan is still here, so
                  trying again doesn&rsquo;t use another upload.
                </p>
                <p className="text-sm text-slate-600 dark:text-slate-300">Nothing has changed: your current plan is untouched.</p>
              </div>
              <button type="button" onClick={() => use(failedCfg)}
                className="w-full min-h-[48px] rounded-xl bg-teal-700 text-white font-semibold">Try saving again</button>
              <button type="button" onClick={() => setFailedCfg(null)}
                className="w-full min-h-[44px] text-sm font-semibold text-slate-600 dark:text-slate-300">Back to the review</button>
            </div>
          )}

          {state.step === 'error' && (() => {
            const copy = IMPORT_PROBLEMS[state.problem]
            const limit = state.limit
            return (
              <div className="space-y-4" data-testid="plan-import-error" role="alert">
                <div className="text-center space-y-2 py-2">
                  <p className="text-lg font-bold text-slate-900 dark:text-white">{copy.title}</p>
                  <p className="text-sm text-slate-600 dark:text-slate-300">
                    {state.sourceName ? <><span className="font-medium">{state.sourceName}</span>: </> : null}
                    {copy.body}
                    {limit !== undefined ? ` You can upload ${limit} plans a day.` : ''}
                  </p>
                  <p className="text-sm text-slate-600 dark:text-slate-300">Nothing has changed: your current plan is untouched.</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{spentLine(copy.spent)}</p>
                </div>
                {copy.tips && (
                  <div className="rounded-xl bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700 px-4 py-3 space-y-1">
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">What usually works</p>
                    <p className="text-xs text-slate-600 dark:text-slate-300">· The page or sheet that lists each week&rsquo;s sessions</p>
                    <p className="text-xs text-slate-600 dark:text-slate-300">· A clear photo or screenshot of the schedule, one page at a time</p>
                    <p className="text-xs text-slate-600 dark:text-slate-300">· Word or Excel: save it as a PDF first</p>
                  </div>
                )}
                <div className="space-y-2">
                  <button type="button" onClick={() => { startOver(); fileInput.current?.click() }}
                    className="w-full min-h-[48px] rounded-xl bg-teal-700 text-white font-semibold">Try another file</button>
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" onClick={choosePhoto} className="min-h-[48px] rounded-xl border-2 border-slate-200 dark:border-slate-600 text-sm font-semibold text-slate-800 dark:text-slate-100">Take a photo</button>
                    <button type="button" onClick={choosePaste} className="min-h-[48px] rounded-xl border-2 border-slate-200 dark:border-slate-600 text-sm font-semibold text-slate-800 dark:text-slate-100">Paste text</button>
                  </div>
                </div>
              </div>
            )
          })()}

          {state.step === 'idle' && (
            <div className="space-y-4" data-testid="plan-import-pick">
              {pasting ? (
                <div className="space-y-1.5">
                  <label htmlFor="plan-paste" className="text-sm font-semibold text-slate-800 dark:text-slate-100">Paste your plan</label>
                  <textarea
                    id="plan-paste" rows={8} value={pasted} onChange={e => setPasted(e.target.value)}
                    placeholder={'Week 1\nMon: rest\nTue: easy 4 mi\n…'}
                    className="w-full px-3 py-2.5 text-base rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                </div>
              ) : file ? (
                <div className="flex items-center gap-3 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700" data-testid="plan-file-chosen">
                  <span className="w-10 h-10 rounded-lg bg-teal-100 text-teal-800 dark:bg-teal-900/50 dark:text-teal-200 flex items-center justify-center text-[11px] font-bold shrink-0">{badgeFor(file)}</span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{file.name}</span>
                    <span className="block text-xs text-slate-500 dark:text-slate-400">{sizeLabel(file.size)}</span>
                  </span>
                  <button type="button" onClick={() => fileInput.current?.click()} className="min-h-[44px] px-3 text-sm font-semibold text-teal-700 dark:text-teal-300">Change</button>
                </div>
              ) : (
                <button type="button" onClick={() => fileInput.current?.click()}
                  className="w-full p-5 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-600 text-center">
                  <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100">Choose a file</span>
                  <span className="block text-xs text-slate-500 dark:text-slate-400 mt-0.5">A PDF or CSV, or a screenshot of your plan</span>
                </button>
              )}

              <div className="grid grid-cols-2 gap-3">
                <button type="button" onClick={choosePhoto} className="min-h-[44px] rounded-xl border-2 border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900/40 text-sm font-semibold text-slate-800 dark:text-slate-100">Take a photo</button>
                <button type="button" onClick={pasting ? () => setPasting(false) : choosePaste}
                  className="min-h-[44px] rounded-xl border-2 border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900/40 text-sm font-semibold text-slate-800 dark:text-slate-100">
                  {pasting ? 'Upload a file instead' : 'Paste text'}
                </button>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="plan-hint" className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                  Anything we should know? <span className="font-normal text-slate-500 dark:text-slate-400">(optional)</span>
                </label>
                <input
                  id="plan-hint" type="text" value={hint} maxLength={UPLOAD_LIMITS.maxHintChars}
                  onChange={e => setHint(e.target.value)} placeholder="e.g. use the Intermediate column"
                  className="w-full px-3 py-2.5 text-base rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>

              <p className="p-3 rounded-xl bg-amber-50 dark:bg-amber-900/30 border border-amber-300 dark:border-amber-700 text-xs leading-relaxed text-amber-900 dark:text-amber-200">
                This replaces your current plan once you approve it. Your current plan is backed up first.
              </p>
              <p className="p-3 rounded-xl bg-slate-100 dark:bg-slate-900/50 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                Our AI reads your file to build the plan. We don&rsquo;t keep the file, only the plan you approve.
              </p>

              <div className="grid grid-cols-2 gap-3 pt-1">
                <button type="button" onClick={onClose} className="min-h-[48px] rounded-xl border border-slate-300 dark:border-slate-600 font-semibold text-slate-700 dark:text-slate-200">Cancel</button>
                <button type="button" onClick={readPlan} disabled={!canRead}
                  className="min-h-[48px] rounded-xl bg-teal-700 text-white font-semibold disabled:opacity-50">Read my plan</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
