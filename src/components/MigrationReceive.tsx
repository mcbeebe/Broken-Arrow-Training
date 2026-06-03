import { useEffect, useState, useRef } from 'react'
import { receiveMigration, importFromFile, isPreservedKey } from '../utils/migrate'
import { getStoredSession } from '../utils/auth'
import { pushAll } from '../utils/backendSync'
import { stampKey } from '../utils/syncStamps'

/**
 * Push freshly-migrated localStorage data straight up to Postgres so
 * the athlete's other devices see it on the next 60s tick, instead of
 * waiting for them to make an edit. The migration bridge writes
 * directly to localStorage without going through the instrumented
 * hooks, so we have to stamp every key here too — without a stamp the
 * periodic push has no idea anything changed. Only stamp keys that are
 * actually on the sync allowlist; regenerable caches (Garmin streams,
 * Strava activities) carry over via the migration bridge for offline
 * reuse but aren't worth uploading.
 */
async function pushMigratedToBackend(): Promise<void> {
  const session = getStoredSession()
  if (!session?.token) return
  const now = Date.now()
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (!k || k.startsWith('__attune_meta:')) continue
      if (!isPreservedKey(k)) continue
      stampKey(k, now)
    }
  } catch { /* ignore */ }
  try {
    await pushAll(session)
  } catch (e) {
    console.debug('[migration] post-ack sync failed:', e)
  }
}

/**
 * Full-screen receiver mounted on the NEW origin when the URL is
 * `?__migrate=1`. Listens for a postMessage payload from the configured
 * source origin and writes it into localStorage, then redirects into
 * the regular app preserving any extra query + hash.
 *
 * Also accepts a JSON file upload (Tier-2 fallback) for users whose
 * popup bridge was blocked — they download a backup on the old origin
 * and upload it here.
 */
export default function MigrationReceive() {
  const sourceOrigin = import.meta.env.VITE_SOURCE_ORIGIN as string | undefined
  const [status, setStatus] = useState<'waiting' | 'done' | 'error'>(
    sourceOrigin ? 'waiting' : 'error',
  )
  const [count, setCount] = useState<number>(0)
  const [errorMsg, setErrorMsg] = useState<string | null>(
    sourceOrigin ? null : 'Migration is not configured on this build.',
  )
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (!sourceOrigin) return
    let cancelled = false
    receiveMigration(sourceOrigin).then(({ count: c }) => {
      if (cancelled) return
      setCount(c)
      setStatus('done')
      pushMigratedToBackend()
      // Clean the URL and reload into the regular app, preserving hash.
      const hash = window.location.hash
      window.setTimeout(() => {
        window.location.replace('/' + hash)
      }, 600)
    })
    return () => { cancelled = true }
  }, [sourceOrigin])

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const { written } = await importFromFile(file)
      setCount(written)
      setStatus('done')
      const hash = window.location.hash
      window.setTimeout(() => {
        window.location.replace('/' + hash)
      }, 600)
    } catch (err) {
      setStatus('error')
      setErrorMsg(err instanceof Error ? err.message : 'Could not read backup file.')
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center px-6 text-slate-800 dark:text-slate-200">
      <div className="max-w-md w-full text-center space-y-4">
        <h1 className="text-2xl font-bold tracking-tight">attune.coach</h1>
        {status === 'waiting' && (
          <>
            <p className="text-slate-600 dark:text-slate-400">
              Bringing your training history over…
            </p>
            <div className="flex justify-center">
              <div className="h-2 w-32 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full w-1/3 bg-teal-500 animate-pulse" />
              </div>
            </div>
            <div className="pt-6">
              <p className="text-xs text-slate-500 mb-2">
                Popup blocked? Upload the backup file you downloaded.
              </p>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="text-sm px-4 py-2 rounded-md border border-slate-300 dark:border-slate-700 font-medium"
              >
                Upload backup file
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/json,.json"
                hidden
                onChange={handleFile}
              />
            </div>
          </>
        )}
        {status === 'done' && (
          <>
            <p className="text-teal-700 dark:text-teal-400 font-semibold">
              Done — {count} item{count === 1 ? '' : 's'} restored.
            </p>
            <p className="text-xs text-slate-500">Opening your app…</p>
          </>
        )}
        {status === 'error' && (
          <>
            <p className="text-rose-700 dark:text-rose-400 font-semibold">
              {errorMsg || 'Migration failed.'}
            </p>
            <a href="/" className="inline-block mt-2 text-sm text-teal-700 dark:text-teal-400 underline">
              Continue to attune.coach anyway
            </a>
          </>
        )}
      </div>
    </div>
  )
}
