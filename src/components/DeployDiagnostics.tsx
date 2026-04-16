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

  useEffect(() => { fetchVersion() }, [])

  const apiShort = api?.commit || '—'
  const inSync = front !== 'dev' && apiShort !== '—' && apiShort !== 'unknown' && front === apiShort
  const statusColor = inSync
    ? 'text-green-700 bg-green-50 border-green-200'
    : 'text-amber-700 bg-amber-50 border-amber-200'
  const statusText = inSync
    ? '✅ Frontend and API are in sync'
    : front === 'dev'
    ? 'ℹ️ Frontend SHA not injected (dev build)'
    : apiShort === 'unknown'
    ? '⚠️ API SHA unavailable — Vercel env vars may be missing'
    : '⚠️ Frontend and API are on different commits'

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-500">
        Backend deploy status. Use this to confirm Vercel picked up your latest push.
      </p>

      <div className={`rounded-lg px-3 py-2 text-sm border ${statusColor}`}>{statusText}</div>

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
        onClick={fetchVersion}
        disabled={loading}
        className="text-sm font-medium px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 disabled:opacity-50 transition-colors"
      >
        {loading ? 'Checking…' : '↻ Refresh'}
      </button>
    </div>
  )
}
