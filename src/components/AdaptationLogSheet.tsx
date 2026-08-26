import type { AdaptationLogEntry } from '../hooks/useAdaptationLog'

/**
 * The Adaptation Log sheet (Adaptive Engine phase 3, PR 9 — the
 * mockup's log overlay): every change the engine made or proposed, and
 * why, newest first, with Undo still live wherever a plan-edit batch
 * exists. The visible history is what makes the autopilot trustworthy —
 * nothing this system does is ever silent or unrecoverable.
 */

const BADGES: Record<string, { label: string; cls: string }> = {
  'autopilot:auto': { label: 'auto · today only', cls: 'bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300' },
  'autopilot:reverted': { label: 'auto · reverted by you', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300' },
  'monday-review:applied': { label: 'you applied', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' },
  'monday-review:reverted': { label: 'reverted by you', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300' },
  'coach:applied': { label: 'you applied', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' },
  'coach:reverted': { label: 'reverted by you', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300' },
}

function badge(e: AdaptationLogEntry) {
  return BADGES[`${e.source}:${e.kind}`] ?? (e.kind === 'declined'
    ? { label: 'proposed · you declined', cls: 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-300' }
    : { label: e.kind, cls: 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-300' })
}

function fmtWhen(atMs: number): string {
  const d = new Date(atMs)
  const day = d.toLocaleDateString('en-US', { weekday: 'short' })
  const h24 = d.getHours()
  const h = h24 % 12 === 0 ? 12 : h24 % 12
  const ampm = h24 < 12 ? 'a' : 'p'
  return `${day} ${d.getMonth() + 1}/${d.getDate()} · ${h}:${String(d.getMinutes()).padStart(2, '0')}${ampm}`
}

export default function AdaptationLogSheet({ entries, onUndo, onClose }: {
  entries: AdaptationLogEntry[]
  onUndo: (entry: AdaptationLogEntry) => void
  onClose: () => void
}) {
  const reverted = entries.filter(e => e.kind === 'reverted').length
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-end sm:items-center sm:justify-center" data-testid="adaptation-log">
      <div className="bg-slate-50 dark:bg-slate-900 w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl max-h-[92vh] flex flex-col overflow-hidden">

        <div className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-4 pt-5 pb-3">
          <div className="flex items-center justify-between">
            <p className="font-bold text-slate-800 dark:text-white">Adaptation log</p>
            <button onClick={onClose} className="text-sm font-medium text-slate-400">Close</button>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Every change the engine made or proposed — and why. {entries.length} this plan{reverted > 0 ? ` · ${reverted} reverted` : ''}
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2.5">
          {entries.length === 0 && (
            <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-8">
              Nothing yet — when the engine adjusts or proposes anything, it shows up here.
            </p>
          )}
          {entries.map(e => {
            const b = badge(e)
            return (
              <div key={e.id} className="bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl px-3 py-2.5" data-testid={`log-${e.id}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${b.cls}`}>{b.label}</span>
                  <span className="text-[10px] text-slate-400">{fmtWhen(e.atMs)}</span>
                </div>
                <p className="text-sm font-semibold text-slate-800 dark:text-white mt-1.5">{e.title}</p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed mt-0.5">{e.detail}</p>
                {e.batchId && e.kind !== 'reverted' && e.kind !== 'declined' && (
                  <button
                    onClick={() => onUndo(e)}
                    className="mt-2 text-xs font-semibold text-teal-700 dark:text-teal-400"
                    data-testid={`log-undo-${e.id}`}
                  >
                    Undo
                  </button>
                )}
              </div>
            )
          })}

          <div className="bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl px-3 py-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1">Standing guardrails</p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
              Hard days move, never disappear · at most one push per session · trends over single bad nights · race week untouchable · your own edits always win.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
