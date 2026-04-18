import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CoachMemory, CoachPersona, ConversationTurn, DailyChatArchive } from '../types'
import { coachApiAvailable, coachFetch } from '../utils/coachApi'

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
  try {
    localStorage.setItem(LS_KEY_PREFIX + athleteId, JSON.stringify(mem))
  } catch {
    // best effort
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
        setMemory(server)
        writeLocal(athleteId, server)
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
        setMemory(server)
        writeLocal(athleteId, server)
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
      const updated = { ...m, aboutMe: '' }
      writeLocal(athleteId, updated)
      return updated
    })
    if (apiAvailable) {
      await mutate('clear_about_me')
    }
  }, [athleteId, apiAvailable, mutate])

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
          const name = persona.name?.trim() || 'Coach'
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
