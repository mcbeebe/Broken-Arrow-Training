/**
 * Appending what a calibration taught the coach to the athlete's profile.
 *
 * Accepting a load or recovery calibration does two things: it changes the
 * model, and it writes a sentence into "about me" so the coach can say why
 * it treats this athlete differently. The second half lived inline in the
 * Today card's onClick and was NOT done by the review queue's apply path —
 * so the same proposal accepted from Coach changed the numbers and lost the
 * explanation. Both paths call this now.
 */

/** Existing profile text plus a new line, without leading or doubled blanks. */
export function appendAboutMeNote(existing: string | null | undefined, note: string): string {
  const base = (existing ?? '').trim()
  const add = note.trim()
  if (!add) return base
  if (!base) return add
  // Already said. Repeating it on every re-accept turns the profile into a
  // transcript of the same fact.
  if (base.split('\n').some(line => line.trim() === add)) return base
  return `${base}\n${add}`
}
