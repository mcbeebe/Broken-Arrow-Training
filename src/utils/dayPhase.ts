/**
 * Which half of the ritual Today is in.
 *
 * The day has two moments that matter: the morning, where the app answers
 * "am I good to go?", and the close, where the day gets resolved and
 * tomorrow gets staged. Both are anchored to hours the athlete declared,
 * never to a constant — see P7 for why that matters to anyone who does
 * not wake at six.
 *
 * A wrapped window is a real case, not a curiosity: an athlete whose day
 * starts at 2pm closes it after midnight. Getting that wrong shows the
 * wrong half of the ritual for hours at a time, and the Evening Close has
 * no second card behind it to catch the mistake — hence the exhaustive
 * clock matrix in the tests.
 */

export type DayPhase = 'morning' | 'evening'

export interface PhaseWindow {
  /** Hour the athlete's day begins (0–23). */
  morningHour: number
  /** Hour the close begins (0–23). */
  eveningHour: number
}

export function dayPhase(now: Date, window: PhaseWindow): DayPhase {
  const h = now.getHours()
  const { morningHour, eveningHour } = window

  // Ordinary window: wake at 7, close at 20. The close runs from the close
  // hour to midnight and no further.
  //
  // It deliberately does NOT run backwards into the small hours. An athlete
  // awake at 7:47 with their day declared to start at 8 is holding their
  // phone to find out about today, not to be handed last night's close for
  // a day that has not happened yet — and once midnight passes, the day the
  // close was about is over. Before the declared wake the honest answer is
  // that today's answer is simply ready early.
  if (eveningHour > morningHour) {
    return h >= eveningHour ? 'evening' : 'morning'
  }

  // Wrapped window: wake at 14, close at 02. Here the close genuinely does
  // cross midnight — it began before it — so it runs from 02 until the next
  // wake, and the hours between are evening while the rest is day.
  if (eveningHour < morningHour) {
    return h >= eveningHour && h < morningHour ? 'evening' : 'morning'
  }

  // Degenerate: both hours the same. There is no evening to speak of, so
  // the morning stands rather than flickering between the two.
  return 'morning'
}

/** Hours until the close, for the lights-out line. Null once it has passed. */
export function hoursUntilClose(now: Date, window: PhaseWindow): number | null {
  if (dayPhase(now, window) === 'evening') return null
  const h = now.getHours()
  const delta = window.eveningHour - h
  return delta > 0 ? delta : delta + 24
}
