import type { ReactNode } from 'react'
import type { PlanPick } from '../hooks/usePlanPick'
import { badgeFor, sizeLabel } from '../utils/planImport/pickLabels'
import { UPLOAD_LIMITS } from '../utils/planImport/uploadLimits'

interface Props {
  pick: PlanPick
  /** Shown above the privacy note: the sheet's "this replaces your plan". */
  notice?: ReactNode
}

/**
 * Where the athlete picks their plan (initiative 004): a file, a photo or
 * pasted text, plus an optional note for the reader. Shared by the Settings
 * upload sheet and onboarding's upload step; the buttons that read the plan
 * stay with each caller.
 */
export default function PlanPickFields({ pick, notice }: Props) {
  const { file, pasting } = pick
  return (
    <>
      {pasting ? (
        <div className="space-y-1.5">
          <label htmlFor="plan-paste" className="text-sm font-semibold text-slate-800 dark:text-slate-100">Paste your plan</label>
          <textarea
            id="plan-paste" rows={8} value={pick.pasted} onChange={e => pick.setPasted(e.target.value)}
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
          <button type="button" onClick={pick.openFile} className="min-h-[44px] px-3 text-sm font-semibold text-teal-700 dark:text-teal-300">Change</button>
        </div>
      ) : (
        <button type="button" onClick={pick.openFile}
          className="w-full p-5 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-600 text-center">
          <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100">Choose a file</span>
          <span className="block text-xs text-slate-500 dark:text-slate-400 mt-0.5">A PDF, Word, Excel or CSV file, or a screenshot of your plan</span>
        </button>
      )}

      <div className="grid grid-cols-2 gap-3">
        <button type="button" onClick={pick.openCamera} className="min-h-[44px] rounded-xl border-2 border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900/40 text-sm font-semibold text-slate-800 dark:text-slate-100">Take a photo</button>
        <button type="button" onClick={pasting ? pick.stopPasting : pick.choosePaste}
          className="min-h-[44px] rounded-xl border-2 border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900/40 text-sm font-semibold text-slate-800 dark:text-slate-100">
          {pasting ? 'Upload a file instead' : 'Paste text'}
        </button>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="plan-hint" className="text-sm font-semibold text-slate-800 dark:text-slate-100">
          Anything we should know? <span className="font-normal text-slate-500 dark:text-slate-400">(optional)</span>
        </label>
        <input
          id="plan-hint" type="text" value={pick.hint} maxLength={UPLOAD_LIMITS.maxHintChars}
          onChange={e => pick.setHint(e.target.value)} placeholder="e.g. use the Intermediate column"
          className="w-full px-3 py-2.5 text-base rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
        />
      </div>

      {notice}
      <p className="p-3 rounded-xl bg-slate-100 dark:bg-slate-900/50 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
        Our AI reads your file to build the plan. We don&rsquo;t keep the file, only the plan you approve.
      </p>
    </>
  )
}
