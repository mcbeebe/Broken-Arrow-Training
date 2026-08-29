/**
 * Dismissing a calibration suggestion is a SNOOZE, never a blacklist.
 *
 * "Not now" used to append the sport to `dismissedSuggestions` forever, so
 * one tap permanently silenced a whole class of coaching — even as the
 * evidence behind it kept getting stronger. A snooze expires; the engine
 * gets to ask again if it still has a case.
 */

export const SNOOZE_DAYS = 30
const DAY_MS = 24 * 60 * 60 * 1000

export interface SnoozedSuggestion {
  sport: string
  /** Epoch ms after which the suggestion may be offered again. */
  until: number
}

export function snoozeUntil(now: number = Date.now()): number {
  return now + SNOOZE_DAYS * DAY_MS
}

/**
 * Legacy stores hold a plain string[] of permanent dismissals. Rather than
 * resurfacing everything the athlete ever waved away the moment they
 * update, each becomes a snooze running from now — so old dismissals fade
 * out instead of either lasting forever or all firing at once.
 */
export function migrateLegacyDismissals(
  legacy: string[] | undefined,
  now: number = Date.now(),
): SnoozedSuggestion[] {
  if (!legacy?.length) return []
  const until = snoozeUntil(now)
  return legacy.map(sport => ({ sport, until }))
}

/** The sports still inside their snooze window. Expired entries are simply
 *  absent, which is what lets a suggestion come back on its own. */
export function activeSnoozes(
  snoozed: SnoozedSuggestion[] | undefined,
  now: number = Date.now(),
): Set<string> {
  return new Set((snoozed ?? []).filter(s => s.until > now).map(s => s.sport))
}

/** Add or extend a snooze, dropping any entry that has already expired so
 *  the list cannot grow without bound. */
export function withSnooze(
  snoozed: SnoozedSuggestion[] | undefined,
  sport: string,
  now: number = Date.now(),
): SnoozedSuggestion[] {
  const kept = (snoozed ?? []).filter(s => s.until > now && s.sport !== sport)
  return [...kept, { sport, until: snoozeUntil(now) }]
}
