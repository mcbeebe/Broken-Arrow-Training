import { useEffect, useRef, useState } from 'react'
import type { ConversationTurn, CoachSnapshot } from '../types'
import { coachApiAvailable, coachApiBase } from '../utils/coachApi'
import type { UseCoachMemoryReturn } from '../hooks/useCoachMemory'
import { renderMarkdown } from '../utils/markdown'

/** Tiny toast that disappears after a beat. */
function CopiedToast({ visible }: { visible: boolean }) {
  if (!visible) return null
  return (
    <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 bg-slate-800 text-white text-sm px-4 py-2 rounded-full shadow-lg animate-fade-in">
      Copied to clipboard
    </div>
  )
}

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
  const coachName = snapshot?.coachPersona?.name?.trim() || 'Coach'
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [liveReply, setLiveReply] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [copiedToast, setCopiedToast] = useState(false)
  const scrollerRef = useRef<HTMLDivElement>(null)
  const seededRef = useRef<string | null>(null)

  function copyText(text: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedToast(true)
      setTimeout(() => setCopiedToast(false), 1500)
    }).catch(() => { /* silently fail — not critical */ })
  }

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
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // One-line snapshot chip above the composer. Derives from the same
  // data the LLM sees, so the user always knows what the coach "knows"
  // right now. Tapping it prefills a focused question.
  const chipText = buildContextChip(snapshot)

  // Auto-grow the textarea up to ~4 rows, then scroll inside it.
  // We measure scrollHeight by temporarily collapsing to 1-row height,
  // then expand. Using requestAnimationFrame avoids layout thrash that
  // causes a visible "glitch" on iOS/mobile.
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    requestAnimationFrame(() => {
      el.style.height = '0'
      const clamped = Math.min(el.scrollHeight, 120)
      el.style.height = `${Math.max(clamped, 42)}px`
      el.style.overflowY = el.scrollHeight > 120 ? 'auto' : 'hidden'
    })
  }, [input])

  const canSend = !!input.trim() && !streaming && coachApiAvailable()

  return (
    <div className="flex flex-col h-full bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div
        ref={scrollerRef}
        className="flex-1 overflow-y-auto px-3 py-3 space-y-2.5"
      >
        {turns.length === 0 && !streaming && (
          <div className="flex">
            <div className="max-w-[85%] bg-indigo-50 text-slate-800 rounded-2xl rounded-tl-sm px-3 py-2.5 text-base leading-relaxed">
              <p>👋 Morning — ready when you are.</p>
              <p className="text-sm text-slate-500 mt-1.5">
                Try <em>"What should I focus on this week?"</em> or <em>"How should I pace tomorrow's long run?"</em>
              </p>
            </div>
          </div>
        )}
        {turns.map(t => (
          <ChatTurn key={t.id} turn={t} onCopy={copyText} coachName={coachName} />
        ))}
        {streaming && (
          <div className="flex">
            <div className="max-w-[85%] bg-indigo-50 text-slate-800 rounded-2xl rounded-tl-sm px-3 py-2 text-base leading-relaxed">
              {liveReply ? renderMarkdown(liveReply) : <span className="text-indigo-400">…</span>}
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="px-3 py-1.5 text-xs text-red-700 bg-red-50 border-t border-red-100">
          {error}
        </div>
      )}

      {chipText && (
        <button
          onClick={() => setInput('What does this mean for today?')}
          className="mx-2 mb-1 px-3 py-1.5 rounded-full bg-slate-50 border border-slate-200 text-xs text-slate-600 hover:bg-slate-100 text-left truncate"
          title="Tap to ask about today's signals"
        >
          💡 {chipText}
        </button>
      )}

      <div className="border-t border-slate-200 px-2 py-2 bg-white shrink-0">
        <div className="relative flex items-end">
          <textarea
            ref={textareaRef}
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
            className="flex-1 resize-none pl-3 pr-11 py-2.5 text-base border border-slate-200 rounded-2xl focus:outline-none focus:ring-1 focus:ring-indigo-400 bg-white disabled:bg-slate-100 max-h-[120px] leading-relaxed"
          />
          {canSend && (
            <button
              onClick={send}
              aria-label="Send"
              className="absolute right-1.5 bottom-1.5 w-8 h-8 flex items-center justify-center rounded-full bg-indigo-600 text-white hover:bg-indigo-700 transition-colors shadow-sm"
            >
              {streaming ? (
                <span className="text-sm">…</span>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                  <path fillRule="evenodd" d="M10 17a1 1 0 01-1-1V6.414L5.707 9.707a1 1 0 01-1.414-1.414l5-5a1 1 0 011.414 0l5 5a1 1 0 01-1.414 1.414L11 6.414V16a1 1 0 01-1 1z" clipRule="evenodd" />
                </svg>
              )}
            </button>
          )}
        </div>
      </div>
      <CopiedToast visible={copiedToast} />
    </div>
  )
}

