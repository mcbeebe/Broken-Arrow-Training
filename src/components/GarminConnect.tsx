import { useState } from 'react'

interface GarminConnectProps {
  connected: boolean
  configured: boolean
  loading: boolean
  error: string | null
  displayName: string | null
  lastSync: string | null
  mfaRequired: boolean
  onConnect: (email: string, password: string) => Promise<void>
  onSubmitMfa: (code: string) => Promise<void>
  onDisconnect: () => void
  onSync: () => Promise<void>
}

export default function GarminConnect({
  connected,
  configured,
  loading,
  error,
  displayName,
  lastSync,
  mfaRequired,
  onConnect,
  onSubmitMfa,
  onDisconnect,
  onSync,
}: GarminConnectProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mfaCode, setMfaCode] = useState('')

  if (!configured) {
    return (
      <div className="bg-amber-50 rounded-xl p-3 border border-amber-200">
        <p className="text-xs text-amber-700">
          Garmin integration not configured. Set <code className="bg-amber-100 px-1 rounded">VITE_GARMIN_API_URL</code> to enable.
        </p>
      </div>
    )
  }

  if (connected) {
    return (
      <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100 space-y-3">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-green-500" />
          <span className="text-sm font-medium text-slate-800">
            Connected{displayName ? ` · ${displayName}` : ''}
          </span>
        </div>
        {lastSync && (
          <p className="text-xs text-slate-500">
            Last synced: {new Date(lastSync).toLocaleString()}
          </p>
        )}
        {error && (
          <p className="text-xs text-red-600">{error}</p>
        )}
        <div className="flex gap-2">
          <button
            onClick={onSync}
            disabled={loading}
            className="text-xs font-medium px-3 py-1.5 rounded-lg bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Syncing...' : 'Sync Garmin'}
          </button>
          <button
            onClick={onDisconnect}
            className="text-xs font-medium px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
          >
            Disconnect
          </button>
        </div>
      </div>
    )
  }

  // MFA step — Garmin sent a verification code
  if (mfaRequired) {
    return (
      <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100 space-y-3">
        <p className="text-sm font-medium text-slate-700">Garmin Verification</p>
        <p className="text-xs text-slate-500">
          Garmin sent a verification code to your phone. Enter it below to complete sign-in.
        </p>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <input
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="6-digit code"
          value={mfaCode}
          onChange={e => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          className="w-full text-sm px-3 py-2 rounded-lg border border-slate-300 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 outline-none"
        />
        <button
          onClick={() => { onSubmitMfa(mfaCode); setMfaCode('') }}
          disabled={loading || mfaCode.length < 6}
          className="w-full text-sm font-semibold px-4 py-2.5 rounded-xl text-white transition-colors disabled:opacity-50"
          style={{ backgroundColor: '#007CC3' }}
        >
          {loading ? 'Verifying...' : 'Verify Code'}
        </button>
      </div>
    )
  }

  // Sign-in form — email + password
  return (
    <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100 space-y-3">
      <p className="text-xs text-slate-500">
        Sign in with your Garmin Connect account to enable readiness scoring, recovery tracking, and adaptive workout recommendations.
      </p>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <input
        type="email"
        autoComplete="email"
        placeholder="Garmin email"
        value={email}
        onChange={e => setEmail(e.target.value)}
        className="w-full text-sm px-3 py-2 rounded-lg border border-slate-300 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 outline-none"
      />
      <input
        type="password"
        autoComplete="current-password"
        placeholder="Garmin password"
        value={password}
        onChange={e => setPassword(e.target.value)}
        className="w-full text-sm px-3 py-2 rounded-lg border border-slate-300 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 outline-none"
      />
      <button
        onClick={() => { onConnect(email, password); setPassword('') }}
        disabled={loading || !email || !password}
        className="w-full flex items-center justify-center gap-2 text-sm font-semibold px-4 py-2.5 rounded-xl text-white transition-colors disabled:opacity-50"
        style={{ backgroundColor: '#007CC3' }}
      >
        {loading ? 'Connecting...' : 'Connect Garmin'}
      </button>
      <p className="text-[10px] text-slate-400 text-center">
        Your password is sent securely to authenticate with Garmin and is never stored.
      </p>
    </div>
  )
}
