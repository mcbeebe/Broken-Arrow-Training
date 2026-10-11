/**
 * The Coach check-in email (initiative 005): its Settings state, and keeping
 * the server's copy of the plan current.
 *
 * The plan exists only in the app, so whenever the snapshot changes (any
 * plan edit, a Coach-chat approval, new load numbers, a new day) it is
 * uploaded, debounced so a multi-step edit uploads once. A device-local hash
 * means a re-render with nothing new never uploads. Nothing is uploaded until
 * the athlete turns the email on, and turning it off deletes the server copy.
 */
import { useCallback, useEffect, useState } from 'react'
import { checkinOpenTo } from '../utils/checkin/access'
import {
  fetchCheckinStatus,
  saveCheckinEnabled,
  sendCheckinTest,
  uploadCheckinSnapshot,
  type CheckinStatus,
} from '../utils/checkin/api'
import { checkinHash, type CheckinSnapshot } from '../utils/checkin/snapshot'

/** Wait for edits to settle before uploading. */
export const CHECKIN_UPLOAD_DEBOUNCE_MS = 5000
/** Waits before retrying a failed status check. */
export const STATUS_RETRY_MS = [30_000, 120_000, 300_000]

const HASH_KEY = 'ba_checkin_uploaded_v1'

function hashKey(athleteId: string): string {
  return `${HASH_KEY}_${athleteId}`
}

function readHash(athleteId: string): string | null {
  try { return localStorage.getItem(hashKey(athleteId)) } catch { return null }
}

function writeHash(athleteId: string, hash: string | null): void {
  try {
    if (hash) localStorage.setItem(hashKey(athleteId), hash)
    else localStorage.removeItem(hashKey(athleteId))
  } catch { /* storage unavailable: the next change uploads again */ }
}

const ERRORS: Record<string, string> = {
  no_email: 'There’s no email address on your account to send to.',
  no_snapshot: 'Nothing to send yet. Give the app a few seconds to upload your plan, then try again.',
  test_limit: 'That’s today’s test emails used up. Try again tomorrow.',
  send_failed: 'The email couldn’t be sent. Email may not be set up on the server yet.',
  not_enabled: 'Turn the check-in email on first.',
  not_available: 'The check-in email isn’t available on your account yet.',
}

function errorText(code: string | undefined): string {
  return (code && ERRORS[code]) || 'Something went wrong. Please try again.'
}

export interface CheckinState {
  /** The athlete may use the email at all (app and server gates). */
  available: boolean
  loading: boolean
  enabled: boolean
  email: string
  snapshotAsOf: string | null
  lastSent: CheckinStatus['lastSent']
  busy: boolean
  message: string | null
  error: string | null
  setEnabled: (on: boolean) => Promise<void>
  sendTest: () => Promise<void>
}

/**
 * Settings state for the check-in email plus the snapshot upload. `snapshot`
 * is null for anyone the email isn't open to, which keeps every other athlete
 * free of the work and the network calls.
 */
export function useCheckin(athleteId: string, snapshot: CheckinSnapshot | null): CheckinState {
  const gated = checkinOpenTo(athleteId)
  const [status, setStatus] = useState<CheckinStatus | null>(null)
  const [loadedFor, setLoadedFor] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Bumped when the email is turned on, so the upload runs even if this
  // device uploaded the same snapshot before it was turned off.
  const [uploadEpoch, setUploadEpoch] = useState(0)

  useEffect(() => {
    if (!gated) return
    let live = true
    let timer: ReturnType<typeof setTimeout> | undefined
    // A failed status check (offline, a cold-start error) must not leave
    // the whole session without uploads: retry, backing off.
    const load = (attempt: number) => {
      fetchCheckinStatus().then(r => {
        if (!live) return
        if (r.ok) setStatus(r.body)
        setLoadedFor(athleteId)
        if (!r.ok && attempt < STATUS_RETRY_MS.length) {
          timer = setTimeout(() => load(attempt + 1), STATUS_RETRY_MS[attempt])
        }
      })
    }
    load(0)
    return () => { live = false; clearTimeout(timer) }
  }, [gated, athleteId])
  const loading = gated && loadedFor !== athleteId

  const enabled = !!(status?.allowed && status.enabled)
  const hash = snapshot ? checkinHash(snapshot) : null

  useEffect(() => {
    if (!enabled || !snapshot || !hash) return
    if (readHash(athleteId) === hash) return
    const snap = snapshot
    const timer = setTimeout(() => {
      uploadCheckinSnapshot(snap).then(r => {
        if (r.ok) {
          writeHash(athleteId, hash)
          setStatus(s => (s ? { ...s, snapshotAsOf: snap.asOf } : s))
        }
        // Best-effort: a failure leaves the hash unwritten, so the next
        // change, or the next app open, tries again.
      })
    }, CHECKIN_UPLOAD_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [enabled, snapshot, hash, athleteId, uploadEpoch])

  const setEnabled = useCallback(async (on: boolean) => {
    setBusy(true)
    setMessage(null)
    setError(null)
    const r = await saveCheckinEnabled(on)
    setBusy(false)
    if (!r.ok) {
      setError(errorText(r.body.error))
      return
    }
    writeHash(athleteId, null)
    setStatus(s => ({
      ...(s ?? { allowed: true }),
      enabled: r.body.enabled,
      email: r.body.email,
      snapshotAsOf: on ? s?.snapshotAsOf ?? null : null,
    }))
    if (on) setUploadEpoch(n => n + 1)
  }, [athleteId])

  const sendTest = useCallback(async () => {
    setBusy(true)
    setMessage(null)
    setError(null)
    const r = await sendCheckinTest()
    setBusy(false)
    if (!r.ok) {
      setError(errorText(r.body.error))
      return
    }
    setMessage(`Sent to ${status?.email || 'your inbox'}. It can take a minute to arrive.`)
  }, [status?.email])

  return {
    available: gated && !!status?.allowed,
    loading,
    enabled,
    email: status?.email ?? '',
    snapshotAsOf: status?.snapshotAsOf ?? null,
    lastSent: status?.lastSent ?? null,
    busy,
    message,
    error,
    setEnabled,
    sendTest,
  }
}
