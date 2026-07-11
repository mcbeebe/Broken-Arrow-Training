import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import MigrationBanner from './components/MigrationBanner'
import MigrationReceive from './components/MigrationReceive'
import { isMigrationReceive } from './utils/migrate'

// G10 acquisition attribution: the free public calculators link back with
// ?from=tool-*. First touch wins and it never overwrites — one write, so a
// later organic visit can't erase where the athlete actually came from.
try {
  const from = new URLSearchParams(window.location.search).get('from')
  if (from && !localStorage.getItem('ba_referral_source_v1')) {
    localStorage.setItem('ba_referral_source_v1', JSON.stringify({ from, at: Date.now() }))
  }
} catch { /* attribution is best-effort */ }

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
