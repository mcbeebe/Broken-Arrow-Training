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
  athleteId?: string
}

const COLLAPSE_PREFIX = 'ba_coach_insight_collapsed'

function collapseKey(athleteId?: string): string {
  return athleteId ? `${COLLAPSE_PREFIX}_${athleteId}` : COLLAPSE_PREFIX
}

function readCollapsed(athleteId?: string): boolean {
  try {
    return localStorage.getItem(collapseKey(athleteId)) === '1'
  } catch {
    return false
  }
}
function writeCollapsed(v: boolean, athleteId?: string) {
  try {
    localStorage.setItem(collapseKey(athleteId), v ? '1' : '0')
  } catch {
    /* ignore */
  }
}

export default function CoachInsightCard({ insight, loading, onAsk, coachName, onRegenerate, athleteId }: Props) {
  const name = coachName?.trim() || 'Coach'
  const [collapsed, setCollapsed] = useState(() => readCollapsed(athleteId))

  function toggleCollapsed() {
    const next = !collapsed
    setCollapsed(next)
    writeCollapsed(next, athleteId)
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
      {/* Top row: avatar + name (no truncation) + collapse toggle */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-xl leading-none shrink-0" role="img" aria-label="coach">🧢</span>
          <p className="text-sm font-bold uppercase tracking-wider text-indigo-700 break-words">
            {name}
          </p>
        </div>
        <button
          onClick={toggleCollapsed}
          className="w-7 h-7 flex items-center justify-center rounded-full text-indigo-600 hover:bg-indigo-100 transition-colors shrink-0"
          title={collapsed ? 'Expand' : 'Collapse'}
        >
          {collapsed ? '▾' : '▴'}
        </button>
      </div>

      {/* Second row: action buttons. Only shown when expanded. */}
      {!collapsed && (onRegenerate || onAsk) && (
        <div className="flex items-center gap-4 mt-1 mb-2 text-sm">
          {onRegenerate && (
            <button
              onClick={onRegenerate}
              disabled={loading}
              className="text-indigo-600 hover:text-indigo-800 disabled:opacity-60 transition-colors flex items-center gap-1"
              title="Regenerate with current persona and context"
            >
              {loading ? (
                <>
                  <span className="inline-block w-3 h-3 rounded-full border-2 border-indigo-400 border-t-transparent animate-spin" />
                  <span>Generating…</span>
                </>
              ) : (
                <>↻ Regenerate</>
              )}
            </button>
          )}
          {onAsk && (
            <button
              onClick={() => onAsk(insight.text)}
              className="font-medium text-indigo-700 hover:text-indigo-900 transition-colors ml-auto"
            >
              Ask about this →
            </button>
          )}
        </div>
      )}

      {collapsed ? (
        <button
          onClick={toggleCollapsed}
          className="w-full text-left text-sm text-slate-600 italic leading-snug line-clamp-2 hover:text-slate-800 transition-colors mt-2"
        >
          {preview}
        </button>
      ) : (
        <div className={loading ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
          <div className="text-base text-slate-800 leading-relaxed">
            {renderMarkdown(insight.text)}
          </div>
          {insight.tip && (
            <div className="mt-2 text-sm text-indigo-700/90 leading-relaxed">
              <span className="font-semibold">Tip:</span> {renderMarkdown(insight.tip)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
