import { useEffect, useState } from 'react'
import { getStoredSession } from '../utils/auth'
import {
  pushAll,
  pullFromServer,
  hydrateFromServer,
  getLastSyncedAt,
  subscribeLastSyncedAt,
  getLastSyncError,
  subscribeSyncError,
  type SyncError,
} from '../utils/backendSync'

/**
 * Cross-device sync controls.
 *
 * Background sync runs automatically (every 60s while visible + on
 * visibility-change); these buttons exist for the rare case the athlete
 * wants to force a round-trip — e.g. "I just made an edit on my laptop,
 * I want it on my phone NOW" or "this device has the wrong data, blow
 * it away and reload from server."
 */

type Status =
  | { kind: 'idle' }
  | { kind: 'syncing' }
  | { kind: 'ok'; msg: string }
  | { kind: 'err'; msg: string }

function formatAgo(ms: number | null): string {
  if (!ms) return 'never'
  const delta = Date.now() - ms
  if (delta < 0) return 'just now'
  if (delta < 60_000) return `${Math.floor(delta / 1000)}s ago`
  if (delta < 3600_000) return `${Math.floor(delta / 60_000)}m ago`
  if (delta < 86400_000) return `${Math.floor(delta / 3600_000)}h ago`
  return `${Math.floor(delta / 86400_000)}d ago`
}

export default function SyncSettings() {
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(() => getLastSyncedAt())
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [syncError, setSyncError] = useState<SyncError | null>(() => getLastSyncError())
  // Re-render once a minute so the "X ago" stays roughly accurate
  // without a tight setInterval.
  const [, setTick] = useState(0)

  useEffect(() => {
    const unsub = subscribeLastSyncedAt(setLastSyncedAt)
    const unsubErr = subscribeSyncError(setSyncError)
    const id = window.setInterval(() => setTick(t => t + 1), 30_000)
    return () => {
      unsub()
      unsubErr()
      window.clearInterval(id)
    }
  }, [])

  const session = getStoredSession()
  const disabled = !session?.token || status.kind === 'syncing'

  async function handleSyncNow() {
    if (!session) return
    setStatus({ kind: 'syncing' })
    try {
      // Full round-trip (P0 postmortem): "Sync now" used to only PUSH, so
      // it could truthfully report success while this device never
      // received the other device's changes. Push first (so our edits
      // reach the server before we read), then pull.
      const r = await pushAll(session)
      const { pulled } = await hydrateFromServer(session)
      const rejectedNote = r.rejectedKeys && r.rejectedKeys.length > 0
        ? ` ⚠️ ${r.rejectedKeys.length} rejected by server.`
        : ''
      setStatus({
        kind: 'ok',
        msg: `Synced — ${r.written} sent, ${pulled} received, ${r.skipped} already current.${rejectedNote}`,
      })
    } catch (e) {
      setStatus({
        kind: 'err',
        msg: `Sync failed: ${e instanceof Error ? e.message : 'unknown error'}`,
      })
    }
  }

  async function handlePullFromServer() {
    if (!session) return
    const ok = window.confirm(
      'Replace this device\'s data with the latest from the server?\n\n' +
      'Any edits you made on THIS device that haven\'t synced yet will be lost. ' +
      'The page will reload when the pull finishes.',
    )
    if (!ok) return
    setStatus({ kind: 'syncing' })
    try {
      const r = await pullFromServer(session)
      setStatus({ kind: 'ok', msg: `Pulled ${r.pulled} keys. Reloading…` })
      window.setTimeout(() => window.location.reload(), 600)
    } catch (e) {
      setStatus({
        kind: 'err',
        msg: `Pull failed: ${e instanceof Error ? e.message : 'unknown error'}`,
      })
    }
  }

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl p-4 shadow-sm border border-slate-100 dark:border-slate-700 space-y-3">
      <div>
        <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
          Cross-device sync
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
          Your training plan edits, manual logs, soreness, coach memory, day
          swaps, and onboarding settings sync automatically across every device
          you sign into. Use these controls to force a round-trip.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={handleSyncNow}
          disabled={disabled}
          className="text-sm font-medium px-3 py-1.5 rounded-lg bg-teal-100 text-teal-700 hover:bg-teal-200 disabled:opacity-40 dark:bg-teal-900 dark:text-teal-200 dark:hover:bg-teal-800 transition-colors"
        >
          {status.kind === 'syncing' ? 'Syncing…' : 'Sync now'}
        </button>
        <button
          onClick={handlePullFromServer}
          disabled={disabled}
          className="text-sm font-medium px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 disabled:opacity-40 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600 transition-colors"
        >
          Pull from server (replaces local)
        </button>
      </div>

      <p className="text-xs text-slate-500 dark:text-slate-400">
        Last synced: {formatAgo(lastSyncedAt)}
      </p>

      {/* Persistent sync health (P0 postmortem): background pushes were
          failing 100% for weeks with zero indication anywhere. The last
          background OR manual failure stays visible here until a sync
          fully succeeds. */}
      {syncError && (
        <p className="text-xs text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-950 border border-rose-200 dark:border-rose-800 rounded-lg px-2.5 py-1.5">
          ⚠️ Sync problem ({formatAgo(syncError.at)}): {syncError.message}
        </p>
      )}

      {status.kind === 'ok' && (
        <p className="text-xs text-teal-700 dark:text-teal-400">{status.msg}</p>
      )}
      {status.kind === 'err' && (
        <p className="text-xs text-rose-700 dark:text-rose-400">{status.msg}</p>
      )}
      {!session?.token && (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          Sign in to enable cross-device sync.
        </p>
      )}
    </div>
  )
}
