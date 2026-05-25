import { useCallback, useEffect, useState } from 'react'
import { coachApiBase } from '../utils/coachApi'
import {
  pushSupported,
  vapidPublicKey,
  urlBase64ToUint8Array,
  deviceTimezone,
  serializeSubscription,
} from '../utils/push'

// The three daily briefing periods (local hours): 6 AM, 1 PM, 8 PM.
// Sent to the server so the scheduler knows when to fire for this device.
const PERIODS = [6, 13, 20]

/**
 * Manages the Web Push subscription lifecycle for coach briefings:
 * register the service worker, request permission, subscribe with the
 * VAPID key, and register the subscription + device timezone with the
 * backend. Also exposes a one-tap test push so the athlete can verify
 * delivery on their own device.
 */
export function usePushNotifications(athleteId: string) {
  const supported = pushSupported()
  const configured = !!vapidPublicKey()
  const [permission, setPermission] = useState<NotificationPermission>(
    supported ? Notification.permission : 'denied',
  )
  const [subscribed, setSubscribed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<string | null>(null)

  // Reflect any existing subscription so the UI shows the right state on
  // open (e.g. already enabled on this device from a prior session).
  useEffect(() => {
    if (!supported) return
    let cancelled = false
    ;(async () => {
      try {
        const reg = await navigator.serviceWorker.ready
        const sub = await reg.pushManager.getSubscription()
        if (!cancelled) setSubscribed(!!sub)
      } catch {
        /* ignore */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [supported])

  const post = useCallback(
    async (bodyObj: Record<string, unknown>) => {
      const base = coachApiBase()
      if (!base) throw new Error('Coach API URL is not set on this deployment.')
      const res = await fetch(`${base}/api/coach/push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ athleteId, ...bodyObj }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((data as { error?: string }).error || `request failed (${res.status})`)
      return data as Record<string, unknown>
    },
    [athleteId],
  )

  const enable = useCallback(async () => {
    setError(null)
    setTestResult(null)
    if (!supported) {
      setError('This device doesn’t support push. On iPhone, add the app to your Home Screen first (Share → Add to Home Screen).')
      return
    }
    if (!configured) {
      setError('Push isn’t configured on this deployment yet.')
      return
    }
    setBusy(true)
    try {
      const perm = await Notification.requestPermission()
      setPermission(perm)
      if (perm !== 'granted') {
        setError('Notifications permission was not granted.')
        return
      }
      const reg = await navigator.serviceWorker.register('/sw.js')
      await navigator.serviceWorker.ready
      let sub = await reg.pushManager.getSubscription()
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublicKey()),
        })
      }
      await post({
        action: 'subscribe',
        subscription: serializeSubscription(sub),
        timezone: deviceTimezone(),
        periods: PERIODS,
      })
      setSubscribed(true)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }, [supported, configured, post])

  const disable = useCallback(async () => {
    setError(null)
    setTestResult(null)
    setBusy(true)
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      const endpoint = sub?.endpoint
      if (sub) await sub.unsubscribe()
      try {
        await post({ action: 'unsubscribe', endpoint })
      } catch {
        /* server cleanup best-effort */
      }
      setSubscribed(false)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }, [post])

  const sendTest = useCallback(async () => {
    setError(null)
    setTestResult(null)
    setBusy(true)
    try {
      const data = await post({ action: 'test' })
      const sent = Number(data.sent ?? 0)
      setTestResult(
        sent > 0
          ? `Sent to ${sent} device${sent === 1 ? '' : 's'} — check your lock screen.`
          : 'Server accepted it but no device received it.',
      )
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }, [post])

  return { supported, configured, permission, subscribed, busy, error, testResult, enable, disable, sendTest }
}
