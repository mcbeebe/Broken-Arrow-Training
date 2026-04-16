import { useEffect } from 'react'
import type { CoachInsight, CoachSnapshot } from '../types'
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

      <div className="flex items-center justify-center gap-4 shrink-0">
        <button
          onClick={onGoSettings}
          className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
        >
          Edit About Me in Settings →
        </button>
        {memory.conversation.length > 0 && (
          <button
            onClick={async () => {
              // Confirm to avoid accidental wipes — conversation history is
              // meaningful and cannot be recovered after clear.
              if (!window.confirm(
                'Clear the conversation? This removes all past turns so you can start fresh. ' +
                'Your About Me and pending observations are kept.',
              )) return
              await memory.clearConversation()
              // Let today's daily insight re-seed on the next refresh.
              clearSeedDate(athleteId)
              onInteraction?.('conversation_cleared')
            }}
            className="text-xs text-slate-400 hover:text-rose-600 transition-colors"
            title="Wipe the chat history so the next reply starts clean"
          >
            Clear conversation
          </button>
        )}
      </div>
    </div>
  )
}
