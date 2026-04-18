import { useState, useEffect, useCallback } from 'react'
import { loginWithGoogle, getGoogleClientId, type AuthSession } from '../utils/auth'

interface LoginScreenProps {
  onLogin: (session: AuthSession) => void
}

export default function LoginScreen({ onLogin }: LoginScreenProps) {
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const googleClientId = getGoogleClientId()

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
          <h1 className="text-3xl font-bold text-slate-800 dark:text-white tracking-tight">BROKEN ARROW</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Training Plan</p>
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

        <p className="text-xs text-slate-400 text-center">
          Don't have an account? Ask Mike to add your email.
        </p>
      </div>
    </div>
  )
}
