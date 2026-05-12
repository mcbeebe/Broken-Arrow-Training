import { useState } from 'react'
import StravaConnect from './StravaConnect'
import GarminConnect from './GarminConnect'
import HRZoneEditor from './HRZoneEditor'
import type { AuthSession } from '../utils/auth'
import type { ThemeMode } from '../hooks/useTheme'
import AboutMe from './AboutMe'
import CoachDiagnostics from './CoachDiagnostics'
import DeployDiagnostics from './DeployDiagnostics'
import Methodology from './Methodology'
import type { HRZone, PendingInference, CoachPersona } from '../types'
import type { MIMOverride } from '../hooks/useMIMCalibration'
import { SPORT_LABELS } from '../hooks/useMIMCalibration'
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
  hrZonesMaxHRCustomized?: boolean
  onSaveHRZones?: (zones: HRZone[], maxHR: number) => void
  onResetHRZones?: () => void
  // Cache management
  onClearCache?: () => void
  onClearAll?: () => void
  // Onboarding reset — restarts the onboarding flow so the athlete can
  // pick a new target race after finishing their current one.
  onResetOnboarding?: () => void
  setView?: (v: string) => void
  // Auth
  authSession?: AuthSession | null
  onLogout?: () => void
  // Theme
  themeMode?: ThemeMode
  onSetThemeMode?: (mode: ThemeMode) => void
  // MIM Calibration
  mimOverrides?: MIMOverride[]
  mimLastCalibrated?: string
  onSetMIMManual?: (sport: string, value: number | null) => void
  onResetMIM?: (sport: string) => void
  onRecalibrateMIM?: () => string
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
  hrZonesMaxHRCustomized,
  onSaveHRZones,
  onResetHRZones,
  onClearCache,
  onClearAll,
  onResetOnboarding,
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
  authSession,
  onLogout,
  themeMode,
  onSetThemeMode,
  mimOverrides,
  mimLastCalibrated,
  onSetMIMManual,
  onResetMIM,
  onRecalibrateMIM,
}: SettingsProps) {
  void _pendingInferences
  void _onAcceptInference
  void _onDismissInference
  return (
    <div className="px-2 py-3 space-y-3">
      <h2 className="text-xl font-bold text-slate-800 dark:text-white">Settings</h2>

      {/* Error display */}
      {error && (
        <div className="bg-red-50 rounded-xl p-3 border border-red-200">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* ── Account section ── */}
      {authSession && onLogout && (
        <SettingsSection title="Account" defaultOpen>
          <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100 space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-teal-100 flex items-center justify-center text-teal-700 font-bold text-lg">
                {(authSession.name || authSession.email)[0]?.toUpperCase()}
              </div>
              <div>
                <p className="text-sm font-medium text-slate-800">{authSession.name || authSession.athleteId}</p>
                <p className="text-xs text-slate-500">{authSession.email}</p>
              </div>
            </div>
            <button
              onClick={onLogout}
              className="w-full text-sm font-medium px-4 py-2 rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
            >
              Sign Out
            </button>
          </div>
        </SettingsSection>
      )}

      {/* ── Appearance section ── */}
      {onSetThemeMode && (
        <SettingsSection title="Appearance" defaultOpen>
          <div className="bg-white dark:bg-slate-800 rounded-xl p-4 shadow-sm border border-slate-100 dark:border-slate-700">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">Theme</p>
            <div className="flex gap-1 bg-slate-100 dark:bg-slate-700 rounded-lg p-0.5">
              {([['light', 'Light'], ['dark', 'Dark'], ['auto', 'Auto']] as const).map(([value, label]) => (
                <button
                  key={value}
                  onClick={() => onSetThemeMode(value)}
                  className={`flex-1 text-xs font-medium py-2 rounded-md transition-colors ${
                    themeMode === value
                      ? 'bg-white dark:bg-slate-600 text-slate-800 dark:text-white shadow-sm'
                      : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {value === 'light' ? '☀️ ' : value === 'dark' ? '🌙 ' : '⚙️ '}{label}
                </button>
              ))}
            </div>
            {themeMode === 'auto' && (
              <p className="text-[10px] text-slate-400 mt-2">Follows your device's system setting</p>
            )}
          </div>
        </SettingsSection>
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
            <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">Garmin</h4>
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
            maxHRCustomized={!!hrZonesMaxHRCustomized}
            onSave={onSaveHRZones}
            onReset={onResetHRZones}
          />
        </SettingsSection>
      )}

      {/* ── Grading Rubric section ── */}
      <SettingsSection title="Grading Rubric">
        <div className="bg-white dark:bg-slate-800 rounded-xl p-4 shadow-sm border border-slate-100 dark:border-slate-700 space-y-4">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Each workout is graded on distance, duration, and heart rate zone compliance. Grades appear as colored indicators on the compliance grid and day cards.
          </p>

          <div>
            <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wide mb-2">Distance & Duration</p>
            <div className="space-y-1.5">
              <GradeRow color="#22c55e" label="On Target" desc="Within ±10% of planned" />
              <GradeRow color="#eab308" label="Close" desc="Within ±20% of planned" />
              <GradeRow color="#ef4444" label="Missed" desc="More than 20% short" />
              <GradeRow color="#3b82f6" label="Over" desc="More than 20% above planned" />
              <GradeRow color="#d1d5db" label="Skipped" desc="Planned workout, no activity logged" />
              <GradeRow color="#f1f5f9" label="No Target" desc="Rest day or target not applicable" />
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wide mb-2">Heart Rate Zone Compliance</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
              Measured as percentage of workout time spent in the prescribed HR zone (with ±3 bpm tolerance).
            </p>
            <div className="space-y-1.5">
              <GradeRow color="#22c55e" label="On Target" desc="≥75% of time in target zone" />
              <GradeRow color="#eab308" label="Close" desc="50–75% of time in target zone" />
              <GradeRow color="#ef4444" label="Missed (Flagged)" desc="Less than 50% of time in target zone" />
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wide mb-2">Overall Compliance</p>
            <div className="space-y-1.5 text-xs text-slate-600 dark:text-slate-400">
              <p><span className="font-medium text-slate-700 dark:text-slate-300">Completion %</span> — workouts completed vs. planned (excludes rest days)</p>
              <p><span className="font-medium text-slate-700 dark:text-slate-300">Distance %</span> — actual miles vs. planned miles across all workouts</p>
              <p><span className="font-medium text-slate-700 dark:text-slate-300">HR in Zone %</span> — average time-in-zone across all HR-checked workouts</p>
              <p><span className="font-medium text-slate-700 dark:text-slate-300">Duration %</span> — actual moving time vs. planned time</p>
              <p><span className="font-medium text-slate-700 dark:text-slate-300">Flagged</span> — workouts with any major miss (distance, duration, or HR)</p>
            </div>
          </div>

          <div className="bg-slate-50 dark:bg-slate-700 rounded-lg p-3">
            <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">How HR zone is calculated</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              Per-second heart rate data from your watch is compared against the planned zone. Each second where your HR falls within the target range (±3 bpm tolerance) counts as "in zone." The percentage is total in-zone seconds divided by total workout seconds. A ±3 bpm tolerance accounts for watch sensor variability.
            </p>
          </div>
        </div>
      </SettingsSection>

      {/* ── Training Methodology section ── */}
      <SettingsSection title="Training Methodology">
        <Methodology zones={hrZones} />
      </SettingsSection>

      {/* ── MIM Calibration ── */}
      {mimOverrides && mimOverrides.length > 0 && (
        <SettingsSection title="Training Load Multipliers (MIM)">
          <MIMTable
            overrides={mimOverrides}
            lastCalibrated={mimLastCalibrated}
            onSetManual={onSetMIMManual}
            onReset={onResetMIM}
            onRecalibrate={onRecalibrateMIM}
          />
        </SettingsSection>
      )}

      {/* ── Diagnostics (owner-only) ── */}
      {coachEnabled && athleteId === 'mike' && (
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

      {/* ── Training Plan section ── */}
      {onResetOnboarding && (
        <SettingsSection title="Training Plan">
          <div className="bg-white dark:bg-slate-800 rounded-xl p-4 shadow-sm border border-slate-100 dark:border-slate-700 space-y-3">
            <div>
              <p className="text-sm font-medium text-slate-800 dark:text-slate-100">Redo Onboarding</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                Finished your target race? Start a fresh onboarding to pick a new race, distance, and training method. Your activity history stays intact.
              </p>
            </div>
            <button
              onClick={() => {
                if (confirm('This will clear your current race goal and training method, then take you back to onboarding. Your synced activities and HR data are preserved. Continue?')) {
                  onResetOnboarding()
                }
              }}
              className="text-sm font-medium px-3 py-1.5 rounded-lg bg-teal-100 text-teal-700 hover:bg-teal-200 dark:bg-teal-900 dark:text-teal-200 dark:hover:bg-teal-800 transition-colors"
            >
              Redo Onboarding
            </button>
          </div>
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

function GradeRow({ color, label, desc }: { color: string; label: string; desc: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: color }} />
      <span className="text-xs font-medium text-slate-700 dark:text-slate-300 w-20 shrink-0">{label}</span>
      <span className="text-xs text-slate-500 dark:text-slate-400">{desc}</span>
    </div>
  )
}

function MIMTable({ overrides, lastCalibrated, onSetManual, onReset, onRecalibrate }: {
  overrides: MIMOverride[]
  lastCalibrated?: string
  onSetManual?: (sport: string, value: number | null) => void
  onReset?: (sport: string) => void
  onRecalibrate?: () => string
}) {
  const [editing, setEditing] = useState<string | null>(null)
  const [editVal, setEditVal] = useState('')
  const [editOriginal, setEditOriginal] = useState('')
  const [calibrateMsg, setCalibrateMsg] = useState<string | null>(null)

  // Both manual and calibrated entries bypass the dynamic per-workout
  // formula (calibrated only matters for sports without one — e.g. running,
  // strength). Surface the count of either so the user can wipe all stored
  // calibration in a single tap.
  const overrideCount = overrides.filter(
    o => o.manual !== null || o.calibrated !== o.defaultMIM,
  ).length

  function clearAllOverrides() {
    if (!onReset) return
    for (const o of overrides) {
      if (o.manual !== null || o.calibrated !== o.defaultMIM) {
        onReset(o.sport)
      }
    }
  }

  function commitEdit(sport: string) {
    const v = parseFloat(editVal)
    // Only persist if the value actually changed from the original — prevents
    // accidental override-locking when the user just taps a row to inspect.
    if (editVal !== editOriginal && !isNaN(v) && v >= 0 && v <= 5) {
      onSetManual?.(sport, v)
    }
    setEditing(null)
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-500 dark:text-slate-400">
        The Musculoskeletal Impact Modifier (MIM) scales raw Garmin EPOC into actual training stress per sport.
        Cycling, mountain biking, and hiking now compute MIM <em>per workout</em> from intensity factor (cycling)
        or grade (hiking) instead of a fixed default. Other sports use a static lookup. Tap any value to override manually.
      </p>
      {overrideCount > 0 && (
        <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-900 rounded-lg px-2.5 py-1.5 flex items-center justify-between gap-2">
          <p className="text-[11px] text-amber-800 dark:text-amber-200 leading-snug">
            <span className="font-semibold">{overrideCount}</span> manual override{overrideCount === 1 ? '' : 's'} active —
            these bypass the per-workout formula. Clear if you want the engine to compute MIM dynamically again.
          </p>
          <button
            onClick={clearAllOverrides}
            className="shrink-0 text-[10px] font-medium text-amber-700 dark:text-amber-200 underline hover:text-amber-900 dark:hover:text-white"
          >
            Clear all
          </button>
        </div>
      )}
      {lastCalibrated && (
        <p className="text-[10px] text-slate-400">Last calibrated: {lastCalibrated}</p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-700">
              <th className="text-left py-1.5 text-slate-500 dark:text-slate-400 font-semibold">Activity</th>
              <th className="text-left py-1.5 text-slate-500 dark:text-slate-400 font-semibold">Engine</th>
              <th className="text-right py-1.5 text-slate-500 dark:text-slate-400 font-semibold w-20" title="Average MIM the engine actually applied across your last 30 days of activities">Recent</th>
              <th className="text-right py-1.5 text-slate-500 dark:text-slate-400 font-semibold w-20" title="Manual override — always wins over the engine">Override</th>
              <th className="w-8"></th>
            </tr>
          </thead>
          <tbody>
            {overrides.map(o => {
              const isManual = o.manual !== null
              const isDynamic = o.engine !== 'static'
              const isEditing = editing === o.sport
              const baseline = o.recentAvgMIM ?? o.defaultMIM
              const overrideDrift = isManual ? ((o.manual! - baseline) / baseline) * 100 : 0
              const engineCellClass = isDynamic
                ? 'text-violet-600 dark:text-violet-300 font-medium'
                : 'text-slate-500 dark:text-slate-400'
              const engineLabel = isDynamic
                ? o.formulaLabel
                : o.defaultMIM.toFixed(2)
              const engineTitle = isDynamic
                ? `Per-workout formula. Typical range ${o.typicalRange ? o.typicalRange[0].toFixed(1) + '–' + o.typicalRange[1].toFixed(1) + '×' : 'varies'}.`
                : 'Static lookup applied to every workout for this sport.'
              return (
                <tr key={o.sport} className="border-b border-slate-100 dark:border-slate-700">
                  <td className="py-1.5 text-slate-700 dark:text-slate-200">{SPORT_LABELS[o.sport] || o.sport}</td>
                  <td className={`py-1.5 ${engineCellClass}`} title={engineTitle}>
                    {engineLabel}
                  </td>
                  <td className="text-right text-slate-600 dark:text-slate-300 font-mono">
                    {o.recentAvgMIM !== null ? (
                      <span title={`${o.recentSampleCount} session${o.recentSampleCount === 1 ? '' : 's'} in last 30d`}>
                        {o.recentAvgMIM.toFixed(2)}
                        <span className="text-[9px] text-slate-400 ml-0.5">×{o.recentSampleCount}</span>
                      </span>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                  <td className="text-right">
                    {isEditing ? (
                      <input
                        autoFocus
                        type="number"
                        step="0.05"
                        className="w-16 text-right text-xs border border-teal-300 rounded px-1 py-0.5"
                        value={editVal}
                        onChange={e => setEditVal(e.target.value)}
                        onBlur={() => commitEdit(o.sport)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                          if (e.key === 'Escape') setEditing(null)
                        }}
                      />
                    ) : (
                      <button
                        onClick={() => {
                          const initial = (o.manual ?? o.recentAvgMIM ?? o.defaultMIM).toFixed(2)
                          setEditing(o.sport)
                          setEditVal(initial)
                          setEditOriginal(initial)
                        }}
                        className={`font-mono ${isManual ? 'text-amber-700 dark:text-amber-300 font-bold' : 'text-slate-300 hover:text-slate-500'}`}
                        title={isManual ? 'Manual override — bypasses the engine. Tap × to clear.' : 'Tap to set a manual override'}
                      >
                        {isManual ? (
                          <>
                            <span className="mr-0.5">⚠️</span>
                            {o.manual!.toFixed(2)}
                            {Math.abs(overrideDrift) >= 1 && (
                              <span className={`ml-0.5 text-[9px] ${overrideDrift > 0 ? 'text-red-400' : 'text-green-500'}`}>
                                {overrideDrift > 0 ? '+' : ''}{overrideDrift.toFixed(0)}%
                              </span>
                            )}
                          </>
                        ) : (
                          'set…'
                        )}
                      </button>
                    )}
                  </td>
                  <td className="text-center">
                    {isManual && (
                      <button
                        onClick={() => onReset?.(o.sport)}
                        className="text-[9px] text-slate-400 hover:text-red-500"
                        title="Clear manual override"
                      >
                        ×
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between pt-1">
        <div className="flex gap-2 text-[9px] text-slate-400 flex-wrap">
          <span><span className="text-violet-600 dark:text-violet-300 font-medium">Violet</span> = per-workout formula</span>
          <span><span className="text-amber-700 dark:text-amber-300 font-bold">⚠️ Amber</span> = manual override (bypasses engine)</span>
        </div>
        {onRecalibrate && (
          <button
            onClick={() => {
              const msg = onRecalibrate()
              setCalibrateMsg(msg || 'Done.')
              setTimeout(() => setCalibrateMsg(null), 5000)
            }}
            className="text-[10px] text-teal-600 hover:text-teal-700 font-medium"
          >
            Recalibrate now
          </button>
        )}
      </div>
      {calibrateMsg && (
        <p className="text-[10px] text-teal-700 dark:text-teal-400 bg-teal-50 dark:bg-teal-950 rounded px-2 py-1 mt-1">{calibrateMsg}</p>
      )}

      <details className="mt-2 border border-slate-200 dark:border-slate-700 rounded-lg">
        <summary className="cursor-pointer text-xs font-medium text-slate-600 dark:text-slate-300 px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg">
          How these formulas work
        </summary>
        <div className="px-3 pb-3 pt-1 space-y-2 text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
          <p className="text-slate-500 dark:text-slate-400">
            Every multiplier is anchored to <strong>1.0× = flat running</strong>. So 0.65× cycling means a cycling
            minute is ~65% as musculoskeletally taxing as a flat-running minute at the same heart-rate cost.
          </p>

          <div>
            <p className="font-semibold text-slate-700 dark:text-slate-200">Intensity Factor (IF)</p>
            <p>
              How hard the ride felt relative to your threshold. Power-meter rides use{' '}
              <code className="px-1 rounded bg-slate-100 dark:bg-slate-700 font-mono">IF = NormalizedPower / FTP</code>.
              Without power, the engine falls back to heart-rate reserve{' '}
              <code className="px-1 rounded bg-slate-100 dark:bg-slate-700 font-mono">(avgHR − restHR) / (maxHR − restHR)</code>.
              Typical range 0.5 (recovery) to 1.1 (over-threshold).
            </p>
          </div>

          <div>
            <p className="font-semibold text-slate-700 dark:text-slate-200">Cycling MIM &nbsp;<span className="font-mono text-violet-600 dark:text-violet-300">= 0.4 + 0.4 · IF²</span></p>
            <p>
              Knee-joint compression rises roughly with the square of normalized power
              (<a href="https://pubmed.ncbi.nlm.nih.gov/23346556/" target="_blank" rel="noopener noreferrer" className="text-teal-600 dark:text-teal-400 underline">D'Lima 2013</a>;
              {' '}<a href="https://pubmed.ncbi.nlm.nih.gov/3728780/" target="_blank" rel="noopener noreferrer" className="text-teal-600 dark:text-teal-400 underline">Ericson &amp; Nisell 1986/87</a>),
              while flat-run vGRF peaks around 2.5× bodyweight (Nilsson &amp; Thorstensson 1989). Easy spinning ≈ 0.5×,
              steady Z2 ≈ 0.6×, threshold ≈ 0.8×, sprint ≈ 1.0×.
            </p>
            <p className="mt-1 text-slate-500 dark:text-slate-400">
              Mountain biking adds a <strong>×1.2 rough-terrain bump</strong> on top to account for impact and brief
              eccentric loads the smooth-road formula doesn't model.
            </p>
          </div>

          <div>
            <p className="font-semibold text-slate-700 dark:text-slate-200">Hiking MIM &nbsp;<span className="font-mono text-violet-600 dark:text-violet-300">= costWalk(grade) / costRun(0)</span></p>
            <p>
              Walking energy cost from Minetti's polynomial, divided by flat-running cost. <strong>Grade</strong> is
              signed elevation gain over horizontal distance ({' '}
              <code className="px-1 rounded bg-slate-100 dark:bg-slate-700 font-mono">elev_gain_ft / (distance_mi × 5280)</code>;
              0.10 = +10%, −0.05 = −5%). Reference points from{' '}
              <a href="https://pubmed.ncbi.nlm.nih.gov/12183501/" target="_blank" rel="noopener noreferrer" className="text-teal-600 dark:text-teal-400 underline">Minetti et al. 2002</a>:
            </p>
            <table className="text-[10px] mt-1 ml-2 font-mono">
              <tbody>
                <tr><td className="pr-3 text-slate-400">−10% (descent)</td><td>0.31×</td></tr>
                <tr><td className="pr-3 text-slate-400">flat</td><td>0.69×</td></tr>
                <tr><td className="pr-3 text-slate-400">+10%</td><td>1.36×</td></tr>
                <tr><td className="pr-3 text-slate-400">+20% (steep)</td><td>2.19×</td></tr>
                <tr><td className="pr-3 text-slate-400">+30%</td><td>3.11×</td></tr>
                <tr><td className="pr-3 text-slate-400">+45% (scramble)</td><td>4.89×</td></tr>
              </tbody>
            </table>
            <p className="mt-1 text-slate-500 dark:text-slate-400">
              Above ~+20% grade walking is more economical than running — that's why elite skyrunners power-hike
              the steepest sections.
            </p>
          </div>

          <div>
            <p className="font-semibold text-slate-700 dark:text-slate-200">Static lookup</p>
            <p>
              Sports without a research-backed dynamic formula (running, strength, swimming, etc.) use a fixed
              lookup applied to every workout for that sport. E-bike stays static at 0.30× because pedal-assist
              makes IF unreliable as a muscular-load proxy.
            </p>
          </div>

          <div>
            <p className="font-semibold text-slate-700 dark:text-slate-200">Manual override</p>
            <p>
              Always wins over the engine. Tap a value in the Override column to set your own. Use this when your
              own perception of load disagrees with the model — your tuned number is what we'll use everywhere
              (chart bars, ATL/CTL, coach insights).
            </p>
          </div>
        </div>
      </details>
    </div>
  )
}

function SettingsSection({ title, children, defaultOpen = false }: {
  title: string; children: React.ReactNode; defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
      >
        <h3 className="text-sm font-semibold text-slate-800 dark:text-white">{title}</h3>
        <span className="text-sm text-teal-600 dark:text-teal-400">{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <div className="px-3 pb-3 border-t border-slate-100 dark:border-slate-700 pt-2">
          {children}
        </div>
      )}
    </div>
  )
}
