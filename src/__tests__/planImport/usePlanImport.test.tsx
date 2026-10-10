import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, act, cleanup } from '@testing-library/react'
import { usePlanImport, type PlanImportDeps } from '../../hooks/usePlanImport'

/**
 * Initiative 004, PR 7: onboarding holds a read across steps, so the hook is
 * held to "gone means gone": once the screen using it goes away, nothing it
 * started may send a request, since every request spends one of the day's
 * uploads.
 */

afterEach(() => { cleanup(); vi.restoreAllMocks() })

const photo = () => new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])], 'IMG_0412.jpg', { type: 'image/jpeg' })

/** A photo that takes its time to re-encode, as a big Word file does to
 *  unzip. `started` resolves once the hook is waiting on it. */
function slowResize() {
  let finish: () => void = () => {}
  let begun: () => void = () => {}
  const started = new Promise<void>(r => { begun = r })
  const resize: PlanImportDeps['resize'] = () => new Promise(r => {
    finish = () => r({ base64: 'SlBFRw==', mediaType: 'image/jpeg', bytes: 4 })
    begun()
  })
  return { resize, started, finish: () => finish() }
}

describe('usePlanImport after its screen is gone', () => {
  it('a read still being prepared sends nothing', async () => {
    const fetchImpl = vi.fn()
    const { resize, started, finish } = slowResize()
    const { result, unmount } = renderHook(() => usePlanImport({
      fetchImpl: fetchImpl as unknown as typeof fetch, base: 'https://api.example.test', headers: {}, resize,
    }))
    let pending: Promise<void> = Promise.resolve()
    act(() => { pending = result.current.read({ file: photo(), hint: '' }) })
    expect(result.current.state.step).toBe('reading')
    await started
    unmount()
    finish()
    await pending
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('a request in flight is aborted', async () => {
    let signal: AbortSignal | undefined
    const fetchImpl = vi.fn((_url: string, init: RequestInit) => {
      signal = init.signal ?? undefined
      return new Promise<Response>(() => {})
    })
    const { result, unmount } = renderHook(() => usePlanImport({
      fetchImpl: fetchImpl as unknown as typeof fetch, base: 'https://api.example.test', headers: {},
    }))
    act(() => { void result.current.read({ text: 'Week 1\nTue easy 4', hint: '' }) })
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1))
    expect(signal?.aborted).toBe(false)
    unmount()
    expect(signal?.aborted).toBe(true)
  })

  it('while mounted, the same slow read does send', async () => {
    const fetchImpl = vi.fn(() => new Promise<Response>(() => {}))
    const { resize, started, finish } = slowResize()
    const { result } = renderHook(() => usePlanImport({
      fetchImpl: fetchImpl as unknown as typeof fetch, base: 'https://api.example.test', headers: {}, resize,
    }))
    act(() => { void result.current.read({ file: photo(), hint: '' }) })
    await started
    finish()
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1))
  })
})
