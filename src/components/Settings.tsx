import StravaConnect from './StravaConnect'
import GarminConnect from './GarminConnect'
import HRZoneEditor from './HRZoneEditor'
import type { HRZone, ViewId } from '../types'

interface SettingsProps {
  setView?: (v: ViewId) => void
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
  garminMfaRequired: boolean
  garminDisplayName: string | null
  garminLastSync: string | null
  onGarminConnect: (email: string, password: string) => Promise<void>
  onGarminSubmitMfa: (code: string) => Promise<void>
  onGarminDisconnect: () => void
  onGarminSync: () => Promise<void>
  // HR Zones
  hrZones?: HRZone[]
  hrZonesCustomized?: boolean
  hrZonesMaxHR?: number
  onSaveHRZones?: (zones: HRZone[]) => void
  onResetHRZones?: () => void
  // Cache management
  onClearCache?: () => void
  onClearAll?: () => void
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
  garminMfaRequired,
  garminDisplayName,
  garminLastSync,
  onGarminConnect,
  onGarminSubmitMfa,
  onGarminDisconnect,
  onGarminSync,
  hrZones,
  hrZonesCustomized,
  hrZonesMaxHR,
  onSaveHRZones,
  onResetHRZones,
  onClearCache,
  onClearAll,
  setView,
}: SettingsProps) {
  return (
    <div className="px-4 py-4 space-y-4">
      <h2 className="text-lg font-bold text-slate-800">Settings</h2>

      {/* Coach preview — temporary entry point for design review.
          Remove once the real Coach feature ships. */}
      {setView && (
        <button
          onClick={() => setView('coach-preview')}
          className="w-full bg-gradient-to-r from-indigo-500 to-teal-500 text-white px-4 py-3 rounded-xl text-left"
        >
          <p className="text-[10px] font-semibold uppercase tracking-wider opacity-80">Design preview</p>
          <p className="text-sm font-bold">🤖 Coach — visual mockup</p>
          <p className="text-xs opacity-90">Tap to preview the planned Coach UI. Not wired to a real model yet.</p>
        </button>
      )}

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
          mfaRequired={garminMfaRequired}
          displayName={garminDisplayName}
          lastSync={garminLastSync}
          onConnect={onGarminConnect}
          onSubmitMfa={onGarminSubmitMfa}
          onDisconnect={onGarminDisconnect}
          onSync={onGarminSync}
        />
      </div>

      {/* HR Zones (Uphill Athlete defaults from plan, customizable) */}
      {hrZones && onSaveHRZones && onResetHRZones && (
        <HRZoneEditor
          zones={hrZones}
          isCustomized={!!hrZonesCustomized}
          maxHR={hrZonesMaxHR ?? 0}
          onSave={onSaveHRZones}
          onReset={onResetHRZones}
        />
      )}

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

      {/* Cache management */}
      {(onClearCache || onClearAll) && (
        <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100 space-y-3">
          <h3 className="text-sm font-semibold text-slate-700">Data Management</h3>
          <p className="text-xs text-slate-500">
            If you're seeing stale data, clear the cache and re-sync. This forces the app to fetch fresh data from Strava and Garmin.
          </p>
          <div className="flex gap-2">
            {onClearCache && (
              <button
                onClick={() => {
                  onClearCache()
                  window.location.reload()
                }}
                className="text-xs font-medium px-3 py-1.5 rounded-lg bg-amber-100 text-amber-700 hover:bg-amber-200 transition-colors"
              >
                Clear Cache & Reload
              </button>
            )}
            {onClearAll && (
              <button
                onClick={() => {
                  if (confirm('This will sign you out of Strava and Garmin. Continue?')) {
                    onClearAll()
                    window.location.reload()
                  }
                }}
                className="text-xs font-medium px-3 py-1.5 rounded-lg bg-red-100 text-red-700 hover:bg-red-200 transition-colors"
              >
                Clear All & Sign Out
              </button>
            )}
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
          <p className="text-slate-400">Engine: ATE v2 (EPOC + Banister fallback)</p>
        </div>
      </div>
    </div>
  )
}
