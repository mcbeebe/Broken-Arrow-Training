import { useState } from 'react'
import type { ConversationTurn, CoachPersona, PendingInference } from '../types'

interface DailyArchive {
  id?: string
  date?: string
}

interface Props {
  aboutMe: string
  coachPersona: CoachPersona
  conversation: ConversationTurn[]
  pendingInferences: PendingInference[]
  dailyArchives: DailyArchive[]
  onClearConversation: () => void | Promise<void>
}

/**
 * "What I remember about you" — a memory inspector for the coach.
 *
 * The persona review found users mistrust an AI they cannot audit. This panel
 * lists exactly what's stored on their behalf: their About Me text, the coach
 * persona, the recent conversation, pending observations, and daily archives.
 * The relevant edit/clear surfaces are the existing AboutMe and
 * CoachPersonaEditor components above this in Settings; this panel is read-
 * only except for "Clear conversation".
 */
export default function CoachMemoryPanel({
  aboutMe,
  coachPersona,
  conversation,
  pendingInferences,
  dailyArchives,
  onClearConversation,
}: Props) {
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)

  const visibleTurns = conversation.filter(t => t.role !== 'system-handoff')
  const lastTurn = visibleTurns[visibleTurns.length - 1]
  const personaTraits = (coachPersona?.traits ?? []).filter(Boolean)
  const personaName = (coachPersona?.name || '').trim()

  async function handleClear() {
    if (busy) return
    setBusy(true)
    try {
      await onClearConversation()
      setConfirming(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl p-4 shadow-sm border border-slate-100 dark:border-slate-700 space-y-3">
      <div>
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">What I remember about you</p>
        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
          The coach uses this context on every reply. Edit or clear above; everything below is read-only.
        </p>
      </div>

      <MemoryRow label="About you">
        {aboutMe.trim()
          ? <p className="text-sm text-slate-600 dark:text-slate-300 leading-snug whitespace-pre-wrap line-clamp-3">{aboutMe.trim()}</p>
          : <Empty>You haven't shared anything yet.</Empty>}
      </MemoryRow>

      <MemoryRow label="Coach persona">
        {(personaName || personaTraits.length) ? (
          <p className="text-sm text-slate-600 dark:text-slate-300">
            {personaName || 'Coach'}{personaTraits.length ? ` · ${personaTraits.join(' · ')}` : ''}
          </p>
        ) : (
          <Empty>Default voice.</Empty>
        )}
      </MemoryRow>

      <MemoryRow label="Conversation">
        {visibleTurns.length > 0 ? (
          <div className="space-y-1">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              {visibleTurns.length} {visibleTurns.length === 1 ? 'turn' : 'turns'} stored
              {lastTurn?.ts ? ` · last ${new Date(lastTurn.ts).toLocaleDateString()}` : ''}
            </p>
            {confirming ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleClear}
                  disabled={busy}
                  className="text-xs font-medium px-2.5 py-1 rounded border border-red-300 text-red-700 bg-red-50 dark:bg-red-950 dark:border-red-800 dark:text-red-300 disabled:opacity-60"
                >
                  {busy ? 'Clearing…' : 'Yes, clear it'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  className="text-xs text-slate-500 hover:text-slate-700"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirming(true)}
                className="text-xs font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 underline-offset-2 underline decoration-dotted"
              >
                Clear conversation
              </button>
            )}
          </div>
        ) : (
          <Empty>No turns yet.</Empty>
        )}
      </MemoryRow>

      <MemoryRow label="Pending observations">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          {pendingInferences.length === 0
            ? <Empty>None.</Empty>
            : `${pendingInferences.length} unaccepted ${pendingInferences.length === 1 ? 'note' : 'notes'} the coach has drafted about you.`}
        </p>
      </MemoryRow>

      <MemoryRow label="Daily archives">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          {dailyArchives.length === 0
            ? <Empty>None — conversations from earlier days haven't rolled over yet.</Empty>
            : `${dailyArchives.length} archived ${dailyArchives.length === 1 ? 'day' : 'days'} of chat.`}
        </p>
      </MemoryRow>
    </div>
  )
}

function MemoryRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-slate-100 dark:border-slate-700 pt-3 first-of-type:border-t-0 first-of-type:pt-0">
      <p className="text-[11px] uppercase tracking-wide font-semibold text-slate-400 dark:text-slate-500 mb-1">{label}</p>
      {children}
    </div>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <span className="text-sm italic text-slate-400 dark:text-slate-500">{children}</span>
}
