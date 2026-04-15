import { useEffect, useRef, useState } from 'react'
import type { ConversationTurn, CoachSnapshot } from '../types'
import { coachApiAvailable, coachApiBase } from '../utils/coachApi'
import type { UseCoachMemoryReturn } from '../hooks/useCoachMemory'

interface Props {
  athleteId: string
  memory: UseCoachMemoryReturn
  snapshot: CoachSnapshot | null
  seed?: string | null
  onSeedConsumed?: () => void
  onSent?: () => void
}

/**
 * Conversation surface — renders the turn history, a composer, and a
 * streaming assistant reply. Uses native `fetch` + ReadableStream to
 * parse SSE from /api/coach/chat. New user/assistant turns are persisted
 * server-side; we refresh memory after the stream completes.
 */
export default function CoachChat({ athleteId, memory, snapshot, seed, onSeedConsumed, onSent }: Props) {
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [liveReply, setLiveReply] = useState('')
  const [error, setError] = useState<string | null>(null)
  const scrollerRef = useRef<HTMLDivElement>(null)
  const seededRef = useRef<string | null>(null)

  // Consume seed on mount — post an invisible system-handoff turn so the
  // coach has the context of what the user just tapped on.
  useEffect(() => {
    if (seed && seededRef.current !== seed) {
      seededRef.current = seed
      memory.appendTurn(
        'system-handoff',
        `User tapped "Ask about this" on a coach card. The card read:\n"""\n${seed}\n"""`,
      )
      onSeedConsumed?.()
    }
  }, [seed, memory, onSeedConsumed])

  // Auto-scroll to bottom on new turns / stream chunks
  useEffect(() => {
    scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight, behavior: 'smooth' })
  }, [memory.conversation.length, liveReply])

  async function send() {
    const text = input.trim()
    if (!text || streaming) return
    if (!coachApiAvailable()) {
      setError('Coach is offline (API not configured).')
      return
    }
    setInput('')
    setStreaming(true)
    setLiveReply('')
    setError(null)
    onSent?.()

    // Optimistic append — the server will also persist this, so on refresh
    // we may see it twice briefly; acceptable.
    memory.patchLocal(m => ({
      ...m,
      conversation: [
        ...m.conversation,
        {
          id: `local_${Date.now()}`,
          role: 'user',
          content: text,
          ts: Date.now(),
        },
      ],
    }))

    try {
      // Send only the new user turn — the server has the full history
      const res = await fetch(`${coachApiBase()}/api/coach/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          athleteId,
          messages: [{ role: 'user', content: text }],
          snapshot,
        }),
      })
      if (!res.ok || !res.body) throw new Error(`http_${res.status}`)
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let accum = ''
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const parts = buffer.split('\n\n')
        buffer = parts.pop() || ''
        for (const p of parts) {
          const line = p.trim()
          if (!line.startsWith('data:')) continue
          const payload = line.slice(5).trim()
          try {
            const obj = JSON.parse(payload)
            if (obj.type === 'delta' && obj.text) {
              accum += obj.text
              setLiveReply(accum)
            } else if (obj.type === 'error') {
              setError(obj.message || 'stream error')
            }
          } catch {
            // ignore parse errors
          }
        }
      }
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setStreaming(false)
      setLiveReply('')
      // Pull fresh memory (includes assistant turn + any new inferences)
      memory.refresh()
    }
  }

  const turns = memory.conversation.filter(t => t.role !== 'system-handoff')

  return (
    <div className="flex flex-col h-[60vh] min-h-[400px] bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div
        ref={scrollerRef}
        className="flex-1 overflow-y-auto px-3 py-3 space-y-2.5"
      >
        {turns.length === 0 && !streaming && (
          <div className="text-center text-xs text-slate-400 py-8 px-4">
            <p className="mb-1">💬 Start a conversation with your coach.</p>
            <p>Ask about your training, how to pace a workout, or what today's readiness means.</p>
          </div>
        )}
        {turns.map(t => (
          <ChatTurn key={t.id} turn={t} />
        ))}
        {streaming && (
          <div className="flex">
            <div className="max-w-[85%] bg-indigo-50 text-slate-800 rounded-2xl rounded-tl-sm px-3 py-2 text-sm whitespace-pre-wrap leading-snug">
              {liveReply || <span className="text-indigo-400">…</span>}
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="px-3 py-1.5 text-xs text-red-700 bg-red-50 border-t border-red-100">
          {error}
        </div>
      )}

      <div className="border-t border-slate-200 px-2 py-2 flex items-end gap-2 bg-slate-50">
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              send()
            }
          }}
          placeholder={coachApiAvailable() ? 'Ask the coach…' : 'Coach is offline.'}
          rows={1}
          disabled={!coachApiAvailable() || streaming}
          className="flex-1 resize-none px-2.5 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-400 bg-white disabled:bg-slate-100"
        />
        <button
          onClick={send}
          disabled={!input.trim() || streaming || !coachApiAvailable()}
          className="text-xs font-semibold px-3 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 transition-colors"
        >
          {streaming ? '…' : 'Send'}
        </button>
      </div>
    </div>
  )
}

function ChatTurn({ turn }: { turn: ConversationTurn }) {
  if (turn.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] bg-indigo-600 text-white rounded-2xl rounded-tr-sm px-3 py-2 text-sm whitespace-pre-wrap leading-snug">
          {turn.content}
        </div>
      </div>
    )
  }
  if (turn.role === 'coach') {
    return (
      <div className="flex">
        <div className="max-w-[85%] bg-amber-50 border border-amber-200 text-slate-800 rounded-2xl rounded-tl-sm px-3 py-2 text-sm leading-snug">
          <p className="text-[10px] uppercase font-bold tracking-wider text-amber-700 mb-0.5">
            Coach ping {turn.trigger ? `· ${turn.trigger.replace(/_/g, ' ')}` : ''}
          </p>
          <p className="whitespace-pre-wrap">{turn.content}</p>
        </div>
      </div>
    )
  }
  // assistant
  return (
    <div className="flex">
      <div className="max-w-[85%] bg-indigo-50 text-slate-800 rounded-2xl rounded-tl-sm px-3 py-2 text-sm whitespace-pre-wrap leading-snug">
        {turn.content}
      </div>
    </div>
  )
}
