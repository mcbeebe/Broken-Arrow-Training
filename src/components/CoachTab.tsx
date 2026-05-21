import { useEffect, useState } from 'react'
import type { CoachInsight, CoachSnapshot, ConversationTurn, DailyChatArchive, CoachAction, PlannedDay } from '../types'
import type { UseCoachMemoryReturn } from '../hooks/useCoachMemory'
import { localDateStr } from '../utils/format'
import CoachChat from './CoachChat'
import CoachInsightCard from './CoachInsightCard'

interface Props {
  athleteId: string
  memory: UseCoachMemoryReturn
  snapshot: CoachSnapshot | null
  dailyInsight: CoachInsight | null
  dailyInsightLoading: boolean
  chatSeed: string | null
  onChatSeedConsumed: () => void
  onMarkRead: () => void
  onGoSettings: () => void
  onInteraction?: (kind: string, meta?: Record<string, unknown>) => void
  /** Proposal action handlers — passed through to CoachChat. */
  getPlannedDay?: (weekNum: number, dayIndex: number) => PlannedDay | null
  onApproveAction?: (turnId: string, action: CoachAction) => void
  onRejectAction?: (turnId: string) => void
  onUndoAction?: (turnId: string, overrideId: string) => void
  /** Insight-card proposal handlers (Apply / Undo on the daily read).
   *  Mirrors the per-turn proposal flow but keyed off the insight itself
   *  rather than a specific chat turn. */
  onApproveInsightProposal?: (action: CoachAction) => string | undefined
  onUndoInsightProposal?: (overrideId: string) => void
  /** Regenerate the daily insight (bust cache, refetch). */
  onRegenerateInsight?: () => void
  /** Seed chat with a follow-up prompt — wired to the insight card's
   *  "Ask about this →" / triggered-by chip. */
  onAskCoach?: (seed: string) => void
}

const DAILY_SEED_KEY = 'ba_coach_daily_seeded_v1'

/** Clear the legacy "seeded today's insight" marker. Kept because the
 *  auto-rollover effect and Clear button both need to reset it in
 *  case older code left a flag behind. */
function clearSeedDate(athleteId: string) {
  try {
    localStorage.removeItem(`${DAILY_SEED_KEY}:${athleteId}`)
  } catch {
    /* ignore */
  }
}

/**
 * Coach tab content: pure chat surface. The daily insight is a
 * Summary-only affordance — it no longer gets auto-seeded into the
 * conversation. Athletes can bring an insight into chat on demand via
 * the "Ask about this →" button on the Summary card.
 */
