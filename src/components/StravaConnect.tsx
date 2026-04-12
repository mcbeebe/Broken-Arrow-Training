interface StravaConnectProps {
  connected: boolean
  configured: boolean
  loading: boolean
  athleteName: string | null
  onConnect: () => void
  onDisconnect: () => void
}

export default function StravaConnect({
  connected,
  configured,
  loading,
  athleteName,
  onConnect,
  onDisconnect,
}: StravaConnectProps) {
  if (!configured) {
    return (
      <div className="bg-amber-50 rounded-xl p-4 border border-amber-200">
        <p className="text-sm font-semibold text-amber-800">Strava Not Configured</p>
        <p className="text-xs text-amber-700 mt-1">
          Set VITE_STRAVA_CLIENT_ID and VITE_STRAVA_TOKEN_EXCHANGE_URL in your .env file to enable Strava integration.
        </p>
      </div>
    )
  }

  if (connected) {
    return (
      <div className="bg-green-50 rounded-xl p-4 border border-green-200">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-green-800">Connected to Strava</p>
            <p className="text-xs text-green-700 mt-0.5">Logged in as {athleteName}</p>
          </div>
          <button
            onClick={onDisconnect}
            className="text-xs text-red-600 hover:text-red-800 font-medium px-3 py-1.5 rounded-lg border border-red-200 hover:bg-red-50 transition-colors"
          >
            Disconnect
          </button>
        </div>
      </div>
    )
  }

  return (
    <button
      onClick={onConnect}
      disabled={loading}
      className="w-full bg-[#FC4C02] hover:bg-[#e04400] disabled:opacity-50 text-white font-semibold py-3 px-4 rounded-xl transition-colors flex items-center justify-center gap-2"
    >
      {loading ? (
        <span className="text-sm">Connecting...</span>
      ) : (
        <>
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169" />
          </svg>
          <span className="text-sm">Connect with Strava</span>
        </>
      )}
    </button>
  )
}
