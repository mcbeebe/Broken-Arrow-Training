/**
 * Initiative 003: public/sw.js after the app moved to /app/.
 *
 * The worker stays at /sw.js (scope `/`, so existing push subscriptions
 * survive), but a notification tap must reach the app: focusing the first
 * open window could pick a landing or tools tab that ignores the message.
 */
import { describe, it, expect, vi } from 'vitest'
import swSource from '../../../public/sw.js?raw'

type Handler = (event: unknown) => void

interface FakeClient {
  url: string
  focus: ReturnType<typeof vi.fn>
  postMessage: ReturnType<typeof vi.fn>
}

function loadWorker(clientUrls: string[]) {
  const handlers: Record<string, Handler> = {}
  const clients: FakeClient[] = clientUrls.map(url => ({
    url,
    focus: vi.fn(() => Promise.resolve()),
    postMessage: vi.fn(),
  }))
  const openWindow = vi.fn(() => Promise.resolve())
  const showNotification = vi.fn(() => Promise.resolve())
  const self = {
    addEventListener: (type: string, fn: Handler) => {
      handlers[type] = fn
    },
    skipWaiting: vi.fn(),
    clients: { matchAll: vi.fn(() => Promise.resolve(clients)), claim: vi.fn(), openWindow },
    registration: { showNotification },
  }
  new Function('self', swSource)(self)
  return { handlers, clients, openWindow, showNotification }
}

async function click(handlers: Record<string, Handler>, data?: { url?: string }) {
  let done: Promise<unknown> = Promise.resolve()
  handlers.notificationclick({
    notification: { close: vi.fn(), data },
    waitUntil: (p: Promise<unknown>) => {
      done = p
    },
  })
  await done
}

async function push(handlers: Record<string, Handler>, payload: Record<string, unknown>) {
  let done: Promise<unknown> = Promise.resolve()
  handlers.push({
    data: { json: () => payload },
    waitUntil: (p: Promise<unknown>) => {
      done = p
    },
  })
  await done
}

describe('sw.js notificationclick', () => {
  it('focuses the /app/ client, not a root-page client listed first', async () => {
    const { handlers, clients, openWindow } = loadWorker([
      'https://attune.coach/?home=1',
      'https://attune.coach/app/?view=today#mike',
    ])
    await click(handlers, { url: '/app/?view=coach' })
    expect(clients[0].focus).not.toHaveBeenCalled()
    expect(clients[0].postMessage).not.toHaveBeenCalled()
    expect(clients[1].postMessage).toHaveBeenCalledWith({ type: 'NOTIFICATION_CLICK', view: 'coach' })
    expect(clients[1].focus).toHaveBeenCalled()
    expect(openWindow).not.toHaveBeenCalled()
  })

  it('opens a new window when only a /tools/ tab is open', async () => {
    const { handlers, clients, openWindow } = loadWorker(['https://attune.coach/tools/heat.html'])
    await click(handlers, { url: '/app/?view=coach' })
    expect(clients[0].focus).not.toHaveBeenCalled()
    expect(openWindow).toHaveBeenCalledWith('/app/?view=coach')
  })

  it('opens the app on Coach by default when the notification has no url', async () => {
    const { handlers, openWindow } = loadWorker([])
    await click(handlers, undefined)
    expect(openWindow).toHaveBeenCalledWith('/app/?view=coach')
  })

  it('does not treat a path that merely starts with "/app" as the app', async () => {
    const { handlers, clients, openWindow } = loadWorker(['https://attune.coach/apple.html'])
    await click(handlers, { url: '/app/?view=coach' })
    expect(clients[0].focus).not.toHaveBeenCalled()
    expect(openWindow).toHaveBeenCalled()
  })

  it('opens a window when a client url cannot be parsed', async () => {
    const { handlers, openWindow } = loadWorker(['not a url'])
    await click(handlers, { url: '/app/?view=coach' })
    expect(openWindow).toHaveBeenCalledWith('/app/?view=coach')
  })
})

describe('sw.js push', () => {
  it('defaults the click target to /app/?view=coach', async () => {
    const { handlers, showNotification } = loadWorker([])
    await push(handlers, { title: 't', body: 'b' })
    expect(showNotification).toHaveBeenCalledWith(
      't',
      expect.objectContaining({ data: { url: '/app/?view=coach' } }),
    )
  })

  it('keeps a url the server sent', async () => {
    const { handlers, showNotification } = loadWorker([])
    await push(handlers, { url: '/?view=coach' })
    expect(showNotification).toHaveBeenCalledWith(
      'Coach',
      expect.objectContaining({ data: { url: '/?view=coach' } }),
    )
  })
})