export default function CoachTab({
  athleteId,
  memory,
  snapshot,
  dailyInsight,
  dailyInsightLoading,
  chatSeed,
  onChatSeedConsumed,
  onMarkRead,
  onGoSettings,
  onInteraction,
  getPlannedDay,
  onApproveAction,
  onRejectAction,
  onUndoAction,
  onApproveInsightProposal,
  onUndoInsightProposal,
  onRegenerateInsight,
  onAskCoach,
}: Props) {
  useEffect(() => {
    onMarkRead()
    onInteraction?.('coach_tab_opened')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Auto-rollover: when today is a different day than the newest
  // conversation turn, archive the current conversation under that prior
  // date so today starts a fresh thread. Uses localStorage to avoid
  // double-firing in the same session.
  useEffect(() => {
    const today = snapshot?.today?.date
    if (!today) return
    const visible = memory.conversation.filter(t => t.role !== 'system-handoff')
    if (visible.length === 0) return
    // Find the date of the newest turn from its ts
    const lastTurn = visible[visible.length - 1]
    if (!lastTurn.ts) return
    const lastDate = localDateStr(new Date(lastTurn.ts))
    if (lastDate === today) return  // same day, nothing to do
    // Prior-day content exists — archive it
    const rolloverKey = `ba_coach_last_rollover:${athleteId}`
    if (localStorage.getItem(rolloverKey) === today) return
    try { localStorage.setItem(rolloverKey, today) } catch { /* quota */ }
    memory.rolloverDay(lastDate)
    // Reset the seed flag so today's insight seeds into the fresh thread
    clearSeedDate(athleteId)
    onInteraction?.('day_rolled_over', { archivedDate: lastDate })
  }, [snapshot?.today?.date, memory, athleteId, onInteraction])

  // NOTE: daily insight is intentionally NOT seeded into the chat
  // thread anymore. It lives on the Summary tab only — mixing it into
  // the Coach thread felt redundant and cluttered the conversation.
  // The "Ask about this →" button on the Summary card is how the
  // athlete brings an insight into chat on demand.

  const [chatMinimized, setChatMinimized] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [viewingArchive, setViewingArchive] = useState<string | null>(null)
  const hasTurns = memory.conversation.filter(t => t.role !== 'system-handoff').length > 0
  const archives = memory.dailyArchives ?? []

  // If viewing an archived chat, render the read-only transcript
  if (viewingArchive) {
    const archive = archives.find(a => a.date === viewingArchive)
    if (archive) {
      return (
        <div className="flex flex-col h-[calc(100vh-9rem)] px-3 py-3 gap-2">
          <div className="flex items-center justify-between shrink-0">
            <button
              onClick={() => setViewingArchive(null)}
              className="text-sm font-medium text-teal-700 hover:text-teal-900"
            >
              ‹ Back to today
            </button>
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              {new Date(archive.date + 'T12:00:00').toLocaleDateString('en-US', {
                weekday: 'long', month: 'short', day: 'numeric',
              })}
            </p>
          </div>
          <ArchiveViewer archive={archive} coachName={snapshot?.coachPersona?.name?.trim() || 'Coach'} />
        </div>
      )
    }
  }

  void onGoSettings

  const coachName = snapshot?.coachPersona?.name?.trim() || 'Coach'

  return (
    <div className="flex flex-col h-[calc(100vh-11rem)] px-0 py-0 gap-0 relative">

      {/* Daily insight — full message lives here. Summary shows a 1-sentence
          preview that links into this tab. */}
      {(dailyInsight || dailyInsightLoading) && (
        <div className="px-2 pt-2 shrink-0">
          <CoachInsightCard
            insight={dailyInsight}
            loading={dailyInsightLoading}
            onAsk={onAskCoach}
            coachName={coachName}
            onRegenerate={onRegenerateInsight}
            athleteId={athleteId}
            getPlannedDay={getPlannedDay}
            onApproveProposal={onApproveInsightProposal}
            onUndoProposal={onUndoInsightProposal}
            alwaysExpanded
          />
        </div>
      )}

      {/* Action bar */}
      <div className="flex items-center justify-between shrink-0 px-2 py-1">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setHistoryOpen(true)}
            className="text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:text-slate-200 transition-colors flex items-center gap-1"
            title="View past conversations"
          >
            📅 History{archives.length > 0 ? ` (${archives.length})` : ''}
          </button>
          {hasTurns && (
            <button
              onClick={() => setChatMinimized(!chatMinimized)}
              className="text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:text-slate-200 transition-colors"
            >
              {chatMinimized ? '▾ Show chat' : '▴ Minimize'}
            </button>
          )}
        </div>
        {hasTurns && (
          <div className="flex items-center gap-3">
            <button
              onClick={async () => {
                const today = snapshot?.today?.date || localDateStr()
                if (!window.confirm(
                  `Archive this conversation under ${today} and start a fresh thread? You can always revisit it in History.`,
                )) return
                await memory.rolloverDay(today)
                clearSeedDate(athleteId)
                onInteraction?.('conversation_archived', { date: today })
              }}
              className="text-xs text-slate-400 hover:text-indigo-600 transition-colors"
              title="Archive this chat to History and start fresh"
            >
              Archive
            </button>
            <button
              onClick={() => saveConversation(memory.conversation, athleteId)}
              className="text-xs text-slate-400 hover:text-indigo-600 transition-colors"
              title="Download conversation as a text file"
            >
              Save
            </button>
            <button
              onClick={() => copyConversation(memory.conversation, athleteId)}
              className="text-xs text-slate-400 hover:text-indigo-600 transition-colors"
              title="Copy conversation to clipboard"
            >
              Copy
            </button>
            <button
              onClick={async () => {
                if (!window.confirm(
                  'Clear the conversation? This removes all past turns so you can start fresh.',
                )) return
                await memory.clearConversation()
                clearSeedDate(athleteId)
                onInteraction?.('conversation_cleared')
              }}
              className="text-xs text-slate-400 hover:text-rose-600 transition-colors"
              title="Clear all chat history"
            >
              Clear
            </button>
          </div>
        )}
      </div>

      {/* Chat area */}
      <div className={`${chatMinimized ? 'hidden' : 'flex-1 min-h-0'}`}>
        <CoachChat
          athleteId={athleteId}
          memory={memory}
          snapshot={snapshot}
          seed={chatSeed}
          onSeedConsumed={onChatSeedConsumed}
          onSent={() => { onInteraction?.('chat_sent'); setChatMinimized(false) }}
          getPlannedDay={getPlannedDay}
          onApproveAction={onApproveAction}
          onRejectAction={onRejectAction}
          onUndoAction={onUndoAction}
        />
      </div>

      {/* Minimized view: last message preview + tap to expand */}
      {chatMinimized && hasTurns && (() => {
        const visible = memory.conversation.filter(t => t.role !== 'system-handoff')
        const last = visible[visible.length - 1]
        if (!last) return null
        const label = last.role === 'user' ? 'You' : 'Coach'
        const preview = last.content.length > 120 ? last.content.slice(0, 117) + '…' : last.content
        return (
          <button
            onClick={() => setChatMinimized(false)}
            className="flex-1 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-3 text-left hover:bg-slate-50 dark:hover:bg-slate-700 dark:bg-slate-900 transition-colors min-h-0 overflow-hidden"
          >
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-0.5">{label}:</p>
            <p className="text-sm text-slate-700 dark:text-slate-200 line-clamp-3">{preview}</p>
            <p className="text-xs text-teal-600 mt-1">Tap to expand ›</p>
          </button>
        )
      })()}

      {/* History drawer */}
      {historyOpen && (
        <HistoryDrawer
          archives={archives}
          onClose={() => setHistoryOpen(false)}
          onSelect={date => {
            setViewingArchive(date)
            setHistoryOpen(false)
            onInteraction?.('archive_viewed', { date })
          }}
        />
      )}
    </div>
  )
}

// ─── Archive viewer + History drawer ──────────────────────────

function ArchiveViewer({ archive, coachName }: { archive: DailyChatArchive; coachName: string }) {
  const visible = archive.turns.filter(t => t.role !== 'system-handoff')
  return (
    <div className="flex-1 min-h-0 overflow-y-auto bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-3 space-y-2.5">
      {visible.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-8">No messages on this day.</p>
      ) : (
        visible.map(t => {
          if (t.role === 'user') {
            return (
              <div key={t.id} className="flex justify-end">
                <div className="max-w-[85%] bg-indigo-600 text-white rounded-2xl rounded-tr-sm px-3 py-2 text-base leading-relaxed">
                  {t.content}
                </div>
              </div>
            )
          }
          if (t.role === 'coach') {
            return (
              <div key={t.id} className="flex">
                <div className="max-w-[85%] bg-amber-50 border border-amber-200 text-slate-800 dark:text-white rounded-2xl rounded-tl-sm px-3 py-2 text-base leading-relaxed">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-base leading-none" role="img" aria-label="coach">🧢</span>
                    <p className="text-xs uppercase font-bold tracking-wider text-amber-700">
                      {coachName}{t.trigger ? ` · ${t.trigger.replace(/_/g, ' ')}` : ''}
                    </p>
                  </div>
                  <p className="whitespace-pre-wrap">{t.content}</p>
                </div>
              </div>
            )
          }
          return (
            <div key={t.id} className="flex">
              <div className="max-w-[85%] bg-indigo-50 text-slate-800 dark:text-white rounded-2xl rounded-tl-sm px-3 py-2 text-base whitespace-pre-wrap leading-relaxed">
                {t.content}
              </div>
            </div>
          )
        })
      )}
    </div>
  )
}

