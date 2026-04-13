import StravaConnect from './StravaConnect'
import GarminConnect from './GarminConnect'

interface SettingsProps {
  // Strava
  connected: boolean
  configured: boolean
  loading: boolean
  error: string | null
  athleteName: string | null
  lastSync: string | null
  onConnect: () => void
  onDisconnect: () => void
  onSync: () => Promise<void>
  // Garmin
  garminConnected: boolean
  garminConfigured: boolean
  garminLoading: boolean
  garminError: string | null
  garminDisplayName: string | null
  garminLastSync: string | null
  onGarminConnect: () => Promise<void>
  onGarminDisconnect: () => void
  onGarminSync: () => Promise<void>
}

export default function Settings({
  connected,
  configured,
  loading,
  error,
  athleteName,
  lastSync,
  onConnect,
  onDisconnect,
  onSync,
  garminConnected,
  garminConfigured,
  garminLoading,
  garminError,
  garminDisplayName,
  garminLastSync,
  onGarminConnect,
  onGarminDisconnect,
  onGarminSync,
}: SettingsProps) {
  return (
    <div className="px-4 py-4 space-y-4">
      <h2 className="text-lg font-bold text-slate-800">Settings</h2>

      {/* Strava connection */}
      <div>
        <h3 className="text-sm font-semibold text-slate-700 mb-2">Strava Integration</h3>
        <StravaConnect
          connected={connected}
          configured={configured}
          loading={loading}
          athleteName={athleteName}
          onConnect={onConnect}
          onDisconnect={onDisconnect}
        />
      </div>

      {/* Garmin connection */}
      <div>
        <h3 className="text-sm font-semibold text-slate-700 mb-2">Garmin Integration</h3>
        <p className="text-xs text-slate-400 mb-2">
          HRV, resting HR, sleep quality, and Body Battery for readiness scoring.
        </p>
        <GarminConnect
          connected={garminConnected}
          configured={garminConfigured}
          loading={garminLoading}
          error={garminError}
          displayName={garminDisplayName}
          lastSync={garminLastSync}
          onConnect={onGarminConnect}
          onDisconnect={onGarminDisconnect}
          onSync={onGarminSync}
        />
      </div>

      {/* Error display */}
      {error && (
        <div className="bg-red-50 rounded-xl p-3 border border-red-200">
          <p className="text-xs text-red-700">{error}</p>
        </div>
      )}

      {/* Sync controls */}
      {connected && (
        <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-800">Activity Sync</p>
              {lastSync && (
                <p className="text-xs text-slate-500 mt-0.5">
                  Last synced: {new Date(lastSync).toLocaleString()}
                </p>
              )}
            </div>
            <button
              onClick={onSync}
              disabled={loading}
              className="text-xs font-medium px-3 py-1.5 rounded-lg bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50 transition-colors"
            >
              {loading ? 'Syncing...' : 'Sync Now'}
            </button>
          </div>
        </div>
      )}

      {/* App info */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100">
        <h3 className="text-sm font-semibold text-slate-700 mb-2">About</h3>
        <div className="text-xs text-slate-500 space-y-1">
          <p>Broken Arrow 18K Training App</p>
          <p>10-week plan: Apr 13 – Jun 22, 2026</p>
          <p>Race: Friday June 20, 12PM at Palisades Tahoe</p>
        </div>
      </div>
    </div>
  )
}
