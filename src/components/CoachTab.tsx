import { useEffect } from 'react'
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

  return (
    <div className="flex flex-col h-[calc(100vh-9rem)] px-3 py-3 gap-2">
      {/* Pending-inference cards used to live here asking the user to
          approve durable facts. We removed them — new facts are merged
          into About Me silently in the background with dedup. Existing
          pending entries from the old flow are drained server-side on
          the next chat send. */}
      <div className="flex-1 min-h-0">
        <CoachChat
          athleteId={athleteId}
          memory={memory}
          snapshot={snapshot}
          seed={chatSeed}
          onSeedConsumed={onChatSeedConsumed}
          onSent={() => onInteraction?.('chat_sent')}
        />
      </div>

      <div className="flex items-center justify-center gap-3 shrink-0 flex-wrap">
        <button
          onClick={onGoSettings}
          className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
        >
          About Me →
        </button>
        {memory.conversation.length > 0 && (
          <>
            <button
              onClick={() => shareConversation(memory.conversation, athleteId, onInteraction)}
              className="text-xs text-slate-400 hover:text-indigo-600 transition-colors"
              title="Share or copy this conversation"
            >
              Share
            </button>
            <button
              onClick={async () => {
                if (!window.confirm(
                  'Clear the conversation? This removes all past turns so you can start fresh. ' +
                  'Your About Me and pending observations are kept.',
                )) return
                await memory.clearConversation()
                clearSeedDate(athleteId)
                onInteraction?.('conversation_cleared')
              }}
              className="text-xs text-slate-400 hover:text-rose-600 transition-colors"
              title="Wipe the chat history so the next reply starts clean"
            >
              Clear
            </button>
          </>
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

async function shareConversation(
  turns: ConversationTurn[],
  athleteId: string,
  onInteraction?: (kind: string, meta?: Record<string, unknown>) => void,
) {
  const text = formatConversation(turns, athleteId)
  if (!text) return

  // Try native Web Share API first (mobile share sheet — Messages, email, etc.)
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({
        title: 'Coach Chat — Broken Arrow Training',
        text,
      })
      onInteraction?.('conversation_shared', { method: 'native' })
      return
    } catch {
      // User cancelled or API unsupported — fall through to clipboard
    }
  }

  // Fallback: copy to clipboard
  try {
    await navigator.clipboard.writeText(text)
    window.alert('Conversation copied to clipboard.')
    onInteraction?.('conversation_shared', { method: 'clipboard' })
  } catch {
    // Last resort: open a textarea for manual copy
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.style.cssText = 'position:fixed;left:-9999px'
    document.body.appendChild(textarea)
    textarea.select()
    document.execCommand('copy')
    document.body.removeChild(textarea)
    window.alert('Conversation copied to clipboard.')
    onInteraction?.('conversation_shared', { method: 'fallback' })
  }
}
