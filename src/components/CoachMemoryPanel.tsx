import { useMemo, useState } from 'react'
import type { ConversationTurn, CoachPersona, PendingInference, AboutMeFact } from '../types'
import { DEFAULT_COACH_NAME } from '../types'
import { useCoachSummaryCard } from '../hooks/useCoachSummaryCard'

interface DailyArchive {
  id?: string
  date?: string
}

interface Props {
  /** Athlete id — drives the curated "About you" distillation fetch.
   *  When absent (or coach is off), the panel falls back to rendering
   *  the raw fact list directly. */
  athleteId?: string
  aboutMe: string
  /** Sprint 4 — structured facts. Optional so callers that don't have
   *  the new schema yet (legacy / pre-migration memory) still render
   *  the plain `aboutMe` string. */
  aboutMeFacts?: AboutMeFact[]
  coachPersona: CoachPersona
  conversation: ConversationTurn[]
  pendingInferences: PendingInference[]
  dailyArchives: DailyArchive[]
  onClearConversation: () => void | Promise<void>
  /** Per-fact mutations. Optional — when omitted, the facts list still
   *  renders but read-only. */
  onAddFact?: (text: string) => void | Promise<void>
  onEditFact?: (id: string, text: string) => void | Promise<void>
  onDeleteFact?: (id: string) => void | Promise<void>
}

/**
 * "What I remember about you" — a memory inspector for the coach.
 *
 * The persona review found users mistrust an AI they cannot audit. This panel
 * lists exactly what's stored on their behalf: their About Me text, the coach
 * persona, the recent conversation, pending observations, and daily archives.
 *
 * Sprint 4 — About You is now structured. Each fact carries a learnedAt
 * timestamp and can be edited or deleted inline. This activates the
 * memory-as-switching-cost moat: every month the athlete stays, the cost
 * of leaving grows because they'd have to re-teach a new system.
 */
