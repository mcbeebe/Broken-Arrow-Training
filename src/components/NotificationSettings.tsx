import { usePushNotifications } from '../hooks/usePushNotifications'

/**
 * Settings surface for coach push notifications. Lets the athlete enable
 * briefings, send a test push to verify delivery on this device, and
 * turn it off. Renders graceful guidance when push isn't available
 * (e.g. not yet added to the Home Screen on iOS).
 */
export default function NotificationSettings({ athleteId }: { athleteId: string }) {
  const push = usePushNotifications(athleteId)

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-medium text-slate-800 dark:text-slate-100">Coach briefings</p>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          Get a push when your coach posts the morning (6 AM), midday (1 PM), and evening (8 PM) read — even when the app is closed.
        </p>
      </div>

      {!push.supported && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          To get notifications on iPhone, open this app in Safari → Share → <span className="font-medium">Add to Home Screen</span>, then reopen it from the new icon. (Requires iOS 16.4+.)
        </p>
      )}
      {push.supported && !push.configured && (
        <p className="text-xs text-amber-600 dark:text-amber-400">Push isn’t configured on this deployment yet.</p>
      )}

      {push.supported && push.configured && (
        <div className="flex flex-wrap gap-2">
          {!push.subscribed ? (
            <button
              onClick={push.enable}
              disabled={push.busy}
              className="text-sm px-3 py-1.5 rounded-lg bg-teal-600 text-white font-medium disabled:opacity-50"
            >
              {push.busy ? 'Enabling…' : 'Enable notifications'}
            </button>
          ) : (
            <>
              <button
                onClick={push.sendTest}
                disabled={push.busy}
                className="text-sm px-3 py-1.5 rounded-lg bg-teal-600 text-white font-medium disabled:opacity-50"
              >
                {push.busy ? 'Sending…' : 'Send test notification'}
              </button>
              <button
                onClick={push.disable}
                disabled={push.busy}
                className="text-sm px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 font-medium disabled:opacity-50"
              >
                Turn off
              </button>
            </>
          )}
        </div>
      )}

      {push.supported && push.permission === 'denied' && (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Notifications are blocked for this app in your device settings — enable them there to receive briefings.
        </p>
      )}
      {push.testResult && <p className="text-xs text-green-600 dark:text-green-400">{push.testResult}</p>}
      {push.error && <p className="text-xs text-rose-600 dark:text-rose-400">{push.error}</p>}
    </div>
  )
}