function HistoryDrawer({
  archives,
  onClose,
  onSelect,
}: {
  archives: DailyChatArchive[]
  onClose: () => void
  onSelect: (date: string) => void
}) {
  return (
    <div className="fixed inset-0 z-40" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="absolute left-0 top-0 bottom-0 w-72 bg-white dark:bg-slate-800 shadow-xl overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-4 py-3 flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-800 dark:text-white">Chat History</h3>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:bg-slate-700"
          >
            ✕
          </button>
        </div>
        {archives.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-8 px-4">
            No past conversations yet. Chats roll over automatically at the start of each new day.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {archives.map(a => (
              <li key={a.date}>
                <button
                  onClick={() => onSelect(a.date)}
                  className="w-full text-left px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-700 dark:bg-slate-900 transition-colors"
                >
                  <p className="text-sm font-semibold text-slate-800 dark:text-white">
                    {new Date(a.date + 'T12:00:00').toLocaleDateString('en-US', {
                      weekday: 'short', month: 'short', day: 'numeric',
                    })}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{a.turnCount} messages</p>
                  <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 line-clamp-2 italic">"{a.preview}"</p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

// ─── Conversation export / share ──────────────────────────────

function formatConversation(
  turns: ConversationTurn[],
  athleteId: string,
): string {
  const visible = turns.filter(t => t.role !== 'system-handoff')
  if (visible.length === 0) return ''

  const lines: string[] = []
  const now = new Date()
  lines.push(`Broken Arrow Training — Coach Chat`)
  lines.push(`Athlete: ${athleteId} · Exported ${now.toLocaleDateString()} ${now.toLocaleTimeString()}`)
  lines.push('─'.repeat(40))

  for (const t of visible) {
    const label =
      t.role === 'user' ? 'You'
      : t.role === 'coach' ? `Coach${t.trigger ? ` (${t.trigger.replace(/_/g, ' ')})` : ''}`
      : 'Coach'
    const time = t.ts ? new Date(t.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''
    lines.push('')
    lines.push(`${label}${time ? '  ' + time : ''}`)
    lines.push(t.content)
  }
  lines.push('')
  lines.push('─'.repeat(40))
  lines.push('Shared from Broken Arrow Training App')
  return lines.join('\n')
}

/** Download conversation as a .txt file — works everywhere, no API
 *  dependencies. Creates a temporary download link and clicks it. */
function saveConversation(turns: ConversationTurn[], athleteId: string) {
  const text = formatConversation(turns, athleteId)
  if (!text) return
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  const date = localDateStr()
  a.download = `coach-chat-${athleteId}-${date}.txt`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/** Copy conversation to clipboard with fallback for older browsers. */
function copyConversation(turns: ConversationTurn[], athleteId: string) {
  const text = formatConversation(turns, athleteId)
  if (!text) return
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text)
      .then(() => window.alert('Conversation copied to clipboard.'))
      .catch(() => fallbackCopy(text))
  } else {
    fallbackCopy(text)
  }
}

function fallbackCopy(text: string) {
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.style.cssText = 'position:fixed;left:-9999px'
  document.body.appendChild(textarea)
  textarea.select()
  document.execCommand('copy')
  document.body.removeChild(textarea)
  window.alert('Conversation copied to clipboard.')
}
