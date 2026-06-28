import type { PlannedDay, JournalNote } from '../types'

/**
 * Frame a workout journal note as a coach message. The leading workout
 * identity + actual stats give the coach the planned-vs-actual context it
 * needs to analyze the note (and to attach any learned facts to the right
 * session), while the athlete's own words carry the reflection.
 *
 * Shared by every surface that shares a journal note with the coach (the
 * inline journal on the workout modal + the log editor) so the coach sees a
 * consistent debrief shape regardless of where the note was written.
 */
export function buildJournalSeed(day: PlannedDay, note: string): string {
  const a = day.actual
  const bits: string[] = []
  if (a?.distance) bits.push(`${a.distance.toFixed(2)}mi`)
  if (a?.movingTime) bits.push(`${Math.round(a.movingTime / 60)}min`)
  if (a?.avgHR) bits.push(`avg HR ${a.avgHR}`)
  const stats = bits.length ? ` (${bits.join(' · ')})` : ''
  return `Workout journal — ${day.workout} on ${day.day}${stats}. Here's how it went: ${note.trim()}`
}

/**
 * Frame a free-standing journal entry (one NOT tied to a workout) as a coach
 * message. There's no planned-vs-actual context, so the date plus any
 * self-reported mood/energy lead, then the athlete's words. Mirrors
 * `buildJournalSeed` so the coach sees a consistent "journal" shape whether
 * the reflection came from a workout or a standalone entry.
 */
export function buildStandaloneJournalSeed(note: JournalNote): string {
  const date = (note.dateISO || '').slice(0, 10) || 'today'
  const bits: string[] = []
  if (note.mood) bits.push(`mood ${note.mood}/5`)
  if (note.energy) bits.push(`energy ${note.energy}/5`)
  const meta = bits.length ? ` (${bits.join(' · ')})` : ''
  return `Journal entry — ${date}${meta}. ${note.text.trim()}`
}
