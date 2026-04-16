import { useState } from 'react'
import type { CoachInsight } from '../types'
import { renderMarkdown } from '../utils/markdown'

interface Props {
  insight: CoachInsight | null
  loading: boolean
  onAsk?: (seed: string) => void
  /** Persona name from CoachMemory.coachPersona.name (falls back to "Coach"). */
  coachName?: string
  /** Optional regenerate handler — when provided, shows a ↻ button that
   *  busts the insight cache and refetches. Lets the athlete pull a
   *  fresh read after changing persona without waiting for tomorrow. */
  onRegenerate?: () => void
}

/**
 * Daily LLM-generated coach read, rendered on Summary and at the top of
 * the Coach tab. When insight is null + not loading, renders nothing.
 * The "Ask about this →" button routes back to Coach tab with the
 * insight seeded as conversation context.
 *
 * Collapsible: athletes can stash the card to a one-line header once
 * they've read it. Collapse state persists per-athlete in localStorage
 * so the preference sticks across reloads.
 */

const COLLAPSE_KEY = 'ba_coach_insight_collapsed'

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === '1'
  } catch {
    return false
  }
}
function writeCollapsed(v: boolean) {
  try {
    localStorage.setItem(COLLAPSE_KEY, v ? '1' : '0')
  } catch {
    /* ignore */
  }
}

export default function CoachInsightCard({ insight, loading, onAsk, coachName, onRegenerate }: Props) {
  const name = coachName?.trim() || 'Coach'
  const [collapsed, setCollapsed] = useState(readCollapsed)

  function toggleCollapsed() {
    const next = !collapsed
    setCollapsed(next)
    writeCollapsed(next)
  }

  if (loading && !insight) {
    return (
      <div className="bg-indigo-50/70 border border-indigo-100 rounded-xl px-3 py-3 animate-pulse">
        <div className="h-3 w-16 bg-indigo-200/60 rounded mb-2" />
        <div className="h-3 w-full bg-indigo-200/40 rounded mb-1" />
        <div className="h-3 w-3/4 bg-indigo-200/40 rounded" />
      </div>
    )
  }
  if (!insight || insight.silent || !insight.text) return null

  // One-line preview for collapsed state — first sentence or ~80 chars
  const firstSentence = insight.text.split(/(?<=[.!?])\s/)[0] || insight.text
  const preview = firstSentence.length > 100
    ? firstSentence.slice(0, 97).replace(/\s+\S*$/, '') + '…'
    : firstSentence

  return (
    <div className="bg-indigo-50/70 border border-indigo-100 rounded-xl px-3 py-3">
      <div className="flex items-center justify-between mb-2 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xl leading-none shrink-0" role="img" aria-label="coach">🧢</span>
          <p className="text-sm font-bold uppercase tracking-wider text-indigo-700 truncate">
            {name}
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {!collapsed && onRegenerate && (
            <button
              onClick={onRegenerate}
              className="text-sm text-indigo-600 hover:text-indigo-800 transition-colors"
              title="Regenerate with current persona and context"
            >
              ↻ Regenerate
            </button>
          )}
          {!collapsed && onAsk && (
            <button
              onClick={() => onAsk(insight.text)}
              className="text-sm font-medium text-indigo-700 hover:text-indigo-900 transition-colors"
            >
              Ask about this →
            </button>
          )}
          <button
            onClick={toggleCollapsed}
            className="w-7 h-7 flex items-center justify-center rounded-full text-indigo-600 hover:bg-indigo-100 transition-colors"
            title={collapsed ? 'Expand' : 'Collapse'}
          >
            {collapsed ? '▾' : '▴'}
          </button>
        </div>
      </div>

      {collapsed ? (
        <button
          onClick={toggleCollapsed}
          className="w-full text-left text-sm text-slate-600 italic leading-snug line-clamp-2 hover:text-slate-800 transition-colors"
        >
          {preview}
        </button>
      ) : (
        <>
          <div className="text-base text-slate-800 leading-relaxed">
            {renderMarkdown(insight.text)}
          </div>
          {insight.tip && (
            <div className="mt-2 text-sm text-indigo-700/90 leading-relaxed">
              <span className="font-semibold">Tip:</span> {renderMarkdown(insight.tip)}
            </div>
          )}
        </>
      )}
    </div>
  )
}
