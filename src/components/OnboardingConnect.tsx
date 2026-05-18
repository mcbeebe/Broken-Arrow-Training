import { useEffect } from 'react'
import { useGarmin } from '../hooks/useGarmin'
import { useStrava } from '../hooks/useStrava'
import GarminConnect from './GarminConnect'
import StravaConnect from './StravaConnect'

interface Props {
  athleteId: string
  onContinue: () => void
  wearablePreference?: 'garmin' | 'apple_watch' | 'oura' | 'none'
}

export default function OnboardingConnect({ athleteId, onContinue, wearablePreference }: Props) {
  const garmin = useGarmin(athleteId)
  const strava = useStrava(athleteId)

  // Existing users who already connected on a previous session shouldn't be
  // shown this screen again. Auto-dismiss the moment we detect a live
  // connection so they don't have to tap Continue just to dismiss it.
  useEffect(() => {
    if (garmin.connected || strava.connected) {
      onContinue()
    }
  }, [garmin.connected, strava.connected, onContinue])

  // Nothing to offer when neither integration is configured — silently advance
  // so the empty screen doesn't strand the user.
  useEffect(() => {
    if (!garmin.configured && !strava.configured) {
      onContinue()
    }
  }, [garmin.configured, strava.configured, onContinue])

  const continueLabel = garmin.connected || strava.connected ? 'Continue' : 'Skip for now'

  return (
    <div className="fixed inset-0 z-50 bg-white dark:bg-slate-900 flex flex-col">
      <div className="flex-1 overflow-y-auto px-5 pt-8 pb-28">
        <p className="text-xs uppercase tracking-wide font-bold text-teal-700">Last step</p>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white leading-tight mt-1">
          Connect your watch & activities
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-300 mt-2">
          We use your wearable and workout history to score readiness, track
          compliance, and adapt your plan. You can do this later in Settings,
          but the app works best with at least one connection.
        </p>

        {garmin.configured && (
          <section className="mt-6">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xl">⌚</span>
              <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                Garmin Connect
              </h2>
              {wearablePreference === 'garmin' && !garmin.connected && (
                <span className="text-[10px] uppercase tracking-wide font-bold text-teal-700 bg-teal-50 dark:bg-teal-900/40 dark:text-teal-300 px-1.5 py-0.5 rounded">
                  Recommended for you
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
              Pulls heart rate, sleep, HRV, body battery, and recorded workouts.
            </p>
            <GarminConnect
              connected={garmin.connected}
              configured={garmin.configured}
              loading={garmin.loading}
              error={garmin.error}
              displayName={garmin.displayName}
              lastSync={garmin.lastSync}
              mfaRequired={garmin.mfaRequired}
              onConnect={garmin.connect}
              onSubmitMfa={garmin.submitMfa}
              onDisconnect={garmin.disconnect}
              onSync={garmin.sync}
            />
          </section>
        )}

        {strava.configured && (
          <section className="mt-6">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xl">🏃</span>
              <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                Strava
              </h2>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
              Imports your activities so your plan tracks what you actually did.
            </p>
            <StravaConnect
              connected={strava.connected}
              configured={strava.configured}
              loading={strava.loading}
              athleteName={strava.athleteName}
              onConnect={strava.connect}
              onDisconnect={strava.disconnect}
            />
          </section>
        )}

        {!garmin.configured && !strava.configured && (
          <div className="mt-6 bg-amber-50 border border-amber-200 rounded-xl p-4">
            <p className="text-sm text-amber-800">
              Wearable integrations are not configured in this environment.
              You can log workouts manually from the Plan tab.
            </p>
          </div>
        )}

        <p className="text-xs text-slate-400 mt-6">
          You can connect, disconnect, or change devices any time from
          Settings.
        </p>
      </div>

      <div className="fixed bottom-0 left-0 right-0 px-5 py-4 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-700">
        <button
          onClick={onContinue}
          className={`w-full py-3.5 rounded-xl text-base font-semibold transition ${
            garmin.connected || strava.connected
              ? 'bg-teal-600 text-white active:bg-teal-700'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 active:bg-slate-200'
          }`}
        >
          {continueLabel}
        </button>
      </div>
    </div>
  )
}
