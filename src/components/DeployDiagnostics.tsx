import { useEffect, useState } from 'react'
import { coachApiBase } from '../utils/coachApi'

interface VersionInfo {
  commit: string
  commitFull?: string
  message?: string
  branch?: string
  deployedAt?: string
  runtime?: string
}

/**
 * Tiny Settings panel that calls /api/version and shows the live
 * backend commit SHA next to the frontend build's commit SHA. Makes
 * "is Vercel caught up yet?" a one-tap check instead of "guess from
 * the coach's vibe."
 *
 * Front-end SHA is injected at build time by the GitHub Actions
 * workflow via VITE_GIT_COMMIT_SHA; we fall back to "dev" when
 * unset.
 */
export default function DeployDiagnostics() {
  const [api, setApi] = useState<VersionInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Short SHA the GH Pages origin is *currently* serving, read from a
  // same-origin /version.json the deploy workflow stamps with the build
  // commit. Lets us tell a stale-browser mismatch apart from a stale
  // backend one. null = not yet known (or this build predates the file).
  const [published, setPublished] = useState<string | null>(null)

  const front = (import.meta.env.VITE_GIT_COMMIT_SHA as string | undefined)?.slice(0, 7) || 'dev'

  async function fetchVersion() {
    setLoading(true)
    setError(null)
    try {
      const base = coachApiBase()
      if (!base) throw new Error('API base URL not configured')
      const res = await fetch(`${base}/api/version`, { cache: 'no-store' })
      if (!res.ok) throw new Error(`http_${res.status}`)
      const data = await res.json()
      setApi(data)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  // What SHA is GH Pages publishing right now? Same-origin fetch, so no
  // CORS, and the service worker has no fetch handler — this always hits
  // the network (cache-busted + no-store) and returns the live build.
  async function fetchPublished() {
    try {
      const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' })
      if (!res.ok) return
      const data = await res.json()
      if (typeof data?.commit === 'string') setPublished(data.commit.slice(0, 7))
    } catch {
      // Non-fatal: without the published SHA we fall back to the generic
      // mismatch hint that names both possible culprits.
    }
  }

  useEffect(() => {
    fetchVersion()
    fetchPublished()
  }, [])

  const apiShort = api?.commit || '—'
  const hasFront = front !== 'dev'
  const hasApi = apiShort !== '—' && apiShort !== 'unknown'
  const inSync = hasFront && hasApi && front === apiShort

  // Can we trust the "which side is stale" verdict? Only when we know
  // what GH Pages is actually serving.
  const knowPublished = hasFront && published !== null
  // Running bundle is older than what GH Pages serves → THIS client is a
  // cached copy. The one case a reopen/hard-refresh actually fixes.
  const clientStale = knowPublished && published !== front
  // Running bundle matches what's published, yet it disagrees with the
  // API → the backend (Vercel) is the side that's behind. A refresh
  // can't touch a server-side deploy.
  const apiBehind = knowPublished && !clientStale && hasApi && front !== apiShort

  const statusColor = inSync
    ? 'text-green-700 bg-green-50 border-green-200'
    : 'text-amber-700 bg-amber-50 border-amber-200'

  let statusText: string
  let hint: string | null = null
  if (inSync) {
    statusText = '✅ Frontend and API are in sync'
  } else if (!hasFront) {
    statusText = 'ℹ️ Frontend SHA not injected (dev build)'
  } else if (!hasApi) {
    statusText = '⚠️ API SHA unavailable — check Vercel deploy / env vars'
  } else if (clientStale) {
    statusText = '⚠️ Your app is a cached older build'
    hint =
      `GH Pages is already serving a newer frontend (${published}) than ` +
      `the copy running on your device (${front}). Close and reopen the ` +
      `PWA — or hard-refresh (Cmd+Shift+R / Ctrl+F5) — to load it.`
  } else if (apiBehind) {
    statusText = "⚠️ Backend is behind — reopening won't help"
    hint =
      "Your app is already on the latest frontend, so a refresh changes " +
      "nothing. The API on Vercel is still serving an older deploy. Open " +
      "Vercel → Deployments and confirm the Production deployment is on " +
      "the latest commit — production may be pinned to an old branch, or a " +
      "deploy may have failed."
  } else {
    // Mismatch, but we couldn't confirm the published frontend SHA, so we
    // can't say which side is stale. Name both, in the order the user can
    // check fastest.
    statusText = '⚠️ Frontend and API are on different commits'
    hint =
      "Either your browser is running a cached frontend — reopen / " +
      "hard-refresh the PWA — or the backend (Vercel) hasn't finished " +
      "promoting its deploy. If the frontend SHA above doesn't change " +
      "after reopening, it's the backend: check Vercel's Deployments tab."
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-500">
        Backend deploy status. Use this to confirm Vercel picked up your latest push.
      </p>

      <div className={`rounded-lg px-3 py-2 text-sm border ${statusColor}`}>
        <p>{statusText}</p>
        {hint && (
          <p className="text-xs mt-1.5 opacity-80 leading-snug">{hint}</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Frontend</p>
          <p className="font-mono text-slate-800">{front}</p>
          <p className="text-xs text-slate-400">GitHub Pages (Vite build)</p>
        </div>
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">API</p>
          <p className="font-mono text-slate-800">{loading ? '…' : apiShort}</p>
          <p className="text-xs text-slate-400">Vercel {api?.runtime || '(Python)'}</p>
        </div>
      </div>

      {api?.message && (
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">API commit message</p>
          <p className="text-sm text-slate-700 italic line-clamp-2">"{api.message}"</p>
        </div>
      )}

      {api?.branch && (
        <p className="text-xs text-slate-500">
          Branch: <span className="font-mono text-slate-700">{api.branch}</span>
        </p>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">
          Couldn't reach /api/version: {error}
        </div>
      )}

      <button
        onClick={() => { fetchVersion(); fetchPublished() }}
        disabled={loading}
        className="text-sm font-medium px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 disabled:opacity-50 transition-colors"
      >
        {loading ? 'Checking…' : '↻ Refresh'}
      </button>
    </div>
  )
}
