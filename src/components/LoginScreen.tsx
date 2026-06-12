import { useState, useEffect, useCallback } from 'react'
import { loginWithGoogle, getGoogleClientId, type AuthSession } from '../utils/auth'
import { coachApiBase } from '../utils/coachApi'

interface LoginScreenProps {
  onLogin: (session: AuthSession) => void
}

export default function LoginScreen({ onLogin }: LoginScreenProps) {
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const googleClientId = getGoogleClientId()

  // "Request access" — someone who isn't on the allowlist yet can send Mike a
  // request right here; it lands in his Settings → Athletes review queue. No
  // account or backend auth needed to ask.
  const [showRequest, setShowRequest] = useState(false)
  const [reqEmail, setReqEmail] = useState('')
  const [reqNote, setReqNote] = useState('')
  const [reqBusy, setReqBusy] = useState(false)
  const [reqError, setReqError] = useState<string | null>(null)
  const [reqSent, setReqSent] = useState(false)

  const submitRequest = useCallback(async () => {
    const email = reqEmail.trim()
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      setReqError('Please enter a valid email address.')
      return
    }
    const base = coachApiBase()
    if (!base) {
      setReqError('Requests aren’t available right now — please email Mike directly.')
      return
    }
    setReqBusy(true)
    setReqError(null)
    try {
      const res = await fetch(`${base}/api/auth/athletes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'request_access', email, note: reqNote.trim() }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`)
      setReqSent(true)
    } catch (e) {
      setReqError(e instanceof Error ? e.message : 'Something went wrong. Please try again.')
    } finally {
      setReqBusy(false)
    }
  }, [reqEmail, reqNote])

  const handleGoogleResponse = useCallback(async (response: { credential?: string }) => {
    if (!response.credential) {
      setError('Google sign-in failed. Please try again.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const session = await loginWithGoogle(response.credential)
      onLogin(session)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }, [onLogin])

  useEffect(() => {
    if (!googleClientId) return

    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.onload = () => {
      const google = (window as unknown as { google: { accounts: { id: {
        initialize: (config: { client_id: string; callback: (r: { credential?: string }) => void }) => void
        renderButton: (el: HTMLElement, opts: { theme: string; size: string; width: number; text: string; shape: string }) => void
      } } } }).google
      if (!google) return

      google.accounts.id.initialize({
        client_id: googleClientId,
        callback: handleGoogleResponse,
      })

      const buttonEl = document.getElementById('google-signin-btn')
      if (buttonEl) {
        google.accounts.id.renderButton(buttonEl, {
          theme: 'outline',
          size: 'large',
          width: 300,
          text: 'signin_with',
          shape: 'pill',
        })
      }
    }
    document.head.appendChild(script)
    return () => { script.remove() }
  }, [googleClientId, handleGoogleResponse])

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex flex-col items-center justify-center px-6"
         style={{ fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" }}>
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-slate-800 dark:text-white tracking-tight">ATTUNE</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">A coach in your pocket</p>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 space-y-5">
          <div className="text-center">
            <p className="text-base font-semibold text-slate-700 dark:text-slate-200">Sign in to your account</p>
            <p className="text-xs text-slate-400 mt-1">Use the Google account linked to your training plan</p>
          </div>

          {error && (
            <div className="bg-red-50 rounded-xl p-3 border border-red-200">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {loading && (
            <div className="flex items-center justify-center py-4">
              <div className="animate-spin w-6 h-6 border-2 border-teal-600 border-t-transparent rounded-full" />
              <span className="ml-2 text-sm text-slate-500 dark:text-slate-400">Signing in...</span>
            </div>
          )}

          {googleClientId ? (
            <div className="flex justify-center">
              <div id="google-signin-btn" />
            </div>
          ) : (
            <p className="text-xs text-amber-600 text-center">
              Google Sign-In not configured. Set VITE_GOOGLE_CLIENT_ID.
            </p>
          )}
        </div>

        {reqSent ? (
          <div className="text-center space-y-1">
            <p className="text-sm font-medium text-teal-700 dark:text-teal-400">Request sent ✓</p>
            <p className="text-xs text-slate-400">
              Thanks — Mike will review and add you. You'll be able to sign in once you're approved.
            </p>
          </div>
        ) : showRequest ? (
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-5 space-y-3">
            <div className="text-center">
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Request access</p>
              <p className="text-xs text-slate-400 mt-0.5">Mike gets your request and adds you — no account needed to ask.</p>
            </div>
            <input
              type="email"
              value={reqEmail}
              onChange={e => setReqEmail(e.target.value)}
              placeholder="you@email.com"
              autoComplete="email"
              className="w-full text-sm px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-400"
            />
            <textarea
              value={reqNote}
              onChange={e => setReqNote(e.target.value)}
              placeholder="Anything Mike should know? (optional)"
              rows={2}
              className="w-full text-sm px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-400 resize-none"
            />
            {reqError && <p className="text-xs text-red-600 dark:text-red-400">{reqError}</p>}
            <div className="flex items-center gap-2">
              <button
                onClick={() => { setShowRequest(false); setReqError(null) }}
                disabled={reqBusy}
                className="flex-1 text-sm font-medium px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/40 disabled:opacity-40 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => void submitRequest()}
                disabled={reqBusy}
                className="flex-1 text-sm font-medium px-3 py-2 rounded-lg bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {reqBusy ? 'Sending…' : 'Send request'}
              </button>
            </div>
          </div>
        ) : (
          <p className="text-xs text-slate-400 text-center">
            Don't have an account?{' '}
            <button
              onClick={() => setShowRequest(true)}
              className="font-medium text-teal-600 dark:text-teal-400 hover:underline"
            >
              Request access
            </button>
          </p>
        )}
      </div>
    </div>
  )
}
