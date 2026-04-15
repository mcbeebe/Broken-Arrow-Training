import { useEffect } from 'react'
import type { CoachInsight, CoachSnapshot } from '../types'
import type { UseCoachMemoryReturn } from '../hooks/useCoachMemory'
import CoachInsightCard from './CoachInsightCard'
import CoachChat from './CoachChat'
import PendingInferenceView from './PendingInference'

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

/**
 * Coach tab content: daily read + pending inferences + full chat. On
 * mount we mark any unread proactive pings as read so the tab badge
 * clears.
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
}: Props) {
  useEffect(() => {
    onMarkRead()
    onInteraction?.('coach_tab_opened')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="px-3 py-4 space-y-3">
      <CoachInsightCard
        insight={dailyInsight}
        loading={dailyInsightLoading}
        onAsk={undefined}  // already in the tab; nothing to seed to
      />

      {memory.pendingInferences.length > 0 && (
        <div className="space-y-2">
          {memory.pendingInferences.map(inf => (
            <PendingInferenceView
              key={inf.id}
              inference={inf}
              onAccept={id => {
                memory.acceptInference(id)
                onInteraction?.('inference_accepted', { id })
              }}
              onDismiss={id => {
                memory.dismissInference(id)
                onInteraction?.('inference_dismissed', { id })
              }}
            />
          ))}
        </div>
      )}

      <CoachChat
        athleteId={athleteId}
        memory={memory}
        snapshot={snapshot}
        seed={chatSeed}
        onSeedConsumed={onChatSeedConsumed}
        onSent={() => onInteraction?.('chat_sent')}
      />

      <div className="text-center">
        <button
          onClick={onGoSettings}
          className="text-[11px] text-slate-400 hover:text-slate-600 transition-colors"
        >
          Edit About Me in Settings →
        </button>
      </div>
    </div>
  )
}
