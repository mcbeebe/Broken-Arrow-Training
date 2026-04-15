import { useEffect } from 'react'
import type { CoachInsight, CoachSnapshot } from '../types'
import type { UseCoachMemoryReturn } from '../hooks/useCoachMemory'
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
 * Coach tab content: pending inferences (if any) + full chat. The daily
 * insight is NOT rendered here anymore — it lives on Summary and seeds
 * the chat via the `chatSeed` prop when the user taps "Ask". Keeping the
 * Coach tab focused on dialogue avoids duplicating the daily read and
 * lets the chat fill the viewport.
 */
export default function CoachTab({
  athleteId,
  memory,
  snapshot,
  dailyInsight: _dailyInsight,
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
  void _dailyInsight
  void _dailyInsightLoading

  return (
    <div className="flex flex-col h-[calc(100vh-9rem)] px-3 py-3 gap-2">
      {memory.pendingInferences.length > 0 && (
        <div className="space-y-2 shrink-0">
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

      <div className="text-center shrink-0">
        <button
          onClick={onGoSettings}
          className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
        >
          Edit About Me in Settings →
        </button>
      </div>
    </div>
  )
}
