import { coachApiAvailable } from '../coachApi'

/**
 * Who gets the Coach check-in email (initiative 005, D2): the owner while it
 * is new, and only where the coach API is there to send it. The server has
 * its own gate (`CHECKIN_ATHLETES`, `api/coach/_checkin.checkin_allowed`);
 * opening the email to anyone else changes both.
 */
export function checkinOpenTo(athleteId: string | undefined): boolean {
  return athleteId === 'mike' && coachApiAvailable()
}
