import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mergeCollection, isMergeableCollectionKey } from '../utils/syncMerge'

/**
 * Regression for the "I typed a journal entry on my computer but it never
 * showed up on my phone" report.
 *
 * `ba_manual_logs_<id>` is a single JSON object `{ [dayLabel]: ActualWorkout }`
 * holding every workout note. It used to sync last-write-wins at the whole-key
 * level, so when two devices each held notes the other lacked, whichever
 * pushed last erased the other's entries. The fix unions the blob on pull.
 */

interface Row { value: string; updatedAt: string }

function makeServer() {
  const table = new Map<string, Row>()
  const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
    const method = (init?.method || 'GET').toUpperCase()
    if (method === 'GET') {
      const items = [...table.entries()].map(([key, r]) => ({ key, value: r.value, updatedAt: r.updatedAt }))
      const body = { items, serverNow: new Date().toISOString() }
      return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) } as Response
    }
    // PUT — LWW upsert (matches api/sync.py: update only when strictly newer)
    const parsed = JSON.parse(init!.body as string) as { items: Array<{ key: string; value: string; updatedAt: string }> }
    let written = 0, skipped = 0
    for (const it of parsed.items) {
      const cur = table.get(it.key)
      if (!cur || Date.parse(cur.updatedAt) < Date.parse(it.updatedAt)) {
        table.set(it.key, { value: it.value, updatedAt: it.updatedAt })
        written++
      } else skipped++
    }
    const body = { written, skipped }
    return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) } as Response
  })
  return { table, fetchImpl }
}

const session = { token: 'tok', athleteId: 'mike' } as never
const KEY = 'ba_manual_logs_mike'

async function loadSync() {
  vi.stubEnv('VITE_GARMIN_API_URL', 'https://api.test')
  return import('../utils/backendSync')
}

describe('mergeCollection (manual-logs union)', () => {
  it('flags manual-logs keys as mergeable, scalar keys as not', () => {
    expect(isMergeableCollectionKey('ba_manual_logs_mike')).toBe(true)
    expect(isMergeableCollectionKey('ba_manual_logs:mike')).toBe(true)
    expect(isMergeableCollectionKey('ba_onboarding_mike')).toBe(false)
    expect(isMergeableCollectionKey('ba_theme')).toBe(false)
  })

  it('unions distinct entries from both sides', () => {
    const local = JSON.stringify({ a: { notes: 'A' } })
    const server = JSON.stringify({ b: { notes: 'B' } })
    const m = mergeCollection(local, server, false)!
    expect(JSON.parse(m.value)).toEqual({ a: { notes: 'A' }, b: { notes: 'B' } })
    expect(m.changed).toBe(true)
  })

  it('keeps local on conflict when local is newer; takes server when server is newer', () => {
    const local = JSON.stringify({ a: { notes: 'local' } })
    const server = JSON.stringify({ a: { notes: 'server' } })
    expect(JSON.parse(mergeCollection(local, server, false)!.value)).toEqual({ a: { notes: 'local' } })
    expect(JSON.parse(mergeCollection(local, server, true)!.value)).toEqual({ a: { notes: 'server' } })
  })

  it('reports changed=false when the server adds nothing new', () => {
    const local = JSON.stringify({ a: { notes: 'A' }, b: { notes: 'B' } })
    const server = JSON.stringify({ a: { notes: 'A' } })
    expect(mergeCollection(local, server, false)!.changed).toBe(false)
  })

  it('falls back to LWW (returns null) for non-object shapes', () => {
    expect(mergeCollection('[]', '[]', false)).toBeNull()
    expect(mergeCollection('{"a":1}', 'not json', false)).toBeNull()
  })
})

describe('journal note cross-device sync', () => {
  beforeEach(() => { localStorage.clear(); vi.resetModules() })
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

  it('note typed on a computer reaches a phone that already had the (note-less) logs', async () => {
    const { table, fetchImpl } = makeServer()
    vi.stubGlobal('fetch', fetchImpl)
    const { pushAll, hydrateFromServer } = await loadSync()
    const { stampKey } = await import('../utils/syncStamps')

    const T0 = 1_700_000_000_000
    const oldBlob = JSON.stringify({ 'Thu 6/11': { notes: 'old note' } })
    table.set(KEY, { value: oldBlob, updatedAt: new Date(T0).toISOString() })

    // Computer adds a note for Fri 6/12 and pushes.
    const newBlob = JSON.stringify({ 'Thu 6/11': { notes: 'old note' }, 'Fri 6/12': { notes: 'Legs felt strong' } })
    localStorage.setItem(KEY, newBlob)
    stampKey(KEY, T0 + 60_000)
    await pushAll(session)

    // Phone comes online with its prior (note-less) copy and hydrates.
    localStorage.clear()
    localStorage.setItem(KEY, oldBlob)
    stampKey(KEY, T0)
    await hydrateFromServer(session)

    expect(JSON.parse(localStorage.getItem(KEY)!)['Fri 6/12']?.notes).toBe('Legs felt strong')
  })

  it('divergent logs on two devices both survive — neither erases the other', async () => {
    const { table, fetchImpl } = makeServer()
    vi.stubGlobal('fetch', fetchImpl)
    const { pushAll, hydrateFromServer } = await loadSync()
    const { stampKey } = await import('../utils/syncStamps')

    const T0 = 1_700_000_000_000
    table.set(KEY, { value: JSON.stringify({ 'Thu 6/11': { notes: 'old' } }), updatedAt: new Date(T0).toISOString() })

    // Phone logs its OWN workout (Sat 6/13) and pushes.
    localStorage.setItem(KEY, JSON.stringify({ 'Thu 6/11': { notes: 'old' }, 'Sat 6/13': { notes: 'phone workout' } }))
    stampKey(KEY, T0 + 30_000)
    await pushAll(session)

    // Computer, working from the older blob it last saw, journals Fri 6/12
    // and pushes. Under the old whole-blob LWW this erased the phone's entry.
    localStorage.clear()
    localStorage.setItem(KEY, JSON.stringify({ 'Thu 6/11': { notes: 'old' }, 'Fri 6/12': { notes: 'Legs felt strong' } }))
    stampKey(KEY, T0 + 60_000)
    await pushAll(session)

    // Phone hydrates, then pushes the merged union back.
    localStorage.clear()
    localStorage.setItem(KEY, JSON.stringify({ 'Thu 6/11': { notes: 'old' }, 'Sat 6/13': { notes: 'phone workout' } }))
    stampKey(KEY, T0 + 30_000)
    await hydrateFromServer(session)
    await pushAll(session)

    const phone = JSON.parse(localStorage.getItem(KEY)!)
    expect(phone['Fri 6/12']?.notes).toBe('Legs felt strong')
    expect(phone['Sat 6/13']?.notes).toBe('phone workout')

    // The server now holds the union, so the computer converges too.
    localStorage.clear()
    localStorage.setItem(KEY, JSON.stringify({ 'Thu 6/11': { notes: 'old' }, 'Fri 6/12': { notes: 'Legs felt strong' } }))
    stampKey(KEY, T0 + 60_000)
    await hydrateFromServer(session)
    const computer = JSON.parse(localStorage.getItem(KEY)!)
    expect(computer['Fri 6/12']?.notes).toBe('Legs felt strong')
    expect(computer['Sat 6/13']?.notes).toBe('phone workout')
  })
})
