import type { CheckinState } from '../hooks/useCheckin'

function formatSent(at: number): string {
  const d = new Date(at)
  return d.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

/**
 * Settings → Notifications: the Sunday/Wednesday Coach check-in email
 * (initiative 005). One switch and a "Send a test now" button. Renders
 * nothing for athletes the email isn't open to.
 */
export default function CheckinEmailSettings({ checkin }: { checkin: CheckinState }) {
  if (!checkin.available) return null
  const { enabled, busy } = checkin

  return (
    <div className="space-y-3 pt-4 mt-4 border-t border-slate-100 dark:border-slate-700">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p id="checkin-email-label" className="text-sm font-medium text-slate-800 dark:text-slate-100">Coach check-in email</p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Sunday and Wednesday at 6 AM: how the week is going, your last 2 weeks, the next 2 weeks and what’s further ahead.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-labelledby="checkin-email-label"
          disabled={busy || checkin.loading}
          onClick={() => { void checkin.setEnabled(!enabled) }}
          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${enabled ? 'bg-teal-600' : 'bg-slate-300 dark:bg-slate-600'}`}
        >
          <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
        </button>
      </div>

      {enabled && (
        <>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Sent to <span className="font-medium text-slate-700 dark:text-slate-200">{checkin.email}</span>
            {checkin.lastSent ? <> · last sent {formatSent(checkin.lastSent.at)}{checkin.lastSent.test ? ' (test)' : ''}</> : null}
          </p>
          <button
            type="button"
            onClick={() => { void checkin.sendTest() }}
            disabled={busy}
            className="text-sm px-3 py-1.5 rounded-lg bg-teal-600 text-white font-medium disabled:opacity-50"
          >
            {busy ? 'Sending…' : 'Send a test now'}
          </button>
        </>
      )}

      {checkin.message && <p role="status" className="text-xs text-green-600 dark:text-green-400">{checkin.message}</p>}
      {checkin.error && <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">{checkin.error}</p>}
    </div>
  )
}
