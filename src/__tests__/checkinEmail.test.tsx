/**
 * The Coach check-in email's app side (initiative 005): the Settings switch,
 * and the upload that keeps the server's copy of the plan current.
 *
 * Locked here:
 *   - nothing is uploaded until the athlete turns the email on;
 *   - a burst of plan edits uploads once, after they settle;
 *   - a re-render with the same snapshot never re-uploads, and a failed
 *     upload is retried on the next change;
 *   - turning it on uploads straight away, even a snapshot sent before;
 *   - athletes the email isn't open to see nothing and call nothing.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react'
import type { CheckinSnapshot } from '../utils/checkin/snapshot'

const api = {
  fetchCheckinStatus: vi.fn(),
  saveCheckinEnabled: vi.fn(),
  uploadCheckinSnapshot: vi.fn(),
  sendCheckinTest: vi.fn(),
}
vi.mock('../utils/checkin/api', () => ({
  fetchCheckinStatus: (...a: unknown[]) => api.fetchCheckinStatus(...a),
  saveCheckinEnabled: (...a: unknown[]) => api.saveCheckinEnabled(...a),
  uploadCheckinSnapshot: (...a: unknown[]) => api.uploadCheckinSnapshot(...a),
  sendCheckinTest: (...a: unknown[]) => api.sendCheckinTest(...a),
}))
vi.mock('../utils/checkin/access', () => ({
  checkinOpenTo: (id: string | undefined) => id === 'mike',
}))

const { useCheckin, CHECKIN_UPLOAD_DEBOUNCE_MS, STATUS_RETRY_MS } = await import('../hooks/useCheckin')
const { default: CheckinEmailSettings } = await import('../components/CheckinEmailSettings')

function snap(workout = 'Easy run', asOf = '2026-10-11'): CheckinSnapshot {
  return {
    v: 1, asOf, generatedAt: new Date().toISOString(), timezone: 'UTC',
    days: [{ date: asOf, week: 1, type: 'run', workout, detail: '', zone: '', minutes: 45 }],
    weeks: [], race: null, block: null, load: null,
  }
}

const reply = <T,>(body: T, ok = true, status = 200) => Promise.resolve({ ok, status, body })

async function flush() {
  await act(async () => { await Promise.resolve(); await Promise.resolve() })
}

beforeEach(() => {
  vi.useFakeTimers()
  localStorage.clear()
  for (const f of Object.values(api)) f.mockReset()
  api.fetchCheckinStatus.mockImplementation(() => reply({ allowed: true, enabled: true, email: 'mike@example.com', snapshotAsOf: null, lastSent: null }))
  api.uploadCheckinSnapshot.mockImplementation(() => reply({ ok: true, asOf: '2026-10-11' }))
  api.saveCheckinEnabled.mockImplementation((on: boolean) => reply({ ok: true, enabled: on, email: 'mike@example.com' }))
  api.sendCheckinTest.mockImplementation(() => reply({ ok: true, sentAt: 1 }))
})
afterEach(() => { vi.useRealTimers() })

describe('the upload', () => {
  it('uploads once the edits settle, and only once for a burst', async () => {
    const { rerender } = renderHook(({ s }) => useCheckin('mike', s), { initialProps: { s: snap('A') } })
    await flush()
    act(() => { vi.advanceTimersByTime(1000) })
    rerender({ s: snap('B') })
    act(() => { vi.advanceTimersByTime(1000) })
    rerender({ s: snap('C') })
    expect(api.uploadCheckinSnapshot).not.toHaveBeenCalled()
    act(() => { vi.advanceTimersByTime(CHECKIN_UPLOAD_DEBOUNCE_MS) })
    await flush()
    expect(api.uploadCheckinSnapshot).toHaveBeenCalledTimes(1)
    expect(api.uploadCheckinSnapshot.mock.calls[0][0].days[0].workout).toBe('C')
  })

  it('never re-uploads the same snapshot, even from a fresh mount', async () => {
    const first = renderHook(() => useCheckin('mike', snap()))
    await flush()
    act(() => { vi.advanceTimersByTime(CHECKIN_UPLOAD_DEBOUNCE_MS) })
    await flush()
    first.unmount()
    renderHook(() => useCheckin('mike', snap()))
    await flush()
    act(() => { vi.advanceTimersByTime(CHECKIN_UPLOAD_DEBOUNCE_MS * 2) })
    await flush()
    expect(api.uploadCheckinSnapshot).toHaveBeenCalledTimes(1)
  })

  it('retries after a failed upload when the snapshot next changes', async () => {
    api.uploadCheckinSnapshot.mockImplementationOnce(() => reply({ error: 'network' }, false, 0))
    const { rerender } = renderHook(({ s }) => useCheckin('mike', s), { initialProps: { s: snap('A') } })
    await flush()
    act(() => { vi.advanceTimersByTime(CHECKIN_UPLOAD_DEBOUNCE_MS) })
    await flush()
    rerender({ s: snap('B') })
    act(() => { vi.advanceTimersByTime(CHECKIN_UPLOAD_DEBOUNCE_MS) })
    await flush()
    expect(api.uploadCheckinSnapshot).toHaveBeenCalledTimes(2)
  })

  it('uploads nothing while the email is off', async () => {
    api.fetchCheckinStatus.mockImplementation(() => reply({ allowed: true, enabled: false, email: 'mike@example.com' }))
    renderHook(() => useCheckin('mike', snap()))
    await flush()
    act(() => { vi.advanceTimersByTime(CHECKIN_UPLOAD_DEBOUNCE_MS * 2) })
    await flush()
    expect(api.uploadCheckinSnapshot).not.toHaveBeenCalled()
  })

  it('turning it on uploads straight away, even a snapshot this device sent before', async () => {
    const { result } = renderHook(() => useCheckin('mike', snap()))
    await flush()
    act(() => { vi.advanceTimersByTime(CHECKIN_UPLOAD_DEBOUNCE_MS) })
    await flush()
    await act(async () => { await result.current.setEnabled(false) })
    await act(async () => { await result.current.setEnabled(true) })
    act(() => { vi.advanceTimersByTime(CHECKIN_UPLOAD_DEBOUNCE_MS) })
    await flush()
    expect(api.uploadCheckinSnapshot).toHaveBeenCalledTimes(2)
  })

  it('a failed status check at app open is retried, and the upload follows', async () => {
    api.fetchCheckinStatus.mockImplementationOnce(() => reply({ error: 'network' }, false, 0))
    renderHook(() => useCheckin('mike', snap()))
    await flush()
    act(() => { vi.advanceTimersByTime(CHECKIN_UPLOAD_DEBOUNCE_MS) })
    await flush()
    expect(api.uploadCheckinSnapshot).not.toHaveBeenCalled()
    act(() => { vi.advanceTimersByTime(STATUS_RETRY_MS[0]) })
    await flush()
    expect(api.fetchCheckinStatus).toHaveBeenCalledTimes(2)
    act(() => { vi.advanceTimersByTime(CHECKIN_UPLOAD_DEBOUNCE_MS) })
    await flush()
    expect(api.uploadCheckinSnapshot).toHaveBeenCalledTimes(1)
  })

  it('gives up on the status check after the last retry', async () => {
    api.fetchCheckinStatus.mockImplementation(() => reply({ error: 'network' }, false, 0))
    renderHook(() => useCheckin('mike', snap()))
    for (const ms of [0, ...STATUS_RETRY_MS, 3_600_000]) {
      act(() => { vi.advanceTimersByTime(ms) })
      await flush()
    }
    expect(api.fetchCheckinStatus).toHaveBeenCalledTimes(STATUS_RETRY_MS.length + 1)
  })

  it('does nothing at all for an athlete the email is not open to', async () => {
    const { result } = renderHook(() => useCheckin('lori', null))
    await flush()
    act(() => { vi.advanceTimersByTime(CHECKIN_UPLOAD_DEBOUNCE_MS * 2) })
    expect(api.fetchCheckinStatus).not.toHaveBeenCalled()
    expect(api.uploadCheckinSnapshot).not.toHaveBeenCalled()
    expect(result.current.available).toBe(false)
  })
})

describe('Settings', () => {
  function Harness({ id = 'mike' }: { id?: string }) {
    const checkin = useCheckin(id, id === 'mike' ? snap() : null)
    return <CheckinEmailSettings checkin={checkin} />
  }

  it('renders nothing for an athlete the email is not open to', async () => {
    const { container } = render(<Harness id="lori" />)
    await flush()
    expect(container.innerHTML).toBe('')
  })

  it('renders nothing when the server says it is not available', async () => {
    api.fetchCheckinStatus.mockImplementation(() => reply({ allowed: false }))
    const { container } = render(<Harness />)
    await flush()
    expect(container.innerHTML).toBe('')
  })

  it('shows the switch, the address and the test button when on', async () => {
    render(<Harness />)
    await flush()
    const sw = screen.getByRole('switch', { name: 'Coach check-in email' })
    expect(sw.getAttribute('aria-checked')).toBe('true')
    expect(screen.getByText('mike@example.com')).toBeTruthy()
    expect(screen.getByText(/Sunday and Wednesday at 6 AM/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Send a test now' }))
    await flush()
    expect(api.sendCheckinTest).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('status').textContent).toMatch(/Sent to mike@example.com/)
  })

  it('labels a test as a test in "last sent"', async () => {
    api.fetchCheckinStatus.mockImplementation(() => reply({
      allowed: true, enabled: true, email: 'mike@example.com', lastSent: { at: Date.UTC(2026, 9, 11, 13), subject: 's', test: true },
    }))
    render(<Harness />)
    await flush()
    expect(screen.getByText(/last sent .*\(test\)/)).toBeTruthy()
  })

  it('the switch turns it off, and the test button goes with it', async () => {
    render(<Harness />)
    await flush()
    fireEvent.click(screen.getByRole('switch'))
    await flush()
    expect(api.saveCheckinEnabled).toHaveBeenCalledWith(false)
    expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('false')
    expect(screen.queryByRole('button', { name: 'Send a test now' })).toBeNull()
  })

  it('says why a test failed, in words', async () => {
    api.sendCheckinTest.mockImplementation(() => reply({ error: 'no_snapshot' }, false, 404))
    render(<Harness />)
    await flush()
    fireEvent.click(screen.getByRole('button', { name: 'Send a test now' }))
    await flush()
    expect(screen.getByRole('alert').textContent).toMatch(/Nothing to send yet/)
  })
})
