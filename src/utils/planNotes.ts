/**
 * P14 — plan notes: the honest things the engine has to say about how a plan
 * was built.
 *
 * These are advisories, and they used to open the Today page — all of them,
 * every day, forever. A generated half-marathon plan produced seven, so the
 * first thing an athlete saw each morning was a seven-high stack of caveats
 * about a decision they made weeks ago.
 *
 * Not one of them changes what to do in the next hour, which is the only
 * test Today applies. They are true, they matter, and they belong on Plan —
 * next to the thing they describe. Today keeps a single row that says how
 * many there are and goes quiet once they have been read, in the same
 * grammar as the Coach ledger row.
 *
 * "Read" is deliberately keyed to the SET of notes, not to a flag: regenerate
 * the plan and get a different set, and the row comes back. Nothing about a
 * new plan is covered by having read the old plan's notes.
 */
import type { PlanAdvisory } from '../types'

const KEY = (athleteId: string | null | undefined) => `ba_plan_notes_seen_${athleteId ?? 'me'}`

const RANK: Record<PlanAdvisory['severity'], number> = { critical: 0, caution: 1, info: 2 }

/**
 * Most serious first, stable within a severity so the engine's own ordering
 * survives. Never mutates the input — the caller's array is shared state.
 */
export function sortNotes(notes: PlanAdvisory[]): PlanAdvisory[] {
  return notes
    .map((n, i) => ({ n, i }))
    .sort((a, b) => RANK[a.n.severity] - RANK[b.n.severity] || a.i - b.i)
    .map(({ n }) => n)
}

/**
 * A stable fingerprint of WHICH notes these are. Order-insensitive, because
 * a re-sort is not a new set of things to say.
 */
export function notesSignature(notes: PlanAdvisory[]): string {
  return [...new Set(notes.map(n => n.id))].sort().join('|')
}

/** Have these exact notes already been read? An empty set is nothing to read. */
export function notesSeen(athleteId: string | null | undefined, notes: PlanAdvisory[]): boolean {
  if (notes.length === 0) return true
  try {
    return localStorage.getItem(KEY(athleteId)) === notesSignature(notes)
  } catch {
    // No storage: treat as unread. Showing the row twice is a smaller failure
    // than silently swallowing a critical note about the plan.
    return false
  }
}

/** Record that this exact set has been read. */
export function markNotesSeen(athleteId: string | null | undefined, notes: PlanAdvisory[]): void {
  try {
    localStorage.setItem(KEY(athleteId), notesSignature(notes))
  } catch { /* storage unavailable — the row simply asks again */ }
}

/** Clear the record, so the notes ask to be read again. For tests and resets. */
export function clearNotesSeen(athleteId: string | null | undefined): void {
  try {
    localStorage.removeItem(KEY(athleteId))
  } catch { /* nothing to clear */ }
}

/**
 * The Today row's sentence. Counts, and names the sharpest severity present,
 * so a critical note is not flattened into the same word as a footnote.
 */
export function notesRowText(notes: PlanAdvisory[]): string {
  const n = notes.length
  const thing = `${n} thing${n === 1 ? '' : 's'}`
  if (notes.some(a => a.severity === 'critical')) {
    return `Your plan has ${thing} to flag — ${n === 1 ? 'one is' : 'some are'} serious`
  }
  return `Your plan has ${thing} worth knowing`
}

/**
 * Does Today show the notes row?
 *
 * Only when there is something to say and it has not been said. Kept out of
 * the JSX so the rule can be argued with directly: a plan with no notes is
 * silence, and a plan whose notes have been read is silence too.
 */
export function shouldShowNotesRow(notes: PlanAdvisory[], seen: boolean): boolean {
  return notes.length > 0 && !seen
}
