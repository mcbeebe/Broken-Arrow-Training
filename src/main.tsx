import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import MigrationBanner from './components/MigrationBanner'
import MigrationReceive from './components/MigrationReceive'
import { isMigrationReceive } from './utils/migrate'
import { recordReferralSource } from './landing/referral'
import { sweepExpiredCaches } from './utils/storageRoom'

// G10 acquisition attribution (?from=tool-*), shared with the root page.
recordReferralSource(window.location.search)

const root = createRoot(document.getElementById('root')!)

if (isMigrationReceive()) {
  // Receiver short-circuit: ?__migrate=1 means another origin is
  // postMessaging us a data payload. Render the receiver UI ONLY —
  // don't boot the regular app (which would run checkStorageVersion
  // and other init side-effects).
  root.render(
    <StrictMode>
      <MigrationReceive />
    </StrictMode>,
  )
} else {
  // Free storage that can never be read again before anything writes —
  // a phone that filled up must boot into a working app (2026-10-06).
  sweepExpiredCaches()
  const targetOrigin = import.meta.env.VITE_TARGET_ORIGIN as string | undefined
  root.render(
    <StrictMode>
      <ErrorBoundary>
        {targetOrigin ? <MigrationBanner targetOrigin={targetOrigin} /> : null}
        <App />
      </ErrorBoundary>
    </StrictMode>,
  )
}

// Register the service worker that handles Web Push (coach briefings).
// Non-fatal if it fails — the app works fine without notifications.
// Skipped in the migration receiver branch since we never reach the
// real app in that render.
if ('serviceWorker' in navigator && !isMigrationReceive()) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* push just won't be available */
    })
  })
}
