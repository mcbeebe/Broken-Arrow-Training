import { useState } from 'react'
import { sendMigration, exportToFile } from '../utils/migrate'

/**
 * Sticky banner shown on the OLD origin during the cutover window.
 * Wired up only when `VITE_TARGET_ORIGIN` is set (legacy build).
 *
 * One tap migrates the user's training history to attune.coach via a
 * cross-origin postMessage bridge, then forwards them with their
 * deep-link query + hash preserved. If popups are blocked, falls back
 * to a JSON download the user can upload on the new origin.
 */
export default function MigrationBanner({ targetOrigin }: { targetOrigin: string }) {
  const [state, setState] = useState<'idle' | 'working' | 'fallback' | 'dismissed'>(() => {
    return sessionStorage.getItem('ba_migration_done') === '1' ? 'dismissed' : 'idle'
  })
  const [error, setError] = useState<string | null>(null)

  if (state === 'dismissed') return null

  async function handleMove() {
    setState('working')
    setError(null)
    const result = await sendMigration(targetOrigin)
    if (result.ok) {
      // sendMigration already navigated; this line rarely runs.
      setState('dismissed')
      return
    }
    if (result.error === 'popup-blocked') {
      setError('Your browser blocked the popup. Use the backup file below instead.')
    } else if (result.error === 'timeout') {
      setError('Migration timed out. Try again, or use the backup file below.')
    } else {
      setError('Migration failed. Use the backup file below.')
    }
    setState('fallback')
  }

  function handleDismiss() {
    sessionStorage.setItem('ba_migration_done', '1')
    setState('dismissed')
  }

  function handleDownload() {
    exportToFile()
  }

  return (
    <div className="sticky top-0 z-50 bg-amber-100 dark:bg-amber-950 border-b border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-100 px-3 py-2 text-sm shadow">
      <div className="max-w-3xl mx-auto flex flex-col gap-2">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="font-semibold">We've moved to attune.coach.</p>
            <p className="text-xs opacity-90 mt-0.5">
              {state === 'fallback'
                ? error || 'Use the backup file to bring your data over.'
                : 'Tap to bring your training history with you. One tap, no re-setup.'}
            </p>
          </div>
          <button
            onClick={handleDismiss}
            aria-label="Dismiss"
            className="text-amber-900 dark:text-amber-100 opacity-60 hover:opacity-100 text-xs font-bold px-2"
          >
            ✕
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {state !== 'fallback' && (
            <button
              onClick={handleMove}
              disabled={state === 'working'}
              className="px-3 py-1.5 rounded-md bg-amber-700 text-white font-semibold text-xs disabled:opacity-50"
            >
              {state === 'working' ? 'Moving your data…' : 'Bring my data to attune.coach'}
            </button>
          )}
          {state === 'fallback' && (
            <>
              <button
                onClick={handleDownload}
                className="px-3 py-1.5 rounded-md bg-amber-700 text-white font-semibold text-xs"
              >
                Download backup
              </button>
              <a
                href={targetOrigin}
                className="px-3 py-1.5 rounded-md border border-amber-700 text-amber-900 dark:text-amber-100 font-semibold text-xs"
              >
                Open attune.coach
              </a>
              <button
                onClick={handleMove}
                className="px-3 py-1.5 rounded-md text-xs underline text-amber-900 dark:text-amber-100"
              >
                Try again
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
