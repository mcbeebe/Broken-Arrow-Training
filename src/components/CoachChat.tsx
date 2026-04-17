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
const FONT_SCALE_KEY_PREFIX = 'ba_coach_font_scale:'
const FONT_SCALE_OPTIONS = [0.7, 0.8, 0.9, 1.0, 1.15, 1.3] as const

function readFontScale(athleteId: string): number {
  try {
    const raw = localStorage.getItem(`${FONT_SCALE_KEY_PREFIX}${athleteId}`)
    const n = raw ? parseFloat(raw) : 1.0
    if (!Number.isFinite(n)) return 1.0
    // Snap to the closest valid option — seed the reducer with the
    // first option so we actually compare every candidate.
    return FONT_SCALE_OPTIONS.reduce<number>((best, opt) =>
      Math.abs(opt - n) < Math.abs(best - n) ? opt : best
    , FONT_SCALE_OPTIONS[0])
  } catch {
    return 1.0
  }
}

function writeFontScale(athleteId: string, scale: number) {
  try {
    localStorage.setItem(`${FONT_SCALE_KEY_PREFIX}${athleteId}`, String(scale))
  } catch {
    /* quota */
  }
}

export default function CoachChat({ athleteId, memory, snapshot, seed, onSeedConsumed, onSent }: Props) {
  const coachName = snapshot?.coachPersona?.name?.trim() || 'Coach'
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [liveReply, setLiveReply] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [copiedToast, setCopiedToast] = useState(false)
  const [fontScale, setFontScaleState] = useState(() => readFontScale(athleteId))
  const scrollerRef = useRef<HTMLDivElement>(null)
  const seededRef = useRef<string | null>(null)

  function adjustFontScale(delta: 1 | -1) {
    const idx = FONT_SCALE_OPTIONS.indexOf(fontScale as typeof FONT_SCALE_OPTIONS[number])
    const currentIdx = idx >= 0 ? idx : 1
    const nextIdx = Math.max(0, Math.min(FONT_SCALE_OPTIONS.length - 1, currentIdx + delta))
    const next = FONT_SCALE_OPTIONS[nextIdx]
    setFontScaleState(next)
    writeFontScale(athleteId, next)
  }

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

  // Show all turns. system-handoff turns mostly stay hidden, but the
  // PERSONA UPDATED markers render as a visible inline divider so the
  // athlete sees the persona change took effect.
  const turns = memory.conversation.filter(
    t => t.role !== 'system-handoff' || t.content.startsWith('[PERSONA UPDATED]')
  )
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

  // Font-size control bar — A− / A+ sits tucked above the chat
  // scroller so it's reachable without leaving the tab. Disabled
  // states at the size extremes.
  const atMinScale = fontScale <= FONT_SCALE_OPTIONS[0]
  const atMaxScale = fontScale >= FONT_SCALE_OPTIONS[FONT_SCALE_OPTIONS.length - 1]

  return (
    <div className="flex flex-col h-full bg-white rounded-xl border border-slate-200 overflow-hidden">
      {/* Font size controls */}
      <div className="flex items-center justify-end gap-1 px-2 py-1 border-b border-slate-100 shrink-0">
        <span className="text-xs text-slate-400 mr-1">Text</span>
        <button
          onClick={() => adjustFontScale(-1)}
          disabled={atMinScale}
          className="w-7 h-7 flex items-center justify-center rounded-md text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title="Smaller text"
        >
          A−
        </button>
        <button
          onClick={() => adjustFontScale(1)}
          disabled={atMaxScale}
          className="w-7 h-7 flex items-center justify-center rounded-md text-sm font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title="Larger text"
        >
          A+
        </button>
      </div>
      <div
        ref={scrollerRef}
        className="flex-1 overflow-y-auto px-1 py-1.5 space-y-2"
      >
        {turns.length === 0 && !streaming && (
          <div className="flex">
            <div className="max-w-[85%] bg-indigo-50 text-slate-800 rounded-2xl rounded-tl-sm px-3 py-2.5 text-base leading-relaxed">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xl leading-none" role="img" aria-label="coach">🧢</span>
                <p className="text-xs uppercase font-bold tracking-wider text-indigo-700">{coachName}</p>
              </div>
              <p>Ready when you are.</p>
              <p className="text-sm text-slate-500 mt-1.5">
                Try <em>"What should I focus on this week?"</em> or <em>"How should I pace tomorrow's long run?"</em>
              </p>
            </div>
          </div>
        )}
        {turns.map(t => (
          <ChatTurn key={t.id} turn={t} onCopy={copyText} coachName={coachName} fontScale={fontScale} />
        ))}
        {streaming && (
          <div className="flex">
            <div
              className="max-w-[85%] bg-indigo-50 text-slate-800 rounded-2xl rounded-tl-sm px-3 py-2 leading-relaxed"
              style={{ fontSize: `${fontScale}rem` }}
            >
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

/** Long-response threshold — replies over this many chars get a
 *  collapse affordance so the athlete can stash them and scroll past. */
const COLLAPSE_CHAR_THRESHOLD = 400

function ChatTurn({
  turn,
  onCopy,
  coachName = 'Coach',
  fontScale = 1.0,
}: {
  turn: ConversationTurn
  onCopy: (text: string) => void
  coachName?: string
  fontScale?: number
}) {
  const [showActions, setShowActions] = useState(false)
  const [collapsed, setCollapsed] = useState(false)

  // PERSONA UPDATED handoff → render as a small inline divider so the
  // athlete sees their persona edit landed in the thread.
  if (turn.role === 'system-handoff' && turn.content.startsWith('[PERSONA UPDATED]')) {
    const nameMatch = turn.content.match(/New name:\s*([^.]+?)\.\s*New traits:\s*([^.]+?)\./)
    const summary = nameMatch
      ? `${nameMatch[1].trim()} — ${nameMatch[2].trim()}`
      : 'Coach updated'
    return (
      <div className="flex items-center gap-2 my-2">
        <div className="flex-1 h-px bg-slate-200" />
        <span className="text-xs text-slate-500 italic px-2">🧢 {summary}</span>
        <div className="flex-1 h-px bg-slate-200" />
      </div>
    )
  }

  const long = turn.content.length > COLLAPSE_CHAR_THRESHOLD
  const bubbleStyle = { fontSize: `${fontScale}rem` } as const
  const preview = collapsed
    ? turn.content.slice(0, 120).replace(/\s+\S*$/, '') + '…'
    : null

  // Small ▾/▴ toggle shown in the bubble's corner when the reply is
  // long enough to warrant collapsing.
  const collapseToggle = long && (
    <button
      onClick={e => { e.stopPropagation(); setCollapsed(!collapsed) }}
      className="absolute top-1.5 right-1.5 w-6 h-6 flex items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 transition-colors"
      title={collapsed ? 'Expand' : 'Collapse'}
    >
      {collapsed ? '▾' : '▴'}
    </button>
  )

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
        <div
          className="relative max-w-[85%] bg-indigo-600 text-white rounded-2xl rounded-tr-sm px-3 py-2 leading-relaxed cursor-pointer"
          style={bubbleStyle}
        >
          {/* Collapse toggle on the left for user bubbles since bubble aligns right */}
          {long && (
            <button
              onClick={e => { e.stopPropagation(); setCollapsed(!collapsed) }}
              className="absolute top-1.5 left-1.5 w-6 h-6 flex items-center justify-center rounded-full text-white/80 hover:bg-white/10 transition-colors"
              title={collapsed ? 'Expand' : 'Collapse'}
            >
              {collapsed ? '▾' : '▴'}
            </button>
          )}
          <div className={long ? 'pl-6' : undefined}>
            {collapsed ? <span className="italic opacity-80">{preview}</span> : renderMarkdown(turn.content)}
          </div>
        </div>
        {copyBtn}
      </div>
    )
  }
  if (turn.role === 'coach') {
    return (
      <div className="flex flex-col items-start" onClick={() => setShowActions(!showActions)}>
        <div
          className="relative w-full bg-amber-50 border border-amber-200 text-slate-800 rounded-2xl rounded-tl-sm px-2 py-1.5 leading-relaxed cursor-pointer"
          style={bubbleStyle}
        >
          <div className="flex items-center gap-1.5 mb-1 pr-7">
            <span className="text-base leading-none" role="img" aria-label="coach">🧢</span>
            <p className="text-xs uppercase font-bold tracking-wider text-amber-700">
              {coachName}{turn.trigger ? ` · ${turn.trigger.replace(/_/g, ' ')}` : ''}
            </p>
          </div>
          {collapseToggle}
          {collapsed ? <p className="italic text-slate-500">{preview}</p> : renderMarkdown(turn.content)}
        </div>
        {copyBtn}
      </div>
    )
  }
  // assistant
  return (
    <div className="flex flex-col items-start" onClick={() => setShowActions(!showActions)}>
      <div
        className="relative w-full bg-indigo-50 text-slate-800 rounded-2xl rounded-tl-sm px-2 py-1.5 leading-relaxed cursor-pointer"
        style={bubbleStyle}
      >
        {collapseToggle}
        <div className={long ? 'pr-7' : undefined}>
          {collapsed ? <p className="italic text-slate-500">{preview}</p> : renderMarkdown(turn.content)}
        </div>
      </div>
      {copyBtn}
    </div>
  )
}