/**
 * Render a compact one-line summary of what the coach currently sees.
 * Returns null when there's nothing meaningful to report so the chip
 * simply doesn't render.
 */
function buildContextChip(snapshot: CoachSnapshot | null): string | null {
  if (!snapshot) return null
  const bits: string[] = []
  const r = snapshot.readiness
  if (r?.status && typeof r.displayScore === 'number') {
    bits.push(`${r.status.toLowerCase()} ${r.displayScore}/100`)
  }
  const h = snapshot.todayHealth
  if (h?.sleepHours !== undefined) {
    bits.push(`sleep ${h.sleepHours}h`)
  }
  const acwr = snapshot.performance?.acwr
  if (typeof acwr === 'number' && !Number.isNaN(acwr)) {
    bits.push(`ACWR ${acwr.toFixed(2)}`)
  }
  if (bits.length === 0) return null
  return bits.join(' · ')
}

function ChatTurn({ turn, onCopy, coachName = 'Coach' }: { turn: ConversationTurn; onCopy: (text: string) => void; coachName?: string }) {
  const [showActions, setShowActions] = useState(false)

  const copyBtn = showActions && (
    <button
      onClick={e => { e.stopPropagation(); onCopy(turn.content); setShowActions(false) }}
      className="text-[10px] font-medium text-slate-500 hover:text-slate-700 bg-white/90 backdrop-blur rounded-full px-2 py-0.5 shadow-sm border border-slate-200 mt-1 transition-opacity"
    >
      Copy
    </button>
  )

  if (turn.role === 'user') {
    return (
      <div className="flex flex-col items-end" onClick={() => setShowActions(!showActions)}>
        <div className="max-w-[85%] bg-indigo-600 text-white rounded-2xl rounded-tr-sm px-3 py-2 text-base leading-relaxed cursor-pointer">
          {renderMarkdown(turn.content)}
        </div>
        {copyBtn}
      </div>
    )
  }
  if (turn.role === 'coach') {
    return (
      <div className="flex flex-col items-start" onClick={() => setShowActions(!showActions)}>
        <div className="max-w-[85%] bg-amber-50 border border-amber-200 text-slate-800 rounded-2xl rounded-tl-sm px-3 py-2 text-base leading-relaxed cursor-pointer">
          <p className="text-xs uppercase font-bold tracking-wider text-amber-700 mb-1">
            {coachName} {turn.trigger ? `· ${turn.trigger.replace(/_/g, ' ')}` : ''}
          </p>
          {renderMarkdown(turn.content)}
        </div>
        {copyBtn}
      </div>
    )
  }
  // assistant
  return (
    <div className="flex flex-col items-start" onClick={() => setShowActions(!showActions)}>
      <div className="max-w-[85%] bg-indigo-50 text-slate-800 rounded-2xl rounded-tl-sm px-3 py-2 text-base leading-relaxed cursor-pointer">
        {renderMarkdown(turn.content)}
      </div>
      {copyBtn}
    </div>
  )
}
