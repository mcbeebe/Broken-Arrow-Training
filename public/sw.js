/* Broken Arrow Training service worker.
 *
 * Handles Web Push delivery + notification taps. The server sends an
 * encrypted JSON payload { title, body, url, tag }; we render it
 * directly so there's no authenticated fetch from the worker context.
 *
 * On iOS (16.4+, installed PWA) the system bridges these pushes through
 * APNs, so they arrive even when the app is closed.
 */

self.addEventListener('install', () => {
  // Activate this worker immediately rather than waiting for all tabs
  // to close — push handling should come online on first load.
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch (e) {
    data = {}
  }
  const title = data.title || 'Coach'
  const body = data.body || 'You have a new note from Coach.'
  const url = data.url || '/?view=coach'
  const tag = data.tag || 'coach-insight'
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag,
      renotify: true,
      icon: '/favicon.svg',
      badge: '/favicon.svg',
      data: { url },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/?view=coach'
  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if ('focus' in client) {
            // App is already open — tell it to jump to the Coach tab,
            // then focus the window.
            client.postMessage({ type: 'NOTIFICATION_CLICK', view: 'coach' })
            return client.focus()
          }
        }
        if (self.clients.openWindow) return self.clients.openWindow(url)
        return undefined
      }),
  )
})
