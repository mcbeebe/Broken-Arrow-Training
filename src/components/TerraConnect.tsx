interface TerraConnectProps {
  connected: boolean
  configured: boolean
  loading: boolean
  error: string | null
  displayName: string | null
  lastSync: string | null
  onConnect: () => Promise<void>
  onDisconnect: () => void
  onSync: () => Promise<void>
}

export default function TerraConnect({
  connected,
  configured,
  loading,
  error,
  displayName,
  lastSync,
  onConnect,
  onDisconnect,
  onSync,
}: TerraConnectProps) {
  if (!configured) {
    return (
      <div className="bg-amber-50 rounded-xl p-3 border border-amber-200">
        <p className="text-xs text-amber-700">
          Apple Health integration not configured. Set <code className="bg-amber-100 px-1 rounded">VITE_TERRA_API_URL</code> to enable.
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
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="flex gap-2">
          <button
            onClick={onSync}
            disabled={loading}
            className="text-xs font-medium px-3 py-1.5 rounded-lg bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Syncing...' : 'Sync'}
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

  return (
    <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100 space-y-3">
      <p className="text-xs text-slate-500">
        Connect your Apple Watch via Terra to enable readiness scoring with HRV, resting HR, and sleep data.
      </p>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <button
        onClick={onConnect}
        disabled={loading}
        className="w-full flex items-center justify-center gap-2 text-sm font-semibold px-4 py-2.5 rounded-xl text-white transition-colors disabled:opacity-50"
        style={{ backgroundColor: '#34C759' }}
      >
        {loading ? 'Connecting...' : 'Connect Apple Health'}
      </button>
      <p className="text-[10px] text-slate-400 text-center">
        Requires the Terra app on your iPhone to bridge Apple Health data.
      </p>
    </div>
  )
}
