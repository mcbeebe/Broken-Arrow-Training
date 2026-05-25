import { useState, useEffect, useCallback } from 'react'
import { getStoredSession } from '../utils/auth'
import { coachApiBase } from '../utils/coachApi'

interface AthleteRow {
  email: string
  athleteId: string
  source: 'env' | 'kv'
  managed: boolean
}

function deriveAthleteId(email: string): string {
  return email.split('@')[0].toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 40)
}

export default function AthleteAdmin() {
  const [rows, setRows] = useState<AthleteRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [email, setEmail] = useState('')
  const [athleteId, setAthleteId] = useState('')
  const [idTouched, setIdTouched] = useState(false)

  const base = coachApiBase()

  const call = useCallback(async (method: 'GET' | 'POST' | 'DELETE', body?: object) => {
    const token = getStoredSession()?.token
    if (!base) throw new Error('API URL not configured (VITE_GARMIN_API_URL missing)')
    if (!token) throw new Error('Not signed in')
    const res = await fetch(`${base}/api/auth/athletes`, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: body ? JSON.stringify(body) : undefined,
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`)
    return data as { athletes: AthleteRow[] }
  }, [base])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await call('GET')
      setRows(data.athletes || [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load athletes')
    } finally {
      setLoading(false)
    }
  }, [call])

  useEffect(() => { void load() }, [load])

  const handleEmailChange = (value: string) => {
    setEmail(value)
    if (!idTouched) setAthleteId(deriveAthleteId(value))
  }

  const handleAdd = async () => {
    setBusy(true)
    setError(null)
    try {
      const data = await call('POST', { email: email.trim(), athleteId: athleteId.trim() })
      setRows(data.athletes || [])
      setEmail('')
      setAthleteId('')
      setIdTouched(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add athlete')
    } finally {
      setBusy(false)
    }
  }

  const handleRemove = async (target: string) => {
    if (!confirm(`Remove ${target}? They'll no longer be able to sign in.`)) return
    setBusy(true)
    setError(null)
    try {
      const data = await call('DELETE', { email: target })
      setRows(data.athletes || [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to remove athlete')
    } finally {
      setBusy(false)
    }
  }

  const canAdd = !busy && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim()) && /^[a-z0-9][a-z0-9-]*$/.test(athleteId.trim())

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl p-4 shadow-sm border border-slate-100 dark:border-slate-700 space-y-4">
      <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
        Add an athlete by email. They sign in with Google and are recognized instantly — no redeploy.
        Their plan builds itself through onboarding on first login.
      </p>

      <div className="space-y-2">
        <input
          type="email"
          value={email}
          onChange={e => handleEmailChange(e.target.value)}
          placeholder="athlete@email.com"
          className="w-full text-sm px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-400"
        />
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">athlete ID</span>
          <input
            type="text"
            value={athleteId}
            onChange={e => { setIdTouched(true); setAthleteId(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '')) }}
            placeholder="slug"
            className="flex-1 text-sm px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-400"
          />
          <button
            onClick={() => void handleAdd()}
            disabled={!canAdd}
            className="text-sm font-medium px-3 py-2 rounded-lg bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Add
          </button>
        </div>
      </div>

      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}

      {loading ? (
        <p className="text-xs text-slate-400">Loading athletes…</p>
      ) : (
        <ul className="space-y-1">
          {rows.map(row => (
            <li key={row.email} className="flex items-center justify-between gap-2 text-sm py-1.5 px-2 rounded-lg odd:bg-slate-50 dark:odd:bg-slate-900/40">
              <span className="min-w-0 flex-1 truncate text-slate-700 dark:text-slate-200">{row.email}</span>
              <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">{row.athleteId}</span>
              {row.managed ? (
                <button
                  onClick={() => void handleRemove(row.email)}
                  disabled={busy}
                  className="text-xs text-red-600 dark:text-red-400 hover:underline disabled:opacity-40"
                >
                  Remove
                </button>
              ) : (
                <span className="text-[10px] uppercase tracking-wide text-slate-400" title="Configured in the ATHLETE_EMAILS env var">seed</span>
              )}
            </li>
          ))}
          {rows.length === 0 && <li className="text-xs text-slate-400">No athletes yet.</li>}
        </ul>
      )}
    </div>
  )
}
