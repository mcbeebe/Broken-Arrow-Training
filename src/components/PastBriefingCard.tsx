import { useState } from 'react'
import type { BriefingLogEntry } from '../hooks/useDailyBriefingLog'
import { renderMarkdown } from '../utils/markdown'
import { extractProposal } from '../utils/chatProposal'
import { extractTriggerSignal } from '../utils/coachInsightText'

const PERIOD_META: Record<BriefingLogEntry['period'], { emoji: string; label: string }> = {
  morning: { emoji: '☀️', label: 'Morning briefing' },
  afternoon: { emoji: '🌤️', label: 'Afternoon check-in' },
  evening: { emoji: '🌙', label: 'Evening wrap-up' },
}

function timeLabel(ts: number): string {
  try {
    return new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  } catch {
    return ''
  }
}

/**
 * Read-only, collapsed-by-default card for an EARLIER briefing from today.
 * The current period's read stays the live, interactive CoachInsightCard;
 * these preserve the earlier reads so the morning briefing is still there
 * in the afternoon instead of being silently overwritten. Tapping expands
 * the full text.
 */
export default function PastBriefingCard({ entry }: { entry: BriefingLogEntry }) {
  const [open, setOpen] = useState(false)
  const meta = PERIOD_META[entry.period]

  // Mirror CoachInsightCard's text handling: strip any ```proposal block
  // and the "Triggered by:" prefix so the body reads cleanly.
  const { content } = extractProposal(entry.text)
  const { body } = extractTriggerSignal(content || entry.text)
  const displayText = body || content || entry.text

  const firstSentence = displayText.split(/(?<=[.!?])\s/)[0] || displayText
  const preview = firstSentence.length > 100
    ? firstSentence.slice(0, 97).replace(/\s+\S*$/, '') + '…'
    : firstSentence

  return (
    <div className="bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-2 text-left"
        title={open ? 'Collapse' : 'Expand'}
      >
        <span className="flex items-center gap-1.5 min-w-0">
          <span className="shrink-0" aria-hidden>{meta.emoji}</span>
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 truncate">
            {meta.label}
          </span>
          <span className="text-xs text-slate-400 dark:text-slate-500 shrink-0">
            {timeLabel(entry.generatedAt)}
          </span>
        </span>
        <span className="text-slate-400 text-sm shrink-0">{open ? '▴' : '▾'}</span>
      </button>

      {open ? (
        <div className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed mt-2">
          {renderMarkdown(displayText)}
          {entry.tip && (
            <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              <span className="font-semibold">Tip:</span> {renderMarkdown(entry.tip)}
            </div>
          )}
        </div>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="w-full text-left text-xs text-slate-500 dark:text-slate-400 italic line-clamp-1 mt-1"
        >
          {preview}
        </button>
      )}
    </div>
  )
}
