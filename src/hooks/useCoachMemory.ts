import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CoachMemory, CoachPersona, ConversationTurn, DailyChatArchive } from '../types'
import { DEFAULT_COACH_NAME } from '../types'
import { coachApiAvailable, coachFetch } from '../utils/coachApi'
import { stampKey } from '../utils/syncStamps'

/**
 * Server-backed Coach memory (replaces useAboutMe). Persisted in Upstash KV
 * so conversation + About Me + pending inferences sync across devices.
 *
 * Falls back to localStorage-only behaviour when the coach API is not
 * reachable (offline / no env var). About Me is still writable in that
 * mode; conversation + inferences simply aren't available.
 */

const LS_KEY_PREFIX = 'ba_coach_memory_v1:'

function emptyMemory(): CoachMemory {
  return {
    aboutMe: '',
    conversation: [],
    conversationSummary: null,
    pendingInferences: [],
  }
}

function readLocal(athleteId: string): CoachMemory {
  try {
    const raw = localStorage.getItem(LS_KEY_PREFIX + athleteId)
    if (!raw) return emptyMemory()
    const parsed = JSON.parse(raw)
    return { ...emptyMemory(), ...parsed }
  } catch {
    return emptyMemory()
  }
}

function writeLocal(athleteId: string, mem: CoachMemory) {
  const key = LS_KEY_PREFIX + athleteId
  try {
    localStorage.setItem(key, JSON.stringify(mem))
    stampKey(key)
  } catch {
    // best effort
  }
}

// Proposal apply-state (actionStatus / actionOverrideId) is UI state the
// server never stores. Without a separate home it gets wiped the moment a
// server sync (refresh / mutate) replaces the conversation — which is why
// the green "Applied" confirmation used to flash and vanish. We persist
// these per-turn fields in their own key and re-merge them onto the
// conversation after every server sync.
const TURN_UI_KEY_PREFIX = 'ba_coach_turn_ui_v1:'
type TurnUi = { actionStatus?: ConversationTurn['actionStatus']; actionOverrideId?: string }