export default function CoachMemoryPanel({
  athleteId,
  aboutMe,
  aboutMeFacts,
  coachPersona,
  conversation,
  pendingInferences,
  dailyArchives,
  onClearConversation,
  onAddFact,
  onEditFact,
  onDeleteFact,
}: Props) {
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [managing, setManaging] = useState(false)

  const visibleTurns = conversation.filter(t => t.role !== 'system-handoff')
  const lastTurn = visibleTurns[visibleTurns.length - 1]
  const personaTraits = (coachPersona?.traits ?? []).filter(Boolean)
  const personaName = (coachPersona?.name || '').trim()
  const factsAvailable = !!aboutMeFacts && aboutMeFacts.length > 0
  const canEditFacts = !!onEditFact && !!onDeleteFact

  // Curated 3-5 line distillation of `aboutMeFacts`, in customer
  // language ("You run too hard on easy days") rather than raw verbatim
  // ("Tuesday 52min avgHR 146, Friday 33min avgHR 147..."). Cached
  // server-side by content hash, so the LLM only fires when the
  // underlying facts change. Falls back to the raw list when the API
  // isn't reachable or there's no athleteId.
  const summaryCard = useCoachSummaryCard(athleteId ?? '', !!athleteId, aboutMeFacts)
  const curatedAvailable = summaryCard.facts.length > 0
  const curatedLoading = summaryCard.loading && !curatedAvailable

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
          The coach uses this context on every reply.
        </p>
      </div>

      <MemoryRow label="About you">
        {/* Primary view: 3-5 curated lines in customer language. The
            raw verbatim fact list is power-user territory and lives
            behind the "Manage all facts" disclosure below. */}
        {curatedLoading ? (
          <div className="space-y-1.5 animate-pulse">
            <div className="h-3 w-full bg-slate-200 dark:bg-slate-700 rounded" />
            <div className="h-3 w-5/6 bg-slate-200 dark:bg-slate-700 rounded" />
            <div className="h-3 w-3/4 bg-slate-200 dark:bg-slate-700 rounded" />
          </div>
        ) : curatedAvailable ? (
          <ul className="space-y-1.5">
            {summaryCard.facts.map((line, i) => (
              <li
                key={i}
                className="text-sm text-slate-700 dark:text-slate-200 leading-snug flex gap-2"
              >
                <span className="text-slate-400 dark:text-slate-500 shrink-0" aria-hidden>•</span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
        ) : factsAvailable ? (
          // No curated payload yet (API off, etc.) — render the raw
          // facts inline so the panel always shows something.
          <FactsList
            facts={aboutMeFacts!}
            onEdit={onEditFact}
            onDelete={onDeleteFact}
          />
        ) : aboutMe.trim() ? (
          <p className="text-sm text-slate-600 dark:text-slate-300 leading-snug whitespace-pre-wrap line-clamp-3">{aboutMe.trim()}</p>
        ) : (
          <Empty>You haven't shared anything yet.</Empty>
        )}

        {/* Power-user disclosure: full per-fact list with add/edit/delete.
            Hidden by default so the primary card stays glanceable; only
            opens when the athlete actually wants to fine-tune. Skipped
            entirely when the curated view fell through to raw facts
            above (avoid double-render). */}
        {factsAvailable && curatedAvailable && canEditFacts && (
          <div className="mt-3">
            <button
              type="button"
              onClick={() => setManaging(m => !m)}
              className="text-xs font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 underline-offset-2 underline decoration-dotted"
            >
              {managing ? 'Hide' : `Manage all ${aboutMeFacts!.length} ${aboutMeFacts!.length === 1 ? 'fact' : 'facts'}`} {managing ? '▴' : '▾'}
            </button>
            {managing && (
              <div className="mt-2">
                <FactsList
                  facts={aboutMeFacts!}
                  onEdit={onEditFact}
                  onDelete={onDeleteFact}
                />
                {onAddFact && <AddFactInline onAdd={onAddFact} />}
              </div>
            )}
          </div>
        )}

        {/* When there's no curated view (raw fallback rendered above),
            still expose the add-fact affordance so the user can teach
            the coach. */}
        {!curatedAvailable && onAddFact && canEditFacts && <AddFactInline onAdd={onAddFact} />}
      </MemoryRow>

      <MemoryRow label="Coach persona">
        {(personaName || personaTraits.length) ? (
          <p className="text-sm text-slate-600 dark:text-slate-300">
            {personaName || DEFAULT_COACH_NAME}{personaTraits.length ? ` · ${personaTraits.join(' · ')}` : ''}
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

/** Compact relative-time label for fact provenance ("2d ago", "5mo ago").
 *  Keeps the panel scannable on a phone. */
function relativeAge(ms: number): string {
  const diff = Math.max(0, Date.now() - ms)
  const sec = Math.floor(diff / 1000)
  if (sec < 60) return 'just now'
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  if (day < 7) return `${day}d ago`
  const wk = Math.floor(day / 7)
  if (wk < 5) return `${wk}w ago`
  const mo = Math.floor(day / 30)
  if (mo < 12) return `${mo}mo ago`
  return `${Math.floor(day / 365)}y ago`
}

function FactsList({
  facts,
  onEdit,
  onDelete,
}: {
  facts: AboutMeFact[]
  onEdit?: (id: string, text: string) => void | Promise<void>
  onDelete?: (id: string) => void | Promise<void>
}) {
  // Newest first — that's what athletes intuitively scan for. Long
  // memories (50+ facts) are common after a few months of chat, so
  // collapse to a top slice by default and offer a "Show all" toggle.
  const sorted = useMemo(
    () => [...facts].sort((a, b) => (b.learnedAt || 0) - (a.learnedAt || 0)),
    [facts],
  )
  const [showAll, setShowAll] = useState(false)
  const COLLAPSED_COUNT = 6
  const visible = showAll ? sorted : sorted.slice(0, COLLAPSED_COUNT)
  const hiddenCount = sorted.length - visible.length

  return (
    <div>
      <ul className="space-y-1.5">
        {visible.map(f => (
          <FactRow
            key={f.id}
            fact={f}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
      </ul>
      {sorted.length > COLLAPSED_COUNT && (
        <button
          type="button"
          onClick={() => setShowAll(v => !v)}
          className="mt-2 text-xs font-medium text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-200"
        >
          {showAll
            ? `Show fewer`
            : `Show all ${sorted.length} facts (+${hiddenCount} more)`}
        </button>
      )}
    </div>
  )
}

function FactRow({
  fact,
  onEdit,
  onDelete,
}: {
  fact: AboutMeFact
  onEdit?: (id: string, text: string) => void | Promise<void>
  onDelete?: (id: string) => void | Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(fact.text)
  const [busy, setBusy] = useState(false)
  const canEdit = !!onEdit
  const canDelete = !!onDelete
  const editedNote = fact.editedAt && fact.editedAt > fact.learnedAt ? ' · edited' : ''

  async function commit() {
    if (!onEdit) return
    const next = draft.trim()
    if (!next || next === fact.text) {
      setEditing(false)
      setDraft(fact.text)
      return
    }
    setBusy(true)
    try {
      await onEdit(fact.id, next)
      setEditing(false)
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!onDelete) return
    setBusy(true)
    try {
      await onDelete(fact.id)
    } finally {
      setBusy(false)
    }
  }

  if (editing) {
    return (
      <li className="bg-slate-50 dark:bg-slate-900 rounded-md p-2 space-y-1.5">
        <textarea
          autoFocus
          value={draft}
          onChange={e => setDraft(e.target.value)}
          rows={2}
          className="w-full text-sm text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-teal-400"
          onKeyDown={e => {
            if (e.key === 'Escape') {
              setEditing(false)
              setDraft(fact.text)
            }
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              commit()
            }
          }}
        />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={commit}
            disabled={busy || !draft.trim()}
            className="text-xs font-medium px-2 py-1 rounded bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50"
          >
            {busy ? 'Saving…' : 'Save'}
          </button>
          <button
            type="button"
            onClick={() => { setEditing(false); setDraft(fact.text) }}
            className="text-xs text-slate-500 hover:text-slate-700"
          >
            Cancel
          </button>
        </div>
      </li>
    )
  }

  return (
    <li className="group flex items-start gap-2 py-1">
      <span className="text-slate-300 dark:text-slate-600 mt-0.5 select-none">•</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-slate-700 dark:text-slate-200 leading-snug">{fact.text}</p>
        <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
          {relativeAge(fact.learnedAt)}{editedNote}
        </p>
      </div>
      {(canEdit || canDelete) && (
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
          {canEdit && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              aria-label="Edit fact"
              className="text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 px-1"
            >
              ✏️
            </button>
          )}
          {canDelete && (
            <button
              type="button"
              onClick={remove}
              disabled={busy}
              aria-label="Delete fact"
              className="text-xs text-red-400 hover:text-red-600 px-1 disabled:opacity-50"
            >
              🗑
            </button>
          )}
        </div>
      )}
    </li>
  )
}

function AddFactInline({ onAdd }: { onAdd: (text: string) => void | Promise<void> }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  async function commit() {
    const t = text.trim()
    if (!t) return
    setBusy(true)
    try {
      await onAdd(t)
      setText('')
      setOpen(false)
    } finally {
      setBusy(false)
    }
  }
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2 text-xs font-medium text-teal-700 dark:text-teal-400 hover:text-teal-900 dark:hover:text-teal-200"
      >
        + Add something
      </button>
    )
  }
  return (
    <div className="mt-2 space-y-1.5">
      <input
        autoFocus
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder="e.g. I prefer morning runs"
        className="w-full text-sm text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-teal-400"
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); commit() }
          if (e.key === 'Escape') { setOpen(false); setText('') }
        }}
      />
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={commit}
          disabled={busy || !text.trim()}
          className="text-xs font-medium px-2 py-1 rounded bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50"
        >
          {busy ? 'Adding…' : 'Add'}
        </button>
        <button
          type="button"
          onClick={() => { setOpen(false); setText('') }}
          className="text-xs text-slate-500 hover:text-slate-700"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
