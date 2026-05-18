import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AboutMeFact } from '../types'
import { coachApiAvailable, coachFetch } from '../utils/coachApi'

/**
 * Fetches the LLM-curated "Coach knows about you" card for the Summary
 * tab. The server distills `aboutMeFacts` down to 3-5 short, second-
 * person lines in customer language and caches by a content hash, so
 * repeated calls are cheap and the LLM only runs when memory changes.
 *
 * Refetch triggers: athlete change, fact-set fingerprint change, window
 * focus. Returns silently-empty (loading=false, facts=[]) when the API
 * isn't reachable so the Summary tab can hide the card without erroring.
 */

export interface CoachSummaryCardPayload {
  facts: string[]
  builtAt: number
  factsHash: string
  source: 'cache' | 'llm' | 'fallback' | 'empty'
}

function factsFingerprint(facts: AboutMeFact[] | undefined): string {
  if (!facts || facts.length === 0) return ''
  // Order-sensitive — mirrors server hash. Doesn't need to be cryptographic,
  // just a stable cache key for the client-side refetch effect.
  return facts.map(f => `${f.id}:${f.text.length}`).join('|')
}

export function useCoachSummaryCard(athleteId: string, enabled: boolean, facts: AboutMeFact[] | undefined) {
  const [payload, setPayload] = useState<CoachSummaryCardPayload | null>(null)
  const [loading, setLoading] = useState(false)
  const inflight = useRef<Promise<void> | null>(null)
  const apiAvailable = coachApiAvailable()

  const fingerprint = useMemo(() => factsFingerprint(facts), [facts])

  const fetchCard = useCallback(async () => {
    if (!enabled || !apiAvailable || !athleteId) return
    if (inflight.current) return inflight.current
    setLoading(true)
    const p = (async () => {
      try {
        const server = await coachFetch<CoachSummaryCardPayload>(
          `/api/coach/summary_card?athleteId=${encodeURIComponent(athleteId)}`,
        )
        setPayload(server)
      } catch {
        // Silent — Summary card just stays hidden until next try.
      } finally {
        setLoading(false)
      }
    })()
    inflight.current = p
    try {
      await p
    } finally {
      inflight.current = null
    }
  }, [athleteId, enabled, apiAvailable])

  // Refetch when athlete changes or facts change.
  useEffect(() => {
    setPayload(null)
    fetchCard()
  }, [athleteId, fingerprint, fetchCard])

  // Refresh on window focus so an edit made in Settings → Coach is
  // reflected on Summary the next time the tab regains focus.
  useEffect(() => {
    if (!enabled || !apiAvailable) return
    function onFocus() { fetchCard() }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [fetchCard, enabled, apiAvailable])

  return {
    facts: payload?.facts ?? [],
    loading,
    builtAt: payload?.builtAt,
    source: payload?.source,
    apiAvailable,
  }
}
