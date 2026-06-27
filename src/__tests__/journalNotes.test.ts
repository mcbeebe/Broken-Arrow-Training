import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useJournalNotes } from '../hooks/useJournalNotes'
import { isMergeableCollectionKey, mergeCollection } from '../utils/syncMerge'
import { isPreservedKey } from '../utils/migrate'
import { buildStandaloneJournalSeed } from '../utils/journal'
import type { JournalNote } from '../types'

const KEY = 'ba_journal_notes_mike'

function readStore(): Record<string, JournalNote> {
  return JSON.parse(localStorage.getItem(KEY) || '{}')
}

describe('journal-notes sync allowlists', () => {
  it('marks ba_journal_notes_* as a mergeable collection (both separators)', () => {
    expect(isMergeableCollectionKey('ba_journal_notes_mike')).toBe(true)
    expect(isMergeableCollectionKey('ba_journal_notes:mike')).toBe(true)
    // unrelated keys stay last-write-wins
    expect(isMergeableCollectionKey('ba_onboarding_mike')).toBe(false)
  })

  it('preserves ba_journal_notes_* for migration + backend sync', () => {
    expect(isPreservedKey('ba_journal_notes_mike')).toBe(true)
    expect(isPreservedKey('ba_journal_notes:mike')).toBe(true)
  })
})

describe('buildStandaloneJournalSeed', () => {
  const base: JournalNote = {
    id: '1',
    dateISO: '2026-06-27T12:00:00.000Z',
    text: '  Slept badly, legs heavy  ',
    createdAt: '2026-06-27T12:00:00.000Z',
    updatedAt: '2026-06-27T12:00:00.000Z',
  }

  it('leads with the date and trims the body', () => {
    expect(buildStandaloneJournalSeed(base)).toBe('Journal entry — 2026-06-27. Slept badly, legs heavy')
  })

  it('includes mood + energy when present', () => {
    expect(buildStandaloneJournalSeed({ ...base, mood: 4, energy: 2 })).toBe(
      'Journal entry — 2026-06-27 (mood 4/5 · energy 2/5). Slept badly, legs heavy',
    )
  })
})

describe('useJournalNotes', () => {
  beforeEach(() => localStorage.clear())

  it('adds a note, returns it, and persists to the athlete-scoped key', () => {
    const { result } = renderHook(() => useJournalNotes('mike'))

    let created: JournalNote | undefined
    act(() => {
      created = result.current.addNote({ text: '  felt great today  ', mood: 5 })
    })

    expect(created!.id).toBeTruthy()
    expect(created!.text).toBe('felt great today') // trimmed
    expect(created!.mood).toBe(5)
    expect(result.current.notes).toHaveLength(1)
    // persisted under the keyed-collection blob, keyed by id
    expect(readStore()[created!.id].text).toBe('felt great today')
  })

  it('sorts newest-first by entry date', () => {
    const { result } = renderHook(() => useJournalNotes('mike'))
    act(() => {
      result.current.addNote({ text: 'older', dateISO: '2026-06-20T12:00:00.000Z' })
      result.current.addNote({ text: 'newer', dateISO: '2026-06-25T12:00:00.000Z' })
    })
    expect(result.current.notes.map(n => n.text)).toEqual(['newer', 'older'])
  })

  it('updates text + clears an optional field, bumping updatedAt', () => {
    const { result } = renderHook(() => useJournalNotes('mike'))
    let id = ''
    act(() => {
      id = result.current.addNote({ text: 'first', mood: 3 }).id
    })
    const before = readStore()[id].updatedAt
    act(() => {
      result.current.updateNote(id, { text: 'edited', mood: undefined })
    })
    expect(result.current.notes[0].text).toBe('edited')
    expect(result.current.notes[0].mood).toBeUndefined()
    expect(readStore()[id].updatedAt >= before).toBe(true)
  })

  it('soft-deletes: hidden from the feed but kept as a tombstone in storage', () => {
    const { result } = renderHook(() => useJournalNotes('mike'))
    let id = ''
    act(() => {
      id = result.current.addNote({ text: 'delete me' }).id
    })
    act(() => {
      result.current.deleteNote(id)
    })
    expect(result.current.notes).toHaveLength(0)
    // tombstone survives so cross-device merge can't resurrect it
    expect(readStore()[id].deleted).toBe(true)
  })
})

describe('soft-delete survives a cross-device union merge', () => {
  it('keeps the local tombstone when the server still holds the live entry', () => {
    const local = JSON.stringify({ a: { id: 'a', text: 'x', deleted: true } })
    const server = JSON.stringify({ a: { id: 'a', text: 'x' } })
    // Local is the newer write (the delete), so the union keeps the tombstone.
    const merged = mergeCollection(local, server, /* serverNewer */ false)!
    expect(JSON.parse(merged.value).a.deleted).toBe(true)
  })
})
