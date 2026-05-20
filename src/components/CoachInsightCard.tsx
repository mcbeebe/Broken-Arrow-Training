import { useMemo, useState } from 'react'
import type { CoachAction, CoachInsight, PlannedDay } from '../types'
import { renderMarkdown } from '../utils/markdown'
import { extractProposal } from '../utils/chatProposal'
import { extractTriggerSignal, type TriggerExtract } from '../utils/coachInsightText'
import ProposalCard, { type ProposalStatus } from './ProposalCard'

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
  /** Resolves the original PlannedDay (pre-override) so the proposal card
   *  can show a "before → after" diff. */
  getPlannedDay?: (weekNum: number, dayIndex: number) => PlannedDay | null
  /** Apply a proposed plan edit and return the override id so the card
   *  can later offer "Undo". */
  onApproveProposal?: (action: CoachAction) => string | undefined
  /** Roll back a previously-applied override. */
  onUndoProposal?: (overrideId: string) => void
}

const COLLAPSE_PREFIX = 'ba_coach_insight_collapsed'
const PROPOSAL_STATE_PREFIX = 'ba_coach_insight_proposal_v1'

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

interface ProposalState {
  status: ProposalStatus
  overrideId?: string
}

function proposalStateKey(athleteId: string | undefined, action: CoachAction): string | null {
  const pe = action.proposedEdit
  if (!pe) return null
  const scope = athleteId || 'default'
  return `${PROPOSAL_STATE_PREFIX}:${scope}:w${pe.weekNum}d${pe.dayIndex}`
}

function readProposalState(athleteId: string | undefined, action: CoachAction): ProposalState {
  const key = proposalStateKey(athleteId, action)
  if (!key) return { status: 'pending' }
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return { status: 'pending' }
    const parsed = JSON.parse(raw) as ProposalState
    if (parsed.status === 'applied' || parsed.status === 'rejected' || parsed.status === 'pending') {
      return parsed
    }
  } catch {
    /* ignore */
  }
  return { status: 'pending' }
}

function writeProposalState(athleteId: string | undefined, action: CoachAction, state: ProposalState) {
  const key = proposalStateKey(athleteId, action)
  if (!key) return
  try {
    if (state.status === 'pending' && !state.overrideId) {
      localStorage.removeItem(key)
    } else {
      localStorage.setItem(key, JSON.stringify(state))
    }
  } catch {
    /* ignore */
  }
}

export default function CoachInsightCard({
  insight, loading, onAsk, coachName, onRegenerate, athleteId,
  getPlannedDay, onApproveProposal, onUndoProposal,
}: Props) {
  const name = coachName?.trim() || 'Coach'
  const [collapsed, setCollapsed] = useState(() => readCollapsed(athleteId))

  // Parse a `proposal` block out of the insight text so the raw JSON
  // never reaches the markdown renderer.
  const parsed = useMemo(
    () => insight ? extractProposal(insight.text) : { content: '', action: null },
    [insight],
  )
  const action = parsed.action

  // Strip the `Triggered by: ...` prefix from the body and surface it
  // as a tappable chip. Only applies to surfaces (daily) where the
  // prompt enforces the prefix — other surfaces won't match.
  const triggerExtract = useMemo<TriggerExtract>(
    () => extractTriggerSignal(parsed.content || (insight?.text ?? '')),
    [parsed.content, insight],
  )

  // Bump on user mutation so the next render re-reads localStorage. Avoids
  // a setState-in-effect for cross-render sync.
  const [stateVersion, setStateVersion] = useState(0)
  const proposalState: ProposalState = useMemo(
    () => action ? readProposalState(athleteId, action) : { status: 'pending' },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [athleteId, action, stateVersion],
  )

  function toggleCollapsed() {
    const next = !collapsed
    setCollapsed(next)
    writeCollapsed(next, athleteId)
  }

  function handleApprove(a: CoachAction) {
    const overrideId = onApproveProposal?.(a)
    writeProposalState(athleteId, a, { status: 'applied', overrideId })
    setStateVersion(v => v + 1)
  }

  function handleReject() {
    if (!action) return
    writeProposalState(athleteId, action, { status: 'rejected' })
    setStateVersion(v => v + 1)
  }

  function handleUndo(overrideId: string) {
    if (!action) return
    onUndoProposal?.(overrideId)
    writeProposalState(athleteId, action, { status: 'pending' })
    setStateVersion(v => v + 1)
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

  const displayText = triggerExtract.body || parsed.content || insight.text

  // One-line preview for collapsed state — first sentence or ~80 chars
  const firstSentence = displayText.split(/(?<=[.!?])\s/)[0] || displayText
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

      {/* Triggered-by chip — names the dominant signal that shaped this
          read. Tapping it seeds chat with a follow-up about that signal,
          so the athlete can drill into the "why" without losing the
          insight context. */}
      {!collapsed && triggerExtract.signal && (
        <button
          onClick={() => onAsk?.(`Tell me more about: ${triggerExtract.signal}`)}
          disabled={!onAsk}
          title={onAsk ? 'Ask the coach about this signal' : undefined}
          className="mt-1 inline-flex items-center gap-1 max-w-full text-[10px] font-semibold uppercase tracking-wider text-indigo-700 dark:text-indigo-200 bg-indigo-100/80 dark:bg-indigo-900/60 border border-indigo-200 dark:border-indigo-800 rounded-full px-2 py-0.5 hover:bg-indigo-200 dark:hover:bg-indigo-900 transition-colors disabled:opacity-70 disabled:cursor-default"
        >
          <span aria-hidden>⚡</span>
          <span className="truncate">{triggerExtract.signal}</span>
        </button>
      )}

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
              onClick={() => onAsk(displayText)}
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
            {renderMarkdown(displayText)}
          </div>
          {action && action.type === 'propose_edit' && action.proposedEdit && (
            <ProposalCard
              action={action}
              status={proposalState.status}
              overrideId={proposalState.overrideId}
              getPlannedDay={getPlannedDay}
              onApprove={handleApprove}
              onReject={handleReject}
              onUndo={handleUndo}
              onAsk={onAsk}
            />
          )}
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