function readTurnUi(athleteId: string): Record<string, TurnUi> {
  try {
    const raw = localStorage.getItem(TURN_UI_KEY_PREFIX + athleteId)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function writeTurnUi(athleteId: string, map: Record<string, TurnUi>) {
  const key = TURN_UI_KEY_PREFIX + athleteId
  try {
    localStorage.setItem(key, JSON.stringify(map))
    stampKey(key)
  } catch {
    // best effort
  }
}

/** Re-apply persisted per-turn UI fields onto a (server-sourced) memory so
 *  proposal apply-state survives syncs. */
function applyTurnUi(athleteId: string, mem: CoachMemory): CoachMemory {
  const ui = readTurnUi(athleteId)
  if (!mem.conversation?.length || Object.keys(ui).length === 0) return mem
  return {
    ...mem,
    conversation: mem.conversation.map(t => (ui[t.id] ? { ...t, ...ui[t.id] } : t)),
  }
}

export function useCoachMemory(athleteId: string, enabled: boolean = true) {
  const [memory, setMemory] = useState<CoachMemory>(() => readLocal(athleteId))
  const [loaded, setLoaded] = useState(false)
  const [online, setOnline] = useState(false)
  const inflight = useRef<Promise<void> | null>(null)

  const apiAvailable = coachApiAvailable()

  const refresh = useCallback(async () => {
    if (!enabled || !apiAvailable || !athleteId) {
      setLoaded(true)
      return
    }
    if (inflight.current) return inflight.current
    const p = (async () => {
      try {
        const server = await coachFetch<CoachMemory>(
          `/api/coach/memory?athleteId=${encodeURIComponent(athleteId)}`,
        )
        const merged = applyTurnUi(athleteId, server)
        setMemory(merged)
        writeLocal(athleteId, merged)
        setOnline(true)
      } catch {
        setOnline(false)
      } finally {
        setLoaded(true)
      }
    })()
    inflight.current = p
    try {
      await p
    } finally {
      inflight.current = null
    }
  }, [athleteId, enabled, apiAvailable])

  // Load on mount + athlete change
  useEffect(() => {
    setMemory(readLocal(athleteId))
    setLoaded(false)
    refresh()
  }, [athleteId, refresh])

  // Refresh on window focus
  useEffect(() => {
    if (!enabled || !apiAvailable) return
    function onFocus() {
      refresh()
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [refresh, enabled, apiAvailable])

  // Re-read on cross-device sync pulls (synthetic `storage` events).
  // Both keys are scoped per-athlete; either changing means the local
  // copy is fresh and the in-memory state should rehydrate. We re-read
  // from local rather than calling `refresh()` because the sync pull
  // already wrote the authoritative value to localStorage.
  useEffect(() => {
    const memoryK = LS_KEY_PREFIX + athleteId
    const turnUiK = TURN_UI_KEY_PREFIX + athleteId
    function onStorage(e: StorageEvent) {
      if (e.key !== memoryK && e.key !== turnUiK) return
      const fresh = readLocal(athleteId)
      setMemory(applyTurnUi(athleteId, fresh))
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [athleteId])

  const mutate = useCallback(
    async (action: string, extra: Record<string, unknown> = {}) => {
      if (!apiAvailable) return
      try {
        const server = await coachFetch<CoachMemory>(
          `/api/coach/memory?athleteId=${encodeURIComponent(athleteId)}`,
          {
            method: 'POST',
            body: JSON.stringify({ action, ...extra }),
          },
        )
        const merged = applyTurnUi(athleteId, server)
        setMemory(merged)
        writeLocal(athleteId, merged)
        setOnline(true)
      } catch {
        setOnline(false)
      }
    },
    [athleteId, apiAvailable],
  )

  const saveAboutMe = useCallback(
    async (next: string) => {
      // Optimistic
      setMemory(m => {
        const updated = { ...m, aboutMe: next }
        writeLocal(athleteId, updated)
        return updated
      })
      if (apiAvailable) {
        await mutate('save_about_me', { text: next })
      }
    },
    [athleteId, apiAvailable, mutate],
  )

  const clearAboutMe = useCallback(async () => {
    setMemory(m => {
      const updated = { ...m, aboutMe: '', aboutMeFacts: [] }
      writeLocal(athleteId, updated)
      return updated
    })
    if (apiAvailable) {
      await mutate('clear_about_me')
    }
  }, [athleteId, apiAvailable, mutate])

  // Sprint 4 — per-fact CRUD. These don't optimistically patch local
  // state because the server is authoritative on fact IDs (it stamps a
  // new uuid on add) and we want the panel to render the same view the
  // server has. Mutate → server → setMemory(server). Fast enough since
  // the actions are infrequent.
  const addAboutMeFact = useCallback(
    async (text: string, sourceTurnId?: string) => {
      if (!apiAvailable) return
      const body: Record<string, unknown> = { text }
      if (sourceTurnId) body.sourceTurnId = sourceTurnId
      await mutate('add_about_me_fact', body)
    },
    [apiAvailable, mutate],
  )

  const editAboutMeFact = useCallback(
    async (id: string, text: string) => {
      if (!apiAvailable) return
      await mutate('edit_about_me_fact', { id, text })
    },
    [apiAvailable, mutate],
  )

  const deleteAboutMeFact = useCallback(
    async (id: string) => {
      if (!apiAvailable) return
      await mutate('delete_about_me_fact', { id })
    },
    [apiAvailable, mutate],
  )

  const appendTurn = useCallback(
    async (role: ConversationTurn['role'], content: string, trigger?: string) => {
      await mutate('append_turn', trigger ? { role, content, trigger } : { role, content })
    },
    [mutate],
  )

  const acceptInference = useCallback(
    async (id: string) => {
      await mutate('accept_inference', { id })
    },
    [mutate],
  )

  const dismissInference = useCallback(
    async (id: string) => {
      await mutate('dismiss_inference', { id })
    },
    [mutate],
  )

  const markRead = useCallback(
    async (turnId?: string) => {
      // Optimistic: clear unread flags client-side immediately
      setMemory(m => {
        const updated = {
          ...m,
          conversation: m.conversation.map(t => ({
            ...t,
            unread: t.role === 'coach' && t.unread ? false : t.unread,
          })),
        }
        writeLocal(athleteId, updated)
        return updated
      })
      await mutate('mark_read', { turnId })
    },
    [athleteId, mutate],
  )

  const clearConversation = useCallback(async () => {
    await mutate('clear_conversation')
  }, [mutate])

  const rolloverDay = useCallback(
    async (date: string) => {
      await mutate('rollover_day', { date })
    },
    [mutate],
  )

  const saveCoachPersona = useCallback(
    async (persona: CoachPersona) => {
      // Optimistic
      setMemory(m => {
        const updated = { ...m, coachPersona: persona }
        writeLocal(athleteId, updated)
        return updated
      })
      if (apiAvailable) {
        await mutate('save_coach_persona', { persona })
        // If there's an active conversation, inject a system-handoff
        // marker so the LLM adapts mid-thread. Without this, prior
        // replies in the old voice anchor the model and the new
        // persona takes several turns (or a clear) to show up.
        const visibleTurns = memory.conversation.filter(t => t.role !== 'system-handoff')
        if (visibleTurns.length > 0) {
          const name = persona.name?.trim() || DEFAULT_COACH_NAME
          const traits = (persona.traits || []).join(', ') || 'none set'
          const note =
            `[PERSONA UPDATED] The athlete just changed the coach's identity in Settings. ` +
            `New name: ${name}. New traits: ${traits}. ` +
            `From this turn forward, match this new persona fully. DO NOT mirror the voice ` +
            `of prior replies in this thread — they were written under a different persona ` +
            `and should not anchor your tone.`
          await mutate('append_turn', { role: 'system-handoff', content: note })
        }
      }
    },
    [athleteId, apiAvailable, mutate, memory.conversation],
  )

  const unreadCount = useMemo(
    () => memory.conversation.filter(t => t.role === 'coach' && t.unread).length,
    [memory.conversation],
  )

  // Allow local optimistic inserts (used by CoachChat while streaming)
  const patchLocal = useCallback(
    (updater: (m: CoachMemory) => CoachMemory) => {
      setMemory(m => {
        const updated = updater(m)
        writeLocal(athleteId, updated)
        return updated
      })
    },
    [athleteId],
  )

  /** Update fields on an existing turn (e.g. actionStatus for a
   *  proposal that the user has approved/rejected). Local-only —
   *  the server copy will still have the original turn but this
   *  update is UI state, not training data, so localStorage is
   *  the right home. */
  const updateTurn = useCallback(
    (turnId: string, patch: Partial<ConversationTurn>) => {
      // Persist the UI-only fields in the overlay so a later server sync
      // can't wipe the proposal's apply-state (the "green flash" bug).
      if ('actionStatus' in patch || 'actionOverrideId' in patch) {
        const ui = readTurnUi(athleteId)
        ui[turnId] = {
          ...(ui[turnId] || {}),
          ...('actionStatus' in patch ? { actionStatus: patch.actionStatus } : {}),
          ...('actionOverrideId' in patch ? { actionOverrideId: patch.actionOverrideId } : {}),
        }
        writeTurnUi(athleteId, ui)
      }
      setMemory(m => {
        const updated: CoachMemory = {
          ...m,
          conversation: m.conversation.map(t => t.id === turnId ? { ...t, ...patch } : t),
        }
        writeLocal(athleteId, updated)
        return updated
      })
    },
    [athleteId],
  )

  return {
    memory,
    aboutMe: memory.aboutMe,
    aboutMeFacts: memory.aboutMeFacts ?? [],
    coachPersona: memory.coachPersona ?? { name: '', traits: [] },
    conversation: memory.conversation,
    dailyArchives: (memory.dailyArchives ?? []) as DailyChatArchive[],
    pendingInferences: memory.pendingInferences,
    unreadCount,
    loaded,
    online,
    apiAvailable,
    refresh,
    saveAboutMe,
    clearAboutMe,
    addAboutMeFact,
    editAboutMeFact,
    deleteAboutMeFact,
    appendTurn,
    acceptInference,
    dismissInference,
    markRead,
    clearConversation,
    rolloverDay,
    saveCoachPersona,
    patchLocal,
    updateTurn,
  }
}

export type UseCoachMemoryReturn = ReturnType<typeof useCoachMemory>
