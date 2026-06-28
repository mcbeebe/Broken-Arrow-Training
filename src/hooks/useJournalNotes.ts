import { useState, useCallback, useEffect, useMemo } from 'react'
import type { JournalNote } from '../types'
import { stampKey } from '../utils/syncStamps'

/**
 * Free-standing journal entries — reflections the athlete writes that aren't
 * tied to a completed workout. Stored exactly like `useManualLog`: a single
 * keyed-collection blob in localStorage (`ba_journal_notes_<id>`) that the
 * sync layer unions across devices (see `isMergeableCollectionKey`) so notes
 * written on a phone and a laptop both survive.
 *
 * Deletes are SOFT (a `deleted: true` tombstone kept in the blob) rather than
 * key removals: the cross-device union-merge layers the server's copy back in,
 * so a hard delete on one device would be resurrected by another that still
 * holds the entry. The tombstone rides through the merge and the feed filters
 * it out.
 */

const STORAGE_KEY = 'ba_journal_notes'

interface JournalNoteMap {
  [id: string]: JournalNote
}

function loadNotes(athleteId: string): JournalNoteMap {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY}_${athleteId}`)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    // Plain object only; anything else (legacy / corrupt) starts clean.
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as JournalNoteMap
    }
  } catch {
    // unparseable — fall through to empty
  }
  return {}
}

function saveNotes(athleteId: string, notes: JournalNoteMap): void {
  const key = `${STORAGE_KEY}_${athleteId}`
  localStorage.setItem(key, JSON.stringify(notes))
  stampKey(key)
}

/** Stable, collision-resistant id. `crypto.randomUUID` where available,
 *  else a time+random fallback (both fine in app runtime). */
function newId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID()
    }
  } catch {
    // fall through
  }
  return `jn_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

export interface AddJournalNoteInput {
  text: string
  mood?: number
  energy?: number
  /** ISO timestamp for the entry; defaults to now. */
  dateISO?: string
}

export type JournalNotePatch = Partial<Pick<JournalNote, 'text' | 'mood' | 'energy' | 'dateISO'>>

export interface JournalNotesApi {
  /** Visible (non-deleted) notes, newest first. */
  notes: JournalNote[]
  /** Create a note and return it (so the caller can share it with the coach). */
  addNote: (input: AddJournalNoteInput) => JournalNote
  updateNote: (id: string, patch: JournalNotePatch) => void
  /** Soft delete — keeps a tombstone so cross-device merge can't resurrect it. */
  deleteNote: (id: string) => void
}

export function useJournalNotes(athleteId: string): JournalNotesApi {
  const [map, setMap] = useState<JournalNoteMap>(() => loadNotes(athleteId))

  // Re-read on cross-device sync pulls (synthetic `storage` events).
  useEffect(() => {
    const watched = `${STORAGE_KEY}_${athleteId}`
    function onStorage(e: StorageEvent) {
      if (e.key !== watched) return
      setMap(loadNotes(athleteId))
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [athleteId])

  const addNote = useCallback((input: AddJournalNoteInput): JournalNote => {
    const now = new Date().toISOString()
    const note: JournalNote = {
      id: newId(),
      dateISO: input.dateISO || now,
      text: input.text.trim(),
      mood: input.mood,
      energy: input.energy,
      createdAt: now,
      updatedAt: now,
    }
    setMap(prev => {
      const next = { ...prev, [note.id]: note }
      saveNotes(athleteId, next)
      return next
    })
    return note
  }, [athleteId])

  const updateNote = useCallback((id: string, patch: JournalNotePatch) => {
    setMap(prev => {
      const existing = prev[id]
      if (!existing) return prev
      const next = {
        ...prev,
        [id]: { ...existing, ...patch, updatedAt: new Date().toISOString() },
      }
      saveNotes(athleteId, next)
      return next
    })
  }, [athleteId])

  const deleteNote = useCallback((id: string) => {
    setMap(prev => {
      const existing = prev[id]
      if (!existing) return prev
      const next = {
        ...prev,
        [id]: { ...existing, deleted: true, updatedAt: new Date().toISOString() },
      }
      saveNotes(athleteId, next)
      return next
    })
  }, [athleteId])

  // Newest first by entry date, tie-broken by creation time so two entries
  // dated the same day keep a stable, intuitive order.
  const notes = useMemo(
    () =>
      Object.values(map)
        .filter(n => !n.deleted && n.text?.trim())
        .sort((a, b) => {
          const byDate = (b.dateISO || '').localeCompare(a.dateISO || '')
          return byDate !== 0 ? byDate : (b.createdAt || '').localeCompare(a.createdAt || '')
        }),
    [map],
  )

  return { notes, addNote, updateNote, deleteNote }
}
