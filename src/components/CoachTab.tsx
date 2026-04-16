import { useEffect, useState } from 'react'
import type { CoachInsight, CoachSnapshot, ConversationTurn } from '../types'
import type { UseCoachMemoryReturn } from '../hooks/useCoachMemory'
import CoachChat from './CoachChat'

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
}

const DAILY_SEED_KEY = 'ba_coach_daily_seeded_v1'

/** Whether today's daily insight has already been seeded into the
 *  conversation for this athlete. Stored as a single localStorage key
 *  so it survives reloads but doesn't leak across days. */
function readSeedDate(athleteId: string): string | null {
  try {
    return localStorage.getItem(`${DAILY_SEED_KEY}:${athleteId}`)
  } catch {
    return null
  }
}
function writeSeedDate(athleteId: string, date: string) {
  try {
    localStorage.setItem(`${DAILY_SEED_KEY}:${athleteId}`, date)
  } catch {
    /* quota */
  }
}
function clearSeedDate(athleteId: string) {
  try {
    localStorage.removeItem(`${DAILY_SEED_KEY}:${athleteId}`)
  } catch {
    /* ignore */
  }
}

function buildSeedText(insight: CoachInsight): string {
  const parts: string[] = [insight.text.trim()]
  if (insight.tip) parts.push(`Tip: ${insight.tip.trim()}`)
  return parts.join('\n\n')
}

/**
 * Coach tab content: pending inferences (if any) + full chat. The daily
 * insight is no longer rendered as its own hero card — instead it's
 * seeded into the conversation as the first coach turn of the day, so it
 * reads as part of the thread and the Coach tab is pure dialogue.
 */
export default function CoachTab({
  athleteId,
  memory,
  snapshot,
  dailyInsight,
  dailyInsightLoading: _dailyInsightLoading,
  chatSeed,
  onChatSeedConsumed,
  onMarkRead,
  onGoSettings,
  onInteraction,
}: Props) {
  useEffect(() => {
    onMarkRead()
    onInteraction?.('coach_tab_opened')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  void _dailyInsightLoading

  // Seed today's insight as a role:'coach' turn with trigger:'daily_insight'
  // the first time it becomes available each day. Guarded by a localStorage
  // date flag so we don't re-seed on every refresh.
  useEffect(() => {
    if (!dailyInsight || dailyInsight.silent) return
    if (!dailyInsight.text || !dailyInsight.text.trim()) return
    const today = snapshot?.today?.date
    if (!today) return
    if (readSeedDate(athleteId) === today) return
    writeSeedDate(athleteId, today)
    memory.appendTurn('coach', buildSeedText(dailyInsight), 'daily_insight')
    onInteraction?.('daily_insight_seeded', { date: today })
  }, [dailyInsight, snapshot?.today?.date, athleteId, memory, onInteraction])

  const [chatMinimized, setChatMinimized] = useState(false)
  const hasTurns = memory.conversation.filter(t => t.role !== 'system-handoff').length > 0

  return (
    <div className="flex flex-col h-[calc(100vh-9rem)] px-3 py-3 gap-2">
      {/* Action bar — always visible at top */}
      {hasTurns && (
        <div className="flex items-center justify-between shrink-0 px-1">
          <button
            onClick={() => setChatMinimized(!chatMinimized)}
            className="text-xs font-medium text-slate-500 hover:text-slate-700 transition-colors"
          >
            {chatMinimized ? '▾ Show chat' : '▴ Minimize'}
          </button>
          <div className="flex items-center gap-3">
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
        </div>
      )}

      {/* Chat area */}
      <div className={`${chatMinimized ? 'hidden' : 'flex-1 min-h-0'}`}>
        <CoachChat
          athleteId={athleteId}
          memory={memory}
          snapshot={snapshot}
          seed={chatSeed}
          onSeedConsumed={onChatSeedConsumed}
          onSent={() => { onInteraction?.('chat_sent'); setChatMinimized(false) }}
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
            className="flex-1 bg-white rounded-xl border border-slate-200 p-3 text-left hover:bg-slate-50 transition-colors min-h-0 overflow-hidden"
          >
            <p className="text-xs font-medium text-slate-500 mb-0.5">{label}:</p>
            <p className="text-sm text-slate-700 line-clamp-3">{preview}</p>
            <p className="text-xs text-teal-600 mt-1">Tap to expand ›</p>
          </button>
        )
      })()}

      <div className="flex items-center justify-center shrink-0">
        <button
          onClick={onGoSettings}
          className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
        >
          About Me in Settings →
        </button>
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
  const date = new Date().toISOString().slice(0, 10)
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
