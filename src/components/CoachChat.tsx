import { useEffect, useRef, useState, useMemo } from 'react'
import type { ConversationTurn, CoachSnapshot, CoachAction, PlannedDay } from '../types'
import { coachApiAvailable, coachApiBase } from '../utils/coachApi'
import type { UseCoachMemoryReturn } from '../hooks/useCoachMemory'
import { renderMarkdown } from '../utils/markdown'
import { extractProposal, stripStreamingProposal } from '../utils/chatProposal'
import { resizeImage, type ResizedImage } from '../utils/imageResize'

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
  /** Return the planned day at (weekNum, dayIndex) so the action card
   *  can show "what → what" diff. */
  getPlannedDay?: (weekNum: number, dayIndex: number) => PlannedDay | null
  onApproveAction?: (turnId: string, action: CoachAction) => void
  onRejectAction?: (turnId: string) => void
  onUndoAction?: (turnId: string, overrideId: string) => void
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

export default function CoachChat({ athleteId, memory, snapshot, seed, onSeedConsumed, onSent, getPlannedDay, onApproveAction, onRejectAction, onUndoAction }: Props) {
  const coachName = snapshot?.coachPersona?.name?.trim() || 'Coach'
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const sendingRef = useRef(false)
  const [liveReply, setLiveReply] = useState('')
  const [liveStatus, setLiveStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [attachedImage, setAttachedImage] = useState<ResizedImage | null>(null)
  const [attaching, setAttaching] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
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

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''  // allow re-selecting same file
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError('Only image files are supported.')
      return
    }
    setAttaching(true)
    setError(null)
    try {
      const resized = await resizeImage(file)
      setAttachedImage(resized)
    } catch (err) {
      setError(`Couldn't process image: ${(err as Error).message}`)
    } finally {
      setAttaching(false)
    }
  }

  async function send() {
    const text = input.trim()
    if ((!text && !attachedImage) || streaming || sendingRef.current) return
    sendingRef.current = true
    if (!coachApiAvailable()) {
      sendingRef.current = false
      setError('Coach is offline (API not configured).')
      return
    }
    const image = attachedImage
    const promptText = text || (image ? 'What do you see in this photo?' : '')
    setInput('')
    setAttachedImage(null)
    setStreaming(true)
    setLiveReply('')
    setError(null)
    onSent?.()

    // Optimistic append. Annotate with image marker so the bubble shows
    // the attachment indicator even before the server round-trip lands.
    const optimisticContent = image
      ? `${promptText}\n\n[📷 image attached]`
      : promptText
    memory.patchLocal(m => ({
      ...m,
      conversation: [
        ...m.conversation,
        {
          id: `local_${Date.now()}`,
          role: 'user',
          content: optimisticContent,
          ts: Date.now(),
        },
      ],
    }))

    try {
      const userMessage: Record<string, unknown> = { role: 'user', content: promptText }
      if (image) {
        userMessage.image = { mediaType: image.mediaType, data: image.base64 }
      }
      const res = await fetch(`${coachApiBase()}/api/coach/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          athleteId,
          messages: [userMessage],
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
              setLiveStatus(null)
            } else if (obj.type === 'status' && obj.text) {
              setLiveStatus(obj.text)
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
      sendingRef.current = false
      setLiveReply('')
      setLiveStatus(null)
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
  void buildContextChip

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

  const canSend = (!!input.trim() || !!attachedImage) && !streaming && !attaching && coachApiAvailable()

  void adjustFontScale
  void fontScale

  return (
    <div className="flex flex-col h-full bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
      <div
        ref={scrollerRef}
        className="flex-1 overflow-y-auto px-2 py-1.5 space-y-2"
      >
        {turns.length === 0 && !streaming && (
          <div className="flex">
            <div className="max-w-[92%] bg-indigo-50 text-slate-800 rounded-2xl rounded-tl-sm px-3 py-2.5 text-base leading-relaxed">
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
          <ChatTurn
            key={t.id}
            turn={t}
            onCopy={copyText}
            coachName={coachName}
            fontScale={fontScale}
            getPlannedDay={getPlannedDay}
            onApproveAction={onApproveAction}
            onRejectAction={onRejectAction}
            onUndoAction={onUndoAction}
          />
        ))}
        {streaming && (
          <div className="flex flex-col gap-1">
            {liveStatus && !liveReply && (
              <div className="text-xs text-indigo-500 italic px-1">{liveStatus}</div>
            )}
            <div
              className="max-w-[92%] bg-indigo-50 text-slate-800 rounded-2xl rounded-tl-sm px-3 py-2 leading-relaxed"
              style={{ fontSize: `${fontScale}rem` }}
            >
              {liveReply ? renderMarkdown(stripStreamingProposal(liveReply)) : <span className="text-indigo-400">…</span>}
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="px-3 py-1.5 text-xs text-red-700 bg-red-50 border-t border-red-100">
          {error.includes('credit balance') || error.includes('billing')
            ? 'Anthropic API credits exhausted. Top up at console.anthropic.com → Plans & Billing, then try again.'
            : error.includes('budget_exceeded') || error.includes('429')
            ? 'Daily coach budget reached. Reset in Settings → Coach Diagnostics, or wait until midnight UTC.'
            : error}
        </div>
      )}

      <div className="border-t border-slate-200 dark:border-slate-700 px-2 py-1.5 bg-white dark:bg-slate-800 shrink-0">
        {(attachedImage || attaching) && (
          <div className="px-1 pb-1.5 flex items-center gap-2">
            {attaching && (
              <div className="text-xs text-slate-500 italic">Processing image…</div>
            )}
            {attachedImage && (
              <div className="relative inline-block">
                <img
                  src={attachedImage.dataUrl}
                  alt="attachment preview"
                  className="h-16 w-16 object-cover rounded-lg border border-slate-200 dark:border-slate-700"
                />
                <button
                  type="button"
                  onClick={() => setAttachedImage(null)}
                  aria-label="Remove image"
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-slate-800 text-white text-xs flex items-center justify-center shadow"
                >
                  ×
                </button>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  {attachedImage.width}×{attachedImage.height} · {(attachedImage.bytes / 1024).toFixed(0)}KB
                </div>
              </div>
            )}
          </div>
        )}
        <div className="relative flex items-end">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileSelect}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={!coachApiAvailable() || streaming || attaching}
            aria-label="Attach photo"
            className="mr-1 mb-1 w-9 h-9 flex items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path fillRule="evenodd" d="M4 5a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2V7a2 2 0 00-2-2h-1.586a1 1 0 01-.707-.293l-1.121-1.121A2 2 0 0011.172 3H8.828a2 2 0 00-1.414.586L6.293 4.707A1 1 0 015.586 5H4zm6 9a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
            </svg>
          </button>
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
            className="flex-1 resize-none pl-3 pr-11 py-2 text-base border border-slate-200 dark:border-slate-600 rounded-2xl focus:outline-none focus:ring-1 focus:ring-indigo-400 bg-white dark:bg-slate-700 dark:text-white disabled:bg-slate-100 max-h-[120px] leading-relaxed"
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
  getPlannedDay,
  onApproveAction,
  onRejectAction,
  onUndoAction,
}: {
  turn: ConversationTurn
  onCopy: (text: string) => void
  coachName?: string
  fontScale?: number
  getPlannedDay?: (weekNum: number, dayIndex: number) => PlannedDay | null
  onApproveAction?: (turnId: string, action: CoachAction) => void
  onRejectAction?: (turnId: string) => void
  onUndoAction?: (turnId: string, overrideId: string) => void
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

  // Extract any ```proposal block from the message. Prefer the turn's
  // pre-parsed action (if we stored one on approve/reject) so the
  // content doesn't re-parse every render.
  const parsed = useMemo(() => {
    if (turn.role !== 'assistant' && turn.role !== 'coach') {
      return { content: turn.content, action: null as CoachAction | null }
    }
    if (turn.action) {
      // Already parsed and persisted; strip the block from content too
      return extractProposal(turn.content)
    }
    return extractProposal(turn.content)
  }, [turn.content, turn.role, turn.action])

  const displayContent = parsed.content
  const inlineAction = turn.action || parsed.action

  const long = displayContent.length > COLLAPSE_CHAR_THRESHOLD
  const bubbleStyle = { fontSize: `${fontScale}rem` } as const
  const preview = collapsed
    ? displayContent.slice(0, 120).replace(/\s+\S*$/, '') + '…'
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
          className="relative max-w-[92%] bg-indigo-600 text-white rounded-2xl rounded-tr-sm px-3 py-2 leading-relaxed cursor-pointer"
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
            {collapsed ? <span className="italic opacity-80">{preview}</span> : renderMarkdown(displayContent)}
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
          {collapsed ? <p className="italic text-slate-500">{preview}</p> : renderMarkdown(displayContent)}
        </div>
        {copyBtn}
      </div>
    )
  }
  // assistant
  return (
    <div className="flex flex-col items-start" onClick={() => setShowActions(!showActions)}>
      <div
        className="relative w-full bg-indigo-50 dark:bg-indigo-950 text-slate-800 dark:text-slate-200 rounded-2xl rounded-tl-sm px-2 py-1.5 leading-relaxed cursor-pointer"
        style={bubbleStyle}
      >
        {collapseToggle}
        <div className={long ? 'pr-7' : undefined}>
          {collapsed ? <p className="italic text-slate-500">{preview}</p> : renderMarkdown(displayContent)}
        </div>
      </div>
      {inlineAction && inlineAction.type === 'propose_edit' && inlineAction.proposedEdit && (
        <ProposalCard
          turn={turn}
          action={inlineAction}
          getPlannedDay={getPlannedDay}
          onApprove={onApproveAction}
          onReject={onRejectAction}
          onUndo={onUndoAction}
        />
      )}
      {copyBtn}
    </div>
  )
}

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function ProposalCard({
  turn, action, getPlannedDay, onApprove, onReject, onUndo,
}: {
  turn: ConversationTurn
  action: CoachAction
  getPlannedDay?: (weekNum: number, dayIndex: number) => PlannedDay | null
  onApprove?: (turnId: string, action: CoachAction) => void
  onReject?: (turnId: string) => void
  onUndo?: (turnId: string, overrideId: string) => void
}) {
  const pe = action.proposedEdit!
  const original = getPlannedDay?.(pe.weekNum, pe.dayIndex)
  const dayLabel = original?.day || `Wk ${pe.weekNum} ${DAY_LABELS[pe.dayIndex]}`
  const status = turn.actionStatus || 'pending'

  if (status === 'applied') {
    return (
      <div
        className="mt-2 w-full flex items-center justify-between px-3 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-900"
        onClick={e => e.stopPropagation()}
      >
        <span className="text-xs text-emerald-700 dark:text-emerald-300 font-medium">
          ✓ Applied to {dayLabel}
        </span>
        {turn.actionOverrideId && (
          <button
            onClick={() => onUndo?.(turn.id, turn.actionOverrideId!)}
            className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 underline"
          >
            Undo
          </button>
        )}
      </div>
    )
  }

  if (status === 'rejected') {
    return (
      <div
        className="mt-2 w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
        onClick={e => e.stopPropagation()}
      >
        <span className="text-xs text-slate-500 dark:text-slate-400">
          Kept original for {dayLabel}
        </span>
      </div>
    )
  }

  return (
    <div
      className="mt-2 w-full rounded-xl bg-white dark:bg-slate-800 border-2 border-indigo-300 dark:border-indigo-700 overflow-hidden"
      onClick={e => e.stopPropagation()}
    >
      <div className="px-3 py-2 border-b border-indigo-100 dark:border-slate-700 bg-indigo-50 dark:bg-indigo-950">
        <p className="text-xs font-bold text-indigo-700 dark:text-indigo-300">
          📋 Proposed change for {dayLabel}
        </p>
      </div>
      <div className="px-3 py-2 space-y-1.5">
        {original && (
          <div className="text-[11px] text-slate-500 dark:text-slate-400">
            <span className="font-semibold">Current:</span> {original.workout}
          </div>
        )}
        <div className="text-xs text-slate-700 dark:text-slate-200">
          <span className="font-semibold text-indigo-700 dark:text-indigo-300">New:</span>{' '}
          {pe.updates.workout || action.detail}
        </div>
        {pe.updates.detail && (
          <div className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
            {pe.updates.detail}
          </div>
        )}
        {pe.updates.zone && (
          <div className="text-[11px] text-slate-500 dark:text-slate-400">
            Zone: {pe.updates.zone}{pe.updates.time ? ` · ${pe.updates.time}` : ''}
          </div>
        )}
        {pe.rationale && (
          <div className="text-[11px] italic text-slate-500 dark:text-slate-400 pt-1 border-t border-slate-100 dark:border-slate-700">
            "{pe.rationale}"
          </div>
        )}
      </div>
      <div className="flex gap-1 px-2 pb-2">
        <button
          onClick={() => onApprove?.(turn.id, action)}
          className="flex-1 text-xs font-semibold py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
        >
          ✓ Apply
        </button>
        <button
          onClick={() => onReject?.(turn.id)}
          className="flex-1 text-xs font-medium py-2 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
        >
          Keep original
        </button>
      </div>
    </div>
  )
}
