/**
 * The inline fallback in the root index.html. Installed apps open at `/`;
 * if the guard module never runs (a chunk failed to load), the page must
 * still reach the app instead of staying blank.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import rootHtml from '../../../index.html?raw'
import { GUARD_RAN_FLAG } from '../../landing/boot'

const match = /<script data-root-fallback>([\s\S]*?)<\/script>/.exec(rootHtml)
const source = match ? match[1] : ''

type Listener = (e: { target?: { tagName?: string }; message?: string }) => void

function load(search = '?view=today', hash = '#mike') {
  const listeners: Listener[] = []
  const win: Record<string, unknown> = {
    addEventListener: (_type: string, fn: Listener) => listeners.push(fn),
  }
  const replace = vi.fn()
  new Function('window', 'location', 'setTimeout', source)(win, { search, hash, replace }, setTimeout)
  const fire = (e: Parameters<Listener>[0]) => listeners.forEach(fn => fn(e))
  return { win, replace, fire }
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('root page inline fallback', () => {
  it('exists, before the module script, and reads the guard flag', () => {
    expect(source).not.toBe('')
    expect(rootHtml.indexOf('data-root-fallback')).toBeLessThan(rootHtml.indexOf('type="module"'))
    expect(source).toContain(GUARD_RAN_FLAG)
  })

  it('does nothing when the guard ran', () => {
    const { win, replace } = load()
    win[GUARD_RAN_FLAG] = true
    vi.advanceTimersByTime(10_000)
    expect(replace).not.toHaveBeenCalled()
  })

  it('forwards with query and hash when the guard never ran', () => {
    const { replace } = load()
    vi.advanceTimersByTime(7_999)
    expect(replace).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(replace).toHaveBeenCalledWith('/app/?view=today#mike')
  })

  it.each(['SCRIPT', 'LINK'])('forwards at once when a %s fails to load, and only once', tagName => {
    const { replace, fire } = load('?view=coach', '')
    fire({ target: { tagName } })
    expect(replace).toHaveBeenCalledWith('/app/?view=coach')
    fire({ target: { tagName } })
    vi.advanceTimersByTime(10_000)
    expect(replace).toHaveBeenCalledTimes(1)
  })

  it('ignores load errors from other elements', () => {
    const { win, replace, fire } = load()
    fire({ target: { tagName: 'IMG' } })
    win[GUARD_RAN_FLAG] = true
    vi.advanceTimersByTime(10_000)
    expect(replace).not.toHaveBeenCalled()
  })

  it('ignores runtime errors, which carry a message', () => {
    const { win, replace, fire } = load()
    fire({ target: { tagName: 'SCRIPT' }, message: 'TypeError: x' })
    win[GUARD_RAN_FLAG] = true
    vi.advanceTimersByTime(10_000)
    expect(replace).not.toHaveBeenCalled()
  })

  it('ignores a load error once the guard ran', () => {
    const { win, replace, fire } = load()
    win[GUARD_RAN_FLAG] = true
    fire({ target: { tagName: 'LINK' } })
    expect(replace).not.toHaveBeenCalled()
  })
})
