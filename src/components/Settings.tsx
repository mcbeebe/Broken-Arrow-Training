import { useState } from 'react'
import StravaConnect from './StravaConnect'
import GarminConnect from './GarminConnect'
import HRZoneEditor from './HRZoneEditor'
import AboutMe from './AboutMe'
import CoachDiagnostics from './CoachDiagnostics'
import DeployDiagnostics from './DeployDiagnostics'
import Methodology from './Methodology'
import type { HRZone, PendingInference, CoachPersona } from '../types'
import CoachPersonaEditor from './CoachPersonaEditor'

interface SettingsProps {
  // Coach (Mike-only for now)
  coachEnabled?: boolean
  aboutMeText?: string
  onSaveAboutMe?: (next: string) => void
  onClearAboutMe?: () => void
  pendingInferences?: PendingInference[]
  onAcceptInference?: (id: string) => void
  onDismissInference?: (id: string) => void
  coachPersona?: CoachPersona
  onSaveCoachPersona?: (p: CoachPersona) => void
  athleteId?: string
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
  setView?: (v: string) => void
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
  coachEnabled,
  aboutMeText,
  onSaveAboutMe,
  onClearAboutMe,
  pendingInferences: _pendingInferences,
  onAcceptInference: _onAcceptInference,
  onDismissInference: _onDismissInference,
  coachPersona,
  onSaveCoachPersona,
  athleteId,
}: SettingsProps) {
  void _pendingInferences
  void _onAcceptInference
  void _onDismissInference
  return (
    <div className="px-4 py-4 space-y-4">
      <h2 className="text-xl font-bold text-slate-800">Settings</h2>

      {/* Error display */}
      {error && (
        <div className="bg-red-50 rounded-xl p-3 border border-red-200">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* ── Coach section ── */}
      {coachEnabled && onSaveAboutMe && onClearAboutMe && (
        <SettingsSection title="Coach" defaultOpen>
          <div className="space-y-4">
            <AboutMe
              value={aboutMeText ?? ''}
              onSave={onSaveAboutMe}
              onClear={onClearAboutMe}
            />
            {onSaveCoachPersona && (
              <CoachPersonaEditor
                persona={coachPersona ?? { name: '', traits: [] }}
                onSave={onSaveCoachPersona}
              />
            )}
          </div>
        </SettingsSection>
      )}

      {/* ── Integrations section ── */}
      <SettingsSection title="Integrations" defaultOpen>
        <div className="space-y-4">
          <div>
            <h4 className="text-sm font-semibold text-slate-700 mb-2">Strava</h4>
            <StravaConnect
              connected={connected}
              configured={configured}
              loading={loading}
              athleteName={athleteName}
              onConnect={onConnect}
              onDisconnect={onDisconnect}
            />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-slate-700 mb-2">Garmin</h4>
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
        </div>
      </SettingsSection>

      {/* ── HR Zones section ── */}
      {hrZones && onSaveHRZones && onResetHRZones && (
        <SettingsSection title="Heart Rate Zones">
          <HRZoneEditor
            zones={hrZones}
            isCustomized={!!hrZonesCustomized}
            maxHR={hrZonesMaxHR ?? 0}
            onSave={onSaveHRZones}
            onReset={onResetHRZones}
          />
        </SettingsSection>
      )}

      {/* ── Training Methodology section ── */}
      <SettingsSection title="Training Methodology">
        <Methodology />
      </SettingsSection>

      {/* ── Diagnostics section (owner-only) ── */}
      {coachEnabled && athleteId && (
        <SettingsSection title="Coach Diagnostics">
          <CoachDiagnostics athleteId={athleteId} />
        </SettingsSection>
      )}

      {/* ── Deploy Diagnostics (owner-only, Mike) — shows frontend vs.
          API commit SHAs so you can confirm Vercel has caught up. ── */}
      {athleteId === 'mike' && (
        <SettingsSection title="Deploy Diagnostics">
          <DeployDiagnostics />
        </SettingsSection>
      )}

      {/* ── Data Management section ── */}
      {(onClearCache || onClearAll) && (
        <SettingsSection title="Data Management">
          <div className="space-y-3">
            <p className="text-sm text-slate-500">
              Clear the cache and re-sync to fetch fresh data from Strava and Garmin.
            </p>
            <div className="flex gap-2">
              {onClearCache && (
                <button
                  onClick={() => {
                    onClearCache()
                    window.location.reload()
                  }}
                  className="text-sm font-medium px-3 py-1.5 rounded-lg bg-amber-100 text-amber-700 hover:bg-amber-200 transition-colors"
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
                  className="text-sm font-medium px-3 py-1.5 rounded-lg bg-red-100 text-red-700 hover:bg-red-200 transition-colors"
                >
                  Clear All & Sign Out
                </button>
              )}
            </div>
          </div>
        </SettingsSection>
      )}

      {/* App info */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100">
        <h3 className="text-sm font-semibold text-slate-700 mb-2">About</h3>
        <div className="text-sm text-slate-500 space-y-1">
          <p>Broken Arrow 18K Training App</p>
          <p>10-week plan: Apr 13 – Jun 21, 2026</p>
          <p>Race: Friday June 19, 12PM at Palisades Tahoe</p>
          <p className="text-slate-400">Engine: ATE v2 (EPOC + Banister fallback)</p>
        </div>
      </div>
    </div>
  )
}

// ─── Collapsible settings section ───────────────────────────────

function SettingsSection({ title, children, defaultOpen = false }: {
  title: string; children: React.ReactNode; defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-slate-50 transition-colors"
      >
        <h3 className="text-base font-semibold text-slate-800">{title}</h3>
        <span className="text-sm text-teal-600">{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <div className="px-4 pb-4 border-t border-slate-100 pt-3">
          {children}
        </div>
      )}
    </div>
  )
}
