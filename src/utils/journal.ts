import type { PlannedDay } from '../types'

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
