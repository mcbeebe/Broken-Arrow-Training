/**
 * Settings → Training Plan: the way in to "Upload my own plan"
 * (initiative 004). Settings decides who sees it (the owner, during the beta).
 */
export default function PlanImportCard({ onOpen }: { onOpen: () => void }) {
  return (
    <div className="rounded-xl p-4 border-2 border-teal-300 dark:border-teal-700 bg-white dark:bg-slate-800 space-y-2.5" data-testid="plan-import-card">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-slate-800 dark:text-slate-100">Upload my own plan</p>
        <span className="text-[11px] font-bold uppercase tracking-wide text-teal-800 bg-teal-100 dark:bg-teal-900/60 dark:text-teal-200 px-2 py-0.5 rounded-full">Beta</span>
      </div>
      <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
        Training from a coach&rsquo;s, book or club plan? Upload it as a PDF, Word, Excel or CSV file, a photo or
        pasted text and we turn it into your calendar. You check it before it replaces your current plan.
      </p>
      <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
        Your current plan is backed up first. Bring it back from Restore a Previous Plan.
      </p>
      <button
        type="button" onClick={onOpen}
        className="text-sm font-medium px-3 py-1.5 rounded-lg bg-teal-100 text-teal-700 hover:bg-teal-200 dark:bg-teal-900 dark:text-teal-200 dark:hover:bg-teal-800 transition-colors"
      >
        Upload a plan
      </button>
    </div>
  )
}
