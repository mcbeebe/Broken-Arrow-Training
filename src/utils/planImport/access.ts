import { coachApiAvailable } from '../coachApi'

/**
 * Who may upload their own plan (initiative 004, D8): the owner while it is
 * in beta, and only where the coach API is there to read it. Both ways in,
 * Settings' "Upload my own plan" and onboarding's "I already have a plan",
 * ask this. The server has its own gate (`PLAN_IMPORT_OPEN` /
 * `PLAN_IMPORT_ATHLETES`); opening uploads to everyone changes both.
 */
export function planImportOpenTo(athleteId: string | undefined): boolean {
  return athleteId === 'mike' && coachApiAvailable()
}
