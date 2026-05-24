// Web Push helpers shared between the subscribe hook and its tests.
// Pure + side-effect-free so the fiddly base64 → Uint8Array conversion
// (the part of the Push API that silently breaks subscriptions when
// wrong) is unit-testable.

/** VAPID public key (URL-safe base64) from build env. Empty when unset,
 *  which the hook treats as "push not configured on this deploy". */
export function vapidPublicKey(): string {
  return ((import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined) ?? '').trim()
}

/** Convert a URL-safe-base64 VAPID key into the Uint8Array the Push API
 *  wants for `applicationServerKey`. Backed by a concrete ArrayBuffer so
 *  it satisfies the DOM `BufferSource` type. */
export function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const output = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i)
  return output
}

/** IANA timezone for this device (e.g. "America/Los_Angeles"). The
 *  server-side scheduler uses this to fire 6 AM / 1 PM / 8 PM in the
 *  athlete's local time rather than UTC. */
export function deviceTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

/** True only when the browser supports the full push stack. iOS gates
 *  PushManager behind "Add to Home Screen" (installed PWA, 16.4+), so
 *  this returns false in a plain Safari tab. */
export function pushSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    typeof window !== 'undefined' &&
    'PushManager' in window &&
    'Notification' in window
  )
}

/** Serialize a PushSubscription into the plain shape the backend stores
 *  and pywebpush consumes ({ endpoint, keys: { p256dh, auth } }). */
export function serializeSubscription(sub: PushSubscription): {
  endpoint: string
  keys: { p256dh: string; auth: string }
} {
  const json = sub.toJSON()
  return {
    endpoint: sub.endpoint,
    keys: {
      p256dh: json.keys?.p256dh ?? '',
      auth: json.keys?.auth ?? '',
    },
  }
}
